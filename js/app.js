/* =====================================================================
   app.js — UI 연결 · 상태 관리 · 필터/정렬/페이지네이션 · 저장(Table API)
   ===================================================================== */
(function (global) {
  'use strict';

  var D = global.HemoData;
  var A = global.HemoAnalytics;
  var C = global.HemoCharts;

  var TABLE_NAME = 'analysis_records';
  var MAX_SAVED_SAMPLES = 200;

  /* ------------------------------------------------------------------
     상태
     ------------------------------------------------------------------ */
  var state = {
    records: [],
    metricKeys: [],
    dataset: null,        // buildDataset 결과
    outlierResult: null,
    summary: null,
    sourceLabel: '데모 데이터셋 (시뮬레이션)',
    zThreshold: 2.5,
    page: 1,
    pageSize: 25,
    filters: { search: '', group: '', status: '', sort: 'id-asc' },
    activeView: 'dashboard'
  };

  var savedRecords = [];

  /* ------------------------------------------------------------------
     유틸
     ------------------------------------------------------------------ */
  function $(selector) { return document.querySelector(selector); }
  function $all(selector) { return Array.prototype.slice.call(document.querySelectorAll(selector)); }

  function escapeHtml(value) {
    if (value === null || value === undefined) return '';
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function fmt(value, decimals) {
    if (value === null || value === undefined || !isFinite(value)) return '–';
    return Number(value).toLocaleString('ko-KR', {
      minimumFractionDigits: decimals === undefined ? 0 : decimals,
      maximumFractionDigits: decimals === undefined ? 2 : decimals
    });
  }

  function toast(message, type) {
    var stack = $('#toast-stack');
    if (!stack) return;
    var el = document.createElement('div');
    el.className = 'toast ' + (type ? 'is-' + type : 'is-info');
    el.textContent = message;
    stack.appendChild(el);
    setTimeout(function () {
      el.style.opacity = '0';
      el.style.transition = 'opacity .3s ease';
      setTimeout(function () { el.remove(); }, 320);
    }, 3600);
  }

  function feedback(el, message, type) {
    if (!el) return;
    el.textContent = message || '';
    el.className = 'feedback' + (type ? ' is-' + type : '');
  }

  function debounce(fn, wait) {
    var timer = null;
    return function () {
      var args = arguments, self = this;
      clearTimeout(timer);
      timer = setTimeout(function () { fn.apply(self, args); }, wait);
    };
  }

  /** 텍스트 데이터를 브라우저 다운로드로 저장 */
  function downloadBlob(text, filename, mime) {
    try {
      var blob = new Blob([text], { type: mime || 'text/plain;charset=utf-8;' });
      var url = URL.createObjectURL(blob);
      var link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 1500);
    } catch (e) {
      toast('다운로드에 실패했습니다.', 'error');
    }
  }

  /* ------------------------------------------------------------------
     뷰 라우팅
     ------------------------------------------------------------------ */
  function switchView(viewName) {
    state.activeView = viewName;
    $all('.view').forEach(function (section) {
      section.classList.toggle('is-active', section.id === 'view-' + viewName);
    });
    $all('.nav-btn').forEach(function (btn) {
      var active = btn.getAttribute('data-view') === viewName;
      btn.classList.toggle('is-active', active);
      btn.setAttribute('aria-current', active ? 'page' : 'false');
    });
    if (location.hash !== '#' + viewName) {
      history.replaceState(null, '', '#' + viewName);
    }
    // display:none 상태에서 만들어진 차트는 크기가 0이므로,
    // 뷰가 보이게 된 뒤 해당 뷰의 차트를 다시 그린다.
    requestAnimationFrame(function () {
      setTimeout(function () {
        C.resizeAll();
        renderChartsForView(viewName);
      }, 40);
    });
  }

  /* ------------------------------------------------------------------
     데이터 로딩
     ------------------------------------------------------------------ */
  function makeRecordsFromGenerated(generated) {
    return generated.map(function (row) {
      return {
        id: row.id,
        sex: row.sex,
        age: row.age,
        group: row.group,
        values: row.values
      };
    });
  }

  function setDataset(records, metricKeys, datasetInfo, sourceLabel) {
    state.records = records;
    state.metricKeys = metricKeys;
    state.dataset = datasetInfo || null;
    state.sourceLabel = sourceLabel || state.sourceLabel;
    state.page = 1;
    analyze();
    renderAll();
  }

  function analyze() {
    if (!state.records.length) return;
    state.outlierResult = A.detectOutliers(state.records, state.metricKeys, state.zThreshold);
    state.summary = A.summarize(state.records, state.metricKeys, state.outlierResult);
  }

  function loadGenerated(options, label) {
    var generated = D.generateDataset(options);
    var records = makeRecordsFromGenerated(generated);
    var metricKeys = D.METRICS.map(function (m) { return m.key; });
    var scales = {};
    metricKeys.forEach(function (key) {
      var col = records.map(function (r) { return r.values[key]; });
      var min = Math.min.apply(null, col);
      var max = Math.max.apply(null, col);
      scales[key] = { min: min, max: max, span: max - min || 1 };
    });
    setDataset(records, metricKeys, {
      log: [
        { type: 'ok', text: '시뮬레이션 데이터 ' + records.length + '건 생성 (seed 고정, 재현 가능)' },
        { type: 'ok', text: 'UCI ML Repository · Kaggle 공개 혈액 데이터셋의 컬럼 구조를 참고했습니다.' },
        { type: 'warn', text: '실제 환자 데이터가 아닌 통계적 시뮬레이션 데이터입니다.' }
      ],
      candidates: [],
      mapping: null,
      scales: scales
    }, label || '공개 데이터셋 시뮬레이션');
  }

  function handleFile(file) {
    var feedbackEl = $('#upload-feedback');
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      feedback(feedbackEl, '파일이 너무 큽니다. 10MB 이하 파일을 사용해 주세요.', 'error');
      toast('파일 크기 초과 (10MB)', 'error');
      return;
    }
    feedback(feedbackEl, '“' + file.name + '” 파싱 중…', 'info');

    A.parseFile(file)
      .then(function (table) {
        var built = A.buildDataset(table);
        setDataset(built.records, built.metricKeys, {
          log: built.log,
          candidates: built.candidates,
          mapping: built.mapping,
          scales: built.scales,
          headers: table.headers,
          rawRows: table.rows
        }, file.name);
        feedback(feedbackEl, '분석 완료: ' + built.records.length + '건의 검체를 불러왔습니다.', 'ok');
        toast('분석 완료 · 검체 ' + built.records.length + '건', 'ok');
        renderMappingForm(table.headers, built.mapping);
      })
      .catch(function (err) {
        feedback(feedbackEl, '오류: ' + (err && err.message ? err.message : '파일을 분석할 수 없습니다.'), 'error');
        toast('파일 분석 실패', 'error');
      });
  }

  /* ------------------------------------------------------------------
     컬럼 매핑 UI
     ------------------------------------------------------------------ */
  function renderMappingForm(headers, mapping) {
    var grid = $('#mapping-grid');
    if (!grid) return;
    if (!headers || !headers.length) {
      grid.innerHTML = '<p class="empty-note">매핑할 컬럼이 없습니다.</p>';
      return;
    }
    var current = (mapping && mapping.metricHeaders) || {};
    var assigned = {};
    Object.keys(current).forEach(function (k) { assigned[current[k]] = k; });

    var html = '';
    D.METRICS.forEach(function (metric) {
      var selectedHeader = current[metric.key] || '';
      var options = '<option value="">— 사용 안 함 —</option>';
      headers.forEach(function (h) {
        var takenBy = assigned[h];
        var disabled = takenBy && takenBy !== metric.key;
        var isSel = selectedHeader === h;
        options += '<option value="' + escapeHtml(h) + '"' + (isSel ? ' selected' : '') + (disabled ? ' disabled' : '') + '>' + escapeHtml(h) + '</option>';
      });
      html += '<label class="field"><span>' + escapeHtml(metric.label) + ' (' + escapeHtml(metric.unit) + ')</span><select data-metric="' + metric.key + '">' + options + '</select></label>';
    });
    grid.innerHTML = html;
  }

  function applyMapping() {
    if (!state.dataset || !state.dataset.headers) {
      toast('업로드한 파일이 없어 매핑을 적용할 수 없습니다.', 'error');
      return;
    }
    var override = {};
    $all('#mapping-grid select[data-metric]').forEach(function (sel) {
      var value = sel.value;
      if (value) override[sel.getAttribute('data-metric')] = value;
    });
    try {
      var built = A.buildDataset({ headers: state.dataset.headers, rows: state.dataset.rawRows || [] }, override);
      setDataset(built.records, built.metricKeys, {
        log: built.log,
        candidates: built.candidates,
        mapping: built.mapping,
        scales: built.scales,
        headers: state.dataset.headers,
        rawRows: state.dataset.rawRows
      }, state.sourceLabel);
      toast('매핑을 적용해 재분석했습니다.', 'ok');
    } catch (err) {
      toast(err.message || '매핑 적용 실패', 'error');
    }
  }

  /* ------------------------------------------------------------------
     KPI · 요약
     ------------------------------------------------------------------ */
  function renderKpis() {
    var s = state.summary;
    if (!s) return;
    var stats = s.stats;

    $('#kpi-samples').textContent = fmt(s.headline.totalSamples, 0) + ' 건';
    $('#kpi-samples-hint').textContent = s.headline.totalMetrics + '개 지표 · ' + state.sourceLabel;
    document.querySelector('#dataset-chip span').textContent = state.sourceLabel;

    function setMetric(kpiId, hintId, key) {
      var st = stats[key];
      var metric = D.METRIC_BY_KEY[key];
      if (!st) { $('#' + kpiId).textContent = '–'; return; }
      $('#' + kpiId).textContent = fmt(st.mean, metric.decimals);
      var abn = st.abnormalHigh + st.abnormalLow;
      $('#' + hintId).textContent = metric.unit + ' · 이상 ' + abn + '건 (SD ' + fmt(st.sd, metric.decimals) + ')';
    }
    setMetric('kpi-hgb', 'kpi-hgb-hint', 'hgb');
    setMetric('kpi-wbc', 'kpi-wbc-hint', 'wbc');
    setMetric('kpi-plt', 'kpi-plt-hint', 'plt');

    $('#kpi-outlier-rate').textContent = fmt(s.headline.outlierRate, 1) + '%';
    $('#kpi-outlier-hint').textContent = '이상치 ' + fmt(s.headline.abnormalCells, 0) + '건 · 이상 검체 ' + fmt(s.headline.abnormalSamples, 0) + '건';
  }

  function renderStatsTable() {
    var tbody = $('#stats-table tbody');
    if (!tbody || !state.summary) return;
    var stats = state.summary.stats;
    var html = state.metricKeys.map(function (key) {
      var st = stats[key];
      var metric = D.METRIC_BY_KEY[key];
      if (!st) return '';
      var abnormal = st.abnormalHigh + st.abnormalLow;
      return '<tr>' +
        '<td><strong>' + escapeHtml(metric.label) + '</strong><br><small style="color:var(--text-dim)">' + escapeHtml(metric.code) + ' · ' + escapeHtml(metric.unit) + '</small></td>' +
        '<td>' + fmt(st.mean, metric.decimals) + '</td>' +
        '<td>' + fmt(st.sd, metric.decimals) + '</td>' +
        '<td>' + fmt(st.median, metric.decimals) + '</td>' +
        '<td>' + fmt(st.min, metric.decimals) + '</td>' +
        '<td>' + fmt(st.max, metric.decimals) + '</td>' +
        '<td>' + escapeHtml(metric.refMin + ' – ' + metric.refMax) +
        '<br><span class="tag ' + (abnormal ? 'tag-abnormal' : 'tag-normal') + '">이상 ' + abnormal + '</span></td>' +
        '</tr>';
    }).join('');
    tbody.innerHTML = html;
  }

  function renderReferenceTable() {
    var tbody = $('#reference-table tbody');
    if (!tbody) return;
    tbody.innerHTML = D.METRICS.map(function (m) {
      var range = (m.refMinMale !== undefined)
        ? '남 ' + m.refMinMale + ' – ' + m.refMaxMale + ' / 여 ' + m.refMinFemale + ' – ' + m.refMaxFemale
        : (m.refText || (m.refMin + ' – ' + m.refMax));
      return '<tr><td>' + escapeHtml(m.label) + '</td><td>' + escapeHtml(m.code) + '</td><td>' + escapeHtml(m.unit) + '</td><td>' + escapeHtml(range) + '</td></tr>';
    }).join('');
  }

  function renderDashboardOutlierList() {
    var container = $('#dashboard-outlier-list');
    if (!container || !state.summary) return;
    var ranking = state.summary.sampleRanking.filter(function (r) { return r.count > 0; }).slice(0, 8);
    if (!ranking.length) {
      container.innerHTML = '<p class="empty-note">참고 범위를 벗어난 검체가 없습니다. 데이터 상태가 양호합니다.</p>';
      return;
    }
    container.innerHTML = ranking.map(function (item) {
      var record = findRecord(item.id);
      var detail = state.outlierResult.list.filter(function (o) { return o.sampleId === item.id; }).slice(0, 3)
        .map(function (o) { return o.metricLabel + ' ' + fmt(o.value, o.decimals) + o.unit; }).join(' · ');
      return '<div class="outlier-mini" data-sample="' + escapeHtml(item.id) + '" role="button" tabindex="0">' +
        '<div class="outlier-mini-main"><strong>' + escapeHtml(item.id) + (record ? ' · ' + escapeHtml(record.group) : '') + '</strong>' +
        '<span>' + escapeHtml(detail || '상세 정보 없음') + '</span></div>' +
        '<span class="tag ' + (item.count >= 3 ? 'tag-high' : 'tag-medium') + '">이상 ' + item.count + '건</span>' +
        '</div>';
    }).join('');
  }

  function findRecord(id) {
    for (var i = 0; i < state.records.length; i++) {
      if (state.records[i].id === id) return state.records[i];
    }
    return null;
  }

  /* ------------------------------------------------------------------
     검체 목록 테이블
     ------------------------------------------------------------------ */
  function outlierFlagFor(record, metricKey) {
    var metric = D.METRIC_BY_KEY[metricKey];
    var ref = D.getReference(metric, record.sex);
    var v = record.values[metricKey];
    if (v > ref.max) return 'high';
    if (v < ref.min) return 'low';
    return '';
  }

  function filteredRecords() {
    var f = state.filters;
    var search = f.search.trim().toLowerCase();
    var list = state.records.filter(function (r) {
      if (search) {
        var haystack = (r.id + ' ' + r.group + ' ' + r.sex).toLowerCase();
        if (haystack.indexOf(search) < 0) return false;
      }
      if (f.group && r.group !== f.group) return false;
      if (f.status) {
        var count = (state.outlierResult.perSample[r.id] || 0);
        if (f.status === 'normal' && count > 0) return false;
        if (f.status === 'abnormal' && count === 0) return false;
      }
      return true;
    });

    var sortKey = f.sort;
    list.sort(function (a, b) {
      switch (sortKey) {
        case 'outlier-desc':
          return (state.outlierResult.perSample[b.id] || 0) - (state.outlierResult.perSample[a.id] || 0);
        case 'hgb-asc': return a.values.hgb - b.values.hgb;
        case 'hgb-desc': return b.values.hgb - a.values.hgb;
        case 'wbc-desc': return b.values.wbc - a.values.wbc;
        case 'plt-asc': return a.values.plt - b.values.plt;
        default: return String(a.id).localeCompare(String(b.id), 'ko');
      }
    });
    return list;
  }

  function renderSamplesTable() {
    var headRow = $('#samples-head-row');
    var tbody = document.querySelector('#samples-table tbody');
    if (!headRow || !tbody) return;

    var displayMetrics = state.metricKeys.slice(0, 10);
    headRow.innerHTML = '<th scope="col">검체 ID</th><th scope="col">성별</th><th scope="col">나이</th><th scope="col">그룹</th>' +
      displayMetrics.map(function (k) {
        var m = D.METRIC_BY_KEY[k];
        return '<th scope="col" title="' + escapeHtml(m.unit) + '">' + escapeHtml(m.code) + '</th>';
      }).join('') + '<th scope="col">이상치</th>';

    var list = filteredRecords();
    var total = list.length;
    var pages = Math.max(1, Math.ceil(total / state.pageSize));
    if (state.page > pages) state.page = pages;
    var startIndex = (state.page - 1) * state.pageSize;
    var pageItems = list.slice(startIndex, startIndex + state.pageSize);

    $('#samples-count').textContent = total + '개 검체 (전체 ' + state.records.length + '건)';

    tbody.innerHTML = pageItems.map(function (r) {
      var cells = displayMetrics.map(function (k) {
        var flag = outlierFlagFor(r, k);
        var css = flag === 'high' ? ' class="cell-abnormal"' : (flag === 'low' ? ' class="cell-low"' : '');
        return '<td' + css + '>' + fmt(r.values[k], D.METRIC_BY_KEY[k].decimals) + '</td>';
      }).join('');
      var count = state.outlierResult.perSample[r.id] || 0;
      var tagClass = count === 0 ? 'tag-normal' : (count >= 3 ? 'tag-high' : 'tag-medium');
      return '<tr class="is-clickable" data-sample="' + escapeHtml(r.id) + '" tabindex="0">' +
        '<td><strong>' + escapeHtml(r.id) + '</strong></td>' +
        '<td>' + escapeHtml(r.sex || '미상') + '</td>' +
        '<td>' + (r.age === null ? '–' : escapeHtml(r.age)) + '</td>' +
        '<td>' + escapeHtml(r.group) + '</td>' + cells +
        '<td><span class="tag ' + tagClass + '">' + count + '</span></td></tr>';
    }).join('') || '<tr><td colspan="' + (displayMetrics.length + 5) + '">조건에 맞는 검체가 없습니다.</td></tr>';

    renderPagination(pages);
  }

  function renderPagination(pages) {
    var nav = $('#samples-pagination');
    if (!nav) return;
    if (pages <= 1) { nav.innerHTML = ''; return; }

    var current = state.page;
    var buttons = [];
    buttons.push('<button class="page-btn" data-page="' + (current - 1) + '"' + (current === 1 ? ' disabled' : '') + ' aria-label="이전 페이지">‹</button>');

    var windowSize = 2;
    var from = Math.max(1, current - windowSize);
    var to = Math.min(pages, current + windowSize);
    if (from > 1) buttons.push('<button class="page-btn" data-page="1">1</button>' + (from > 2 ? '<span class="page-btn" aria-hidden="true" style="border:0;background:transparent">…</span>' : ''));
    for (var p = from; p <= to; p++) {
      buttons.push('<button class="page-btn' + (p === current ? ' is-active' : '') + '" data-page="' + p + '"' + (p === current ? ' aria-current="page"' : '') + '>' + p + '</button>');
    }
    if (to < pages) buttons.push((to < pages - 1 ? '<span class="page-btn" aria-hidden="true" style="border:0;background:transparent">…</span>' : '') + '<button class="page-btn" data-page="' + pages + '">' + pages + '</button>');
    buttons.push('<button class="page-btn" data-page="' + (current + 1) + '"' + (current === pages ? ' disabled' : '') + ' aria-label="다음 페이지">›</button>');
    nav.innerHTML = buttons.join('');
  }

  /* ------------------------------------------------------------------
     이상치 화면
     ------------------------------------------------------------------ */
  function renderOutlierScreen() {
    if (!state.summary) return;
    var s = state.summary;
    $('#outlier-total').textContent = fmt(s.headline.abnormalCells, 0) + '건';
    $('#outlier-samples').textContent = fmt(s.headline.abnormalSamples, 0) + '건';
    var topMetric = s.metricRanking.find(function (r) { return r.count > 0; });
    $('#outlier-top-metric').textContent = topMetric ? topMetric.metric.label : '없음';

    var tbody = document.querySelector('#outlier-table tbody');
    if (!tbody) return;
    var rows = state.outlierResult.list.slice(0, 300);
    if (!rows.length) {
      tbody.innerHTML = '<tr><td colspan="8">탐지된 이상치가 없습니다.</td></tr>';
    } else {
      tbody.innerHTML = rows.map(function (o) {
        var sevLabel = A.SEVERITY_LABEL[o.severity];
        var sevClass = o.severity === 'high' ? 'tag-high' : (o.severity === 'medium' ? 'tag-medium' : 'tag-low');
        var dirLabel = o.direction === 'high' ? '높음' : '낮음';
        var dirClass = o.direction === 'high' ? 'tag-abnormal' : 'tag-medium';
        return '<tr>' +
          '<td><strong>' + escapeHtml(o.sampleId) + '</strong><br><small style="color:var(--text-dim)">' + escapeHtml(o.group) + '</small></td>' +
          '<td>' + escapeHtml(o.metricLabel) + '<br><small style="color:var(--text-dim)">' + escapeHtml(o.metricCode) + '</small></td>' +
          '<td><span class="tag ' + dirClass + '">' + fmt(o.value, o.decimals) + ' ' + escapeHtml(o.unit) + ' · ' + dirLabel + '</span></td>' +
          '<td>' + escapeHtml(o.refText) + '</td>' +
          '<td>' + fmt(o.score, 2) + '</td>' +
          '<td><span class="tag ' + sevClass + '">' + sevLabel + '</span></td>' +
          '<td><small>' + escapeHtml(o.methods.join(', ')) + '</small></td>' +
          '<td><button class="btn btn-sm" data-sample="' + escapeHtml(o.sampleId) + '">상세</button></td>' +
          '</tr>';
      }).join('');
    }

    // 다변량 거리(Mahalanobis 근사) 결과 별도 표시
    var noteEl = $('#multivariate-note');
    if (noteEl) {
      var multi = state.outlierResult.multivariate;
      if (multi.length) {
        noteEl.className = 'disclaimer';
        noteEl.innerHTML = '<i class="fa-solid fa-diagram-project"></i> 다변량 거리(RMS Z-score) 기준으로 여러 지표가 동시에 치우친 검체: ' +
          multi.slice(0, 5).map(function (m) {
            return '<button class="btn btn-sm" data-sample="' + escapeHtml(m.sampleId) + '" style="margin:2px">' +
              escapeHtml(m.sampleId) + ' · 거리 ' + m.distance + '</button>';
          }).join(' ') + ' <small>기준선 ' + (multi[0] ? multi[0].cutoff : '–') + '</small>';
      } else {
        noteEl.className = 'disclaimer';
        noteEl.innerHTML = '<i class="fa-solid fa-diagram-project"></i> 다변량 거리 기준을 초과한 검체가 없습니다.';
      }
    }
  }

  /* ------------------------------------------------------------------
     차트 렌더링 (뷰 단위 — 숨겨진 뷰는 탭 활성화 시점에 그린다)
     ------------------------------------------------------------------ */
  function renderChartsForView(viewName) {
    if (!state.summary) return;
    var stats = state.summary.stats;

    if (viewName === 'dashboard') {
      C.renderDistribution('chart-distribution', stats, state.metricKeys);
      C.renderStatus('chart-status', stats, state.metricKeys);
      C.renderScatter('chart-scatter', state.records, state.outlierResult.perSample);
      C.renderTopOutliers('chart-top-outliers', state.summary.metricRanking, 8);
    } else if (viewName === 'outliers') {
      C.renderOutlierByMetric('chart-outlier-metric', state.outlierResult.perMetric, state.metricKeys);
      C.renderOutlierBySample('chart-outlier-sample', state.summary.sampleRanking, 15);
    }
  }

  function renderCharts() {
    renderChartsForView(state.activeView);
  }

  /* ------------------------------------------------------------------
     전처리 로그 · 미리보기
     ------------------------------------------------------------------ */
  function renderPreprocessLog() {
    var list = $('#preprocess-log');
    if (!list) return;
    var log = (state.dataset && state.dataset.log) || [];
    if (!log.length) {
      list.innerHTML = '<li>표시할 로그가 없습니다.</li>';
      return;
    }
    list.innerHTML = log.map(function (item) {
      return '<li class="' + (item.type === 'warn' ? 'warn' : (item.type === 'ok' ? 'ok' : '')) + '">' + escapeHtml(item.text) + '</li>';
    }).join('');
  }

  function renderPreviewTable() {
    var table = $('#preview-table');
    if (!table) return;
    var thead = table.querySelector('thead');
    var tbody = table.querySelector('tbody');
    if (!state.records.length) {
      thead.innerHTML = '';
      tbody.innerHTML = '<tr><td>데이터를 불러오면 미리보기가 표시됩니다.</td></tr>';
      return;
    }
    var keys = state.metricKeys.slice(0, 8);
    thead.innerHTML = '<tr><th scope="col">ID</th><th scope="col">성별</th><th scope="col">나이</th><th scope="col">그룹</th>' +
      keys.map(function (k) { return '<th scope="col">' + escapeHtml(D.METRIC_BY_KEY[k].code) + '</th>'; }).join('') + '</tr>';
    tbody.innerHTML = state.records.slice(0, 15).map(function (r) {
      return '<tr><td>' + escapeHtml(r.id) + '</td><td>' + escapeHtml(r.sex) + '</td><td>' + (r.age === null ? '–' : escapeHtml(r.age)) + '</td><td>' + escapeHtml(r.group) + '</td>' +
        keys.map(function (k) {
          var flag = outlierFlagFor(r, k);
          var css = flag === 'high' ? ' class="cell-abnormal"' : (flag === 'low' ? ' class="cell-low"' : '');
          return '<td' + css + '>' + fmt(r.values[k], D.METRIC_BY_KEY[k].decimals) + '</td>';
        }).join('') + '</tr>';
    }).join('');
  }

  function renderGroupFilter() {
    var select = $('#filter-group');
    if (!select) return;
    var current = state.filters.group;
    var groups = {};
    state.records.forEach(function (r) { groups[r.group] = true; });
    var names = Object.keys(groups).sort(function (a, b) { return a.localeCompare(b, 'ko'); });
    select.innerHTML = '<option value="">전체</option>' + names.map(function (n) {
      return '<option value="' + escapeHtml(n) + '"' + (n === current ? ' selected' : '') + '>' + escapeHtml(n) + '</option>';
    }).join('');
    if (names.indexOf(current) < 0) state.filters.group = '';
  }

  function renderAll() {
    renderKpis();
    renderStatsTable();
    renderDashboardOutlierList();
    renderSamplesTable();
    renderOutlierScreen();
    renderPreprocessLog();
    renderPreviewTable();
    renderGroupFilter();
    renderCharts();
  }

  /* ------------------------------------------------------------------
     검체 상세 모달
     ------------------------------------------------------------------ */
  var lastFocused = null;

  function openSampleModal(sampleId) {
    var record = findRecord(sampleId);
    if (!record) return;
    lastFocused = document.activeElement;
    var outliers = state.outlierResult.list.filter(function (o) { return o.sampleId === sampleId; });
    var outlierMap = {};
    outliers.forEach(function (o) { outlierMap[o.metricKey] = o; });

    var html = '';
    html += '<div class="detail-block"><h3>기본 정보</h3><dl class="detail-grid">' +
      '<div class="detail-item"><dt>검체 ID</dt><dd>' + escapeHtml(record.id) + '</dd></div>' +
      '<div class="detail-item"><dt>성별</dt><dd>' + escapeHtml(record.sex || '미상') + '</dd></div>' +
      '<div class="detail-item"><dt>나이</dt><dd>' + (record.age === null ? '–' : escapeHtml(record.age) + '세') + '</dd></div>' +
      '<div class="detail-item"><dt>그룹</dt><dd style="font-size:.85rem">' + escapeHtml(record.group) + '</dd></div>' +
      '<div class="detail-item"><dt>이상치 건수</dt><dd>' + outliers.length + '건</dd></div>' +
      '<div class="detail-item"><dt>상태</dt><dd><span class="tag ' + (outliers.length ? 'tag-abnormal' : 'tag-normal') + '">' + (outliers.length ? '확인 필요' : '정상 범위') + '</span></dd></div>' +
      '</dl></div>';

    html += '<div class="detail-block"><h3>지표별 측정값 (참고 범위 비교)</h3><dl class="detail-grid">' +
      state.metricKeys.map(function (key) {
        var metric = D.METRIC_BY_KEY[key];
        var ref = D.getReference(metric, record.sex);
        var value = record.values[key];
        var flag = value > ref.max ? 'is-abnormal' : (value < ref.min ? 'is-low' : '');
        var o = outlierMap[key];
        var badge = o ? '<small style="color:' + (o.severity === 'high' ? 'var(--rose)' : 'var(--amber)') + '">이상치 · ' + A.SEVERITY_LABEL[o.severity] + ' (' + o.score + ')</small>' : '';
        return '<div class="detail-item ' + flag + '"><dt>' + escapeHtml(metric.label) + ' (' + escapeHtml(metric.code) + ')</dt>' +
          '<dd>' + fmt(value, metric.decimals) + ' <small>' + escapeHtml(metric.unit) + '</small></dd>' +
          '<small>참고 ' + escapeHtml(ref.text) + (ref.sexSpecific ? ' (성별 기준)' : '') + '</small>' + badge + '</div>';
      }).join('') + '</dl></div>';

    if (outliers.length) {
      html += '<div class="detail-block"><h3>탐지 근거</h3><ul style="display:flex;flex-direction:column;gap:6px">' +
        outliers.map(function (o) {
          return '<li style="font-size:.83rem;color:var(--text-soft)">• <strong style="color:var(--text)">' + escapeHtml(o.metricLabel) + '</strong> — ' +
            fmt(o.value, o.decimals) + ' ' + escapeHtml(o.unit) + ' / 참고 ' + escapeHtml(o.refText) + ' · 탐지: ' + escapeHtml(o.methods.join(', ')) + '</li>';
        }).join('') + '</ul></div>';
    }

    html += '<div class="detail-block"><h3>참고 범위 대비 위치 (100 = 참고 범위 중앙)</h3><div style="height:300px"><canvas id="modal-radar"></canvas></div></div>';

    $('#modal-body').innerHTML = html;
    $('#modal-title').textContent = record.id + ' 검체 상세';
    var modal = $('#sample-modal');
    modal.hidden = false;
    var dialog = modal.querySelector('.modal');
    if (dialog) dialog.focus();
    C.renderSampleRadar('modal-radar', record, state.summary.stats);
  }

  function closeSampleModal() {
    var modal = $('#sample-modal');
    if (!modal || modal.hidden) return;
    modal.hidden = true;
    $('#modal-body').innerHTML = '';
    if (lastFocused && lastFocused.focus) lastFocused.focus();
  }

  /** 저장된 metric_keys(배열 | JSON 문자열 | 콤마 문자열)를 안전하게 배열로 정규화 */
  function normalizeMetricKeys(raw, records) {
    var keys = [];
    if (Array.isArray(raw)) {
      keys = raw.slice();
    } else if (typeof raw === 'string' && raw.trim()) {
      try {
        var parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) keys = parsed;
      } catch (e) {
        keys = raw.split(',').map(function (s) { return s.trim().replace(/^["'\[]|["'\]]$/g, ''); });
      }
    }
    if (!keys.length && records && records.length) keys = Object.keys(records[0].values || {});
    // 정의되지 않은 키는 제거 (차트에서 라벨을 찾지 못해 깨지는 것을 방지)
    return keys.filter(function (k) { return !!D.METRIC_BY_KEY[k]; });
  }

  /* ------------------------------------------------------------------
     저장 기능 (RESTful Table API)
     ------------------------------------------------------------------ */
  function buildSavedPayload(label, source, note) {
    var samples = state.records.slice(0, MAX_SAVED_SAMPLES).map(function (r) {
      return { id: r.id, sex: r.sex, age: r.age, group: r.group, values: r.values };
    });
    var statsBrief = {};
    Object.keys(state.summary.stats).forEach(function (key) {
      var st = state.summary.stats[key];
      if (!st) return;
      statsBrief[key] = { mean: D.round(st.mean, 2), sd: D.round(st.sd, 2), min: D.round(st.min, 2), max: D.round(st.max, 2), abnormal: st.abnormalHigh + st.abnormalLow };
    });

    return {
      label: label,
      source: source || '',
      note: note || '',
      metric_keys: state.metricKeys,
      sample_count: state.records.length,
      abnormal_count: state.summary.headline.abnormalCells,
      outlier_rate: D.round(state.summary.headline.outlierRate, 2),
      z_threshold: state.zThreshold,
      stats: JSON.stringify(statsBrief),
      dataset_json: JSON.stringify({ records: samples, truncated: state.records.length > MAX_SAVED_SAMPLES }),
      saved_at: new Date().toISOString()
    };
  }

  function loadSavedRecords() {
    var container = $('#saved-list');
    if (!container) return;
    container.innerHTML = '<p class="empty-note">불러오는 중…</p>';
    fetch('tables/' + TABLE_NAME + '?limit=100&sort=-created_at')
      .then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
      })
      .then(function (payload) {
        savedRecords = (payload && payload.data) || [];
        renderSavedList();
      })
      .catch(function () {
        container.innerHTML = '<p class="empty-note">저장된 기록을 불러오지 못했습니다. (테이블 API를 사용할 수 없는 환경일 수 있습니다.)</p>';
      });
  }

  function renderSavedList() {
    var container = $('#saved-list');
    if (!container) return;
    if (!savedRecords.length) {
      container.innerHTML = '<p class="empty-note">아직 저장된 분석 기록이 없습니다. 왼쪽 폼에서 현재 데이터셋을 저장해 보세요.</p>';
      return;
    }
    container.innerHTML = savedRecords.map(function (rec) {
      var savedDate = rec.saved_at ? new Date(rec.saved_at) : (rec.created_at ? new Date(Number(rec.created_at)) : null);
      var dateText = savedDate && !isNaN(savedDate) ? savedDate.toLocaleString('ko-KR') : '날짜 정보 없음';
      var stats = {};
      try { stats = JSON.parse(rec.stats || '{}'); } catch (e) { stats = {}; }
      var hgb = stats.hgb;
      return '<article class="saved-card">' +
        '<div class="saved-card-head"><div><h3>' + escapeHtml(rec.label) + '</h3>' +
        '<p class="saved-card-meta">' + escapeHtml(dateText) + (rec.source ? ' · ' + escapeHtml(rec.source) : '') + '</p></div>' +
        '<span class="tag tag-neutral">' + fmt(rec.sample_count, 0) + '건</span></div>' +
        '<div class="saved-card-stats">' +
        '<span class="saved-stat">이상치 ' + fmt(rec.abnormal_count, 0) + '건</span>' +
        '<span class="saved-stat">이상치율 ' + fmt(rec.outlier_rate, 1) + '%</span>' +
        (hgb ? '<span class="saved-stat">HGB 평균 ' + fmt(hgb.mean, 1) + '</span>' : '') +
        '<span class="saved-stat">Z 임계값 ' + fmt(rec.z_threshold, 1) + '</span>' +
        '</div>' +
        (rec.note ? '<p class="saved-card-note">' + escapeHtml(rec.note) + '</p>' : '') +
        '<div class="button-row">' +
        '<button class="btn btn-sm btn-primary" data-load="' + escapeHtml(rec.id) + '"><i class="fa-solid fa-upload"></i> 불러오기</button>' +
        '<button class="btn btn-sm btn-danger" data-delete="' + escapeHtml(rec.id) + '"><i class="fa-solid fa-trash"></i> 삭제</button>' +
        '</div></article>';
    }).join('');
  }

  function handleSave(event) {
    event.preventDefault();
    var feedbackEl = $('#save-feedback');
    if (!state.records.length) {
      feedback(feedbackEl, '저장할 데이터가 없습니다. 먼저 데이터를 불러와 주세요.', 'error');
      return;
    }
    var label = $('#save-label').value.trim();
    if (!label) {
      feedback(feedbackEl, '분석 이름을 입력해 주세요.', 'error');
      return;
    }
    var payload = buildSavedPayload(label, $('#save-source').value.trim(), $('#save-note').value.trim());
    feedback(feedbackEl, '저장 중…', 'info');

    fetch('tables/' + TABLE_NAME, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })
      .then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
      })
      .then(function () {
        feedback(feedbackEl, '저장되었습니다: ' + label, 'ok');
        toast('분석 기록을 저장했습니다.', 'ok');
        $('#save-form').reset();
        loadSavedRecords();
      })
      .catch(function (err) {
        feedback(feedbackEl, '저장 실패: ' + err.message, 'error');
        toast('저장에 실패했습니다.', 'error');
      });
  }

  function loadSavedIntoState(savedId) {
    var rec = savedRecords.filter(function (r) { return r.id === savedId; })[0];
    if (!rec) return;
    var parsed;
    try {
      parsed = JSON.parse(rec.dataset_json || '{}');
    } catch (e) {
      toast('저장된 데이터를 해석할 수 없습니다.', 'error');
      return;
    }
    var records = (parsed.records || []).map(function (r) {
      return { id: r.id, sex: r.sex, age: r.age, group: r.group, values: r.values };
    });
    var metricKeys = normalizeMetricKeys(rec.metric_keys, records);
    if (!metricKeys.length) {
      toast('저장된 지표 정보를 해석할 수 없습니다.', 'error');
      return;
    }
    var scales = {};
    metricKeys.forEach(function (key) {
      var col = records.map(function (r) { return r.values[key]; }).filter(function (v) { return isFinite(v); });
      var min = Math.min.apply(null, col);
      var max = Math.max.apply(null, col);
      scales[key] = { min: min, max: max, span: max - min || 1 };
    });
    setDataset(records, metricKeys, {
      log: [
        { type: 'ok', text: '저장된 기록 “' + rec.label + '” 을(를) 불러왔습니다.' },
        { type: 'warn', text: '저장 시점에는 최대 ' + MAX_SAVED_SAMPLES + '건까지만 보관되므로 원본보다 적을 수 있습니다.' }
      ],
      candidates: [],
      mapping: null,
      scales: scales
    }, '저장 기록 · ' + rec.label);
    switchView('dashboard');
    toast('“' + rec.label + '” 데이터를 불러왔습니다.', 'ok');
  }

  function deleteSavedRecord(id) {
    if (!global.confirm('이 분석 기록을 삭제할까요?')) return;
    fetch('tables/' + TABLE_NAME + '/' + encodeURIComponent(id), { method: 'DELETE' })
      .then(function () {
        toast('삭제되었습니다.', 'ok');
        loadSavedRecords();
      })
      .catch(function () { toast('삭제에 실패했습니다.', 'error'); });
  }

  /* ------------------------------------------------------------------
     이벤트 바인딩
     ------------------------------------------------------------------ */
  function bindEvents() {
    // 네비게이션
    $all('.nav-btn').forEach(function (btn) {
      btn.addEventListener('click', function () { switchView(btn.getAttribute('data-view')); });
    });
    window.addEventListener('hashchange', function () {
      var view = location.hash.replace('#', '');
      if (view && document.getElementById('view-' + view)) switchView(view);
    });

    // 업로드
    var dropzone = $('#dropzone');
    var fileInput = $('#file-input');
    dropzone.addEventListener('click', function () { fileInput.click(); });
    dropzone.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInput.click(); }
    });
    fileInput.addEventListener('change', function () {
      if (fileInput.files && fileInput.files[0]) handleFile(fileInput.files[0]);
      fileInput.value = '';
    });
    ['dragenter', 'dragover'].forEach(function (evt) {
      dropzone.addEventListener(evt, function (e) {
        e.preventDefault();
        dropzone.classList.add('is-dragover');
      });
    });
    ['dragleave', 'drop'].forEach(function (evt) {
      dropzone.addEventListener(evt, function (e) {
        e.preventDefault();
        dropzone.classList.remove('is-dragover');
      });
    });
    dropzone.addEventListener('drop', function (e) {
      var files = e.dataTransfer && e.dataTransfer.files;
      if (files && files[0]) handleFile(files[0]);
    });

    // 데이터 버튼
    $('#btn-generate-data').addEventListener('click', function () {
      loadGenerated({ count: 180, seed: 20260915, outlierRate: 0.06 });
      switchView('dashboard');
      toast('시뮬레이션 데이터 180건을 생성했습니다.', 'ok');
    });
    $('#btn-load-sample').addEventListener('click', function () {
      // 샘플 CSV를 실제 업로드와 동일한 파이프라인으로 통과시켜 분석한다.
      var csv = D.templateCsv();
      downloadBlob('\ufeff' + csv, 'hemolab-sample.csv', 'text/csv;charset=utf-8;');
      var feedbackEl = $('#upload-feedback');
      try {
        var table = { headers: csv.split('\n')[0].split(','), rows: csv.split('\n').slice(1).map(function (line) { return line.split(','); }) };
        var built = A.buildDataset(table);
        setDataset(built.records, built.metricKeys, {
          log: built.log, candidates: built.candidates, mapping: built.mapping,
          scales: built.scales, headers: table.headers, rawRows: table.rows
        }, '샘플 CSV (템플릿)');
        renderMappingForm(table.headers, built.mapping);
        feedback(feedbackEl, '샘플 CSV 3건을 분석했습니다. 템플릿 파일도 함께 다운로드했습니다.', 'ok');
      } catch (err) {
        loadGenerated({ count: 60, seed: 777001, outlierRate: 0.08 }, '샘플 데이터셋 (60건)');
        feedback(feedbackEl, '샘플 CSV를 다운로드했습니다. 업로드해 분석해 보세요.', 'info');
      }
      switchView('dashboard');
      toast('샘플 데이터를 준비했습니다.', 'ok');
    });
    $('#btn-download-template').addEventListener('click', function () {
      downloadBlob('\ufeff' + D.templateCsv(), 'hemolab-template.csv', 'text/csv;charset=utf-8;');
      toast('CSV 템플릿을 다운로드했습니다. 헤더 형식을 참고하세요.', 'ok');
    });
    $('#btn-apply-mapping').addEventListener('click', applyMapping);
    $('#btn-reset-data').addEventListener('click', function () {
      state.records = [];
      state.metricKeys = [];
      state.dataset = null;
      state.outlierResult = null;
      state.summary = null;
      state.sourceLabel = '데이터 없음';
      C.destroyAll();
      $('#mapping-grid').innerHTML = '<p class="empty-note">데이터를 업로드하면 컬럼 매핑 도구가 표시됩니다.</p>';
      feedback($('#upload-feedback'), '데이터를 초기화했습니다.', 'info');
      document.querySelector('#dataset-chip span').textContent = '데이터 없음';
      renderPreviewTable();
      renderPreprocessLog();
      toast('데이터를 초기화했습니다.', 'info');
    });

    // 검체 목록 필터
    $('#sample-search').addEventListener('input', debounce(function (e) {
      state.filters.search = e.target.value;
      state.page = 1;
      renderSamplesTable();
    }, 220));
    $('#filter-group').addEventListener('change', function (e) {
      state.filters.group = e.target.value;
      state.page = 1;
      renderSamplesTable();
    });
    $('#filter-status').addEventListener('change', function (e) {
      state.filters.status = e.target.value;
      state.page = 1;
      renderSamplesTable();
    });
    $('#sort-samples').addEventListener('change', function (e) {
      state.filters.sort = e.target.value;
      state.page = 1;
      renderSamplesTable();
    });
    $('#samples-pagination').addEventListener('click', function (e) {
      var btn = e.target.closest('[data-page]');
      if (!btn || btn.disabled) return;
      var page = parseInt(btn.getAttribute('data-page'), 10);
      if (!isNaN(page) && page > 0) {
        state.page = page;
        renderSamplesTable();
      }
    });

    // 이상치 재탐지
    $('#btn-rerun-detection').addEventListener('click', function () {
      var value = parseFloat($('#z-threshold').value);
      if (isNaN(value) || value < 1 || value > 5) {
        toast('Z-score 임계값은 1.0 – 5.0 사이로 입력해 주세요.', 'error');
        return;
      }
      state.zThreshold = value;
      if (!state.records.length) {
        toast('먼저 데이터를 불러와 주세요.', 'error');
        return;
      }
      analyze();
      renderAll();
      toast('임계값 ' + value + ' 기준으로 재탐지했습니다.', 'ok');
    });

    // 표/목록에서 검체 클릭
    document.addEventListener('click', function (e) {
      var sampleTarget = e.target.closest('[data-sample]');
      if (sampleTarget) {
        openSampleModal(sampleTarget.getAttribute('data-sample'));
        return;
      }
      var loadTarget = e.target.closest('[data-load]');
      if (loadTarget) {
        loadSavedIntoState(loadTarget.getAttribute('data-load'));
        return;
      }
      var deleteTarget = e.target.closest('[data-delete]');
      if (deleteTarget) {
        deleteSavedRecord(deleteTarget.getAttribute('data-delete'));
      }
    });
    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      var sampleTarget = e.target.closest ? e.target.closest('[data-sample]') : null;
      if (sampleTarget && e.target.tagName !== 'BUTTON') {
        e.preventDefault();
        openSampleModal(sampleTarget.getAttribute('data-sample'));
      }
    });

    // 모달
    $('#modal-close').addEventListener('click', closeSampleModal);
    $('#sample-modal').addEventListener('click', function (e) {
      if (e.target === $('#sample-modal')) closeSampleModal();
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') closeSampleModal();
    });

    // 저장
    $('#save-form').addEventListener('submit', handleSave);
    $('#btn-refresh-saved').addEventListener('click', loadSavedRecords);

    // 반응형: 크기 변경 시 차트 재계산
    window.addEventListener('resize', debounce(function () {
      C.resizeAll();
      renderChartsForView(state.activeView);
    }, 220));
  }

  /* ------------------------------------------------------------------
     초기화
     ------------------------------------------------------------------ */
  function init() {
    bindEvents();
    renderReferenceTable();
    renderPreviewTable();
    renderPreprocessLog();

    var initialView = location.hash.replace('#', '');
    if (initialView && document.getElementById('view-' + initialView)) {
      switchView(initialView);
    } else {
      switchView('dashboard');
    }

    // 기본 데이터셋 자동 로드 (빈 화면 방지)
    loadGenerated({ count: 180, seed: 20260915, outlierRate: 0.06 }, '공개 데이터셋 시뮬레이션 (UCI/Kaggle 구조 참고)');

    loadSavedRecords();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})(window);
