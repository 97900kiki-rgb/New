/* =====================================================================
   analytics.js — 파싱 · 전처리 · 기술통계 · 이상치 탐지
   window.HemoAnalytics 로 노출됩니다.
   ===================================================================== */
(function (global) {
  'use strict';

  var D = global.HemoData;

  /* ------------------------------------------------------------------
     1. 파일 파싱
     ------------------------------------------------------------------ */
  var MAX_ROWS = 20000;

  function parseCsv(text) {
    if (global.Papa && global.Papa.parse) {
      var res = global.Papa.parse(text.trim(), { skipEmptyLines: 'greedy' });
      return res.data || [];
    }
    // PapaParse 실패 시 최소한의 폴백 파서
    return text.trim().split(/\r?\n/).map(function (line) {
      return line.split(',').map(function (cell) { return cell.trim().replace(/^"|"$/g, ''); });
    });
  }

  function readAsText(file) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () { resolve(String(reader.result)); };
      reader.onerror = function () { reject(new Error('파일을 읽을 수 없습니다.')); };
      reader.readAsText(file, 'utf-8');
    });
  }

  function readAsArrayBuffer(file) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () { resolve(reader.result); };
      reader.onerror = function () { reject(new Error('파일을 읽을 수 없습니다.')); };
      reader.readAsArrayBuffer(file);
    });
  }

  function sheetToRows(rows) {
    // XLSX sheet_to_json({header:1}) → 첫 행을 헤더로 사용
    var out = [];
    for (var i = 1; i < rows.length; i++) {
      var row = rows[i];
      if (!row || row.join('').trim() === '') continue;
      out.push(row);
    }
    return out;
  }

  /**
   * 업로드된 파일을 {headers, rows} 형태로 파싱합니다.
   * rows 는 배열의 배열(값만)입니다.
   */
  function parseFile(file) {
    var name = (file.name || '').toLowerCase();
    var isExcel = /\.(xlsx|xls)$/.test(name) || /sheet|excel/.test(file.type);

    if (isExcel) {
      return readAsArrayBuffer(file).then(function (buffer) {
        if (!global.XLSX) throw new Error('Excel 파서를 불러오지 못했습니다. 네트워크를 확인해 주세요.');
        var wb = global.XLSX.read(buffer, { type: 'array' });
        var sheet = wb.Sheets[wb.SheetNames[0]];
        var matrix = global.XLSX.utils.sheet_to_json(sheet, { header: 1, blankrows: false, defval: null });
        if (!matrix.length) throw new Error('시트에서 데이터를 찾지 못했습니다.');
        var headers = matrix[0].map(function (h) { return h === null ? '' : String(h); });
        return { headers: headers, rows: sheetToRows(matrix), sheetName: wb.SheetNames[0] };
      });
    }

    return readAsText(file).then(function (text) {
      if (/\.json$/.test(name) || /^\s*[[{]/.test(text)) {
        var parsed = JSON.parse(text);
        var records = Array.isArray(parsed) ? parsed : (parsed.data || parsed.records || parsed.rows);
        if (!Array.isArray(records) || !records.length) throw new Error('JSON에서 레코드 배열을 찾지 못했습니다.');
        var headers = [];
        records.slice(0, 200).forEach(function (rec) {
          Object.keys(rec).forEach(function (k) { if (headers.indexOf(k) < 0) headers.push(k); });
        });
        return {
          headers: headers,
          rows: records.map(function (rec) { return headers.map(function (h) { return rec[h]; }); })
        };
      }
      var table = parseCsv(text);
      if (!table.length) throw new Error('CSV에서 데이터를 찾지 못했습니다.');
      var head = table[0].map(function (h) { return h === null || h === undefined ? '' : String(h); });
      return { headers: head, rows: table.slice(1) };
    });
  }

  /* ------------------------------------------------------------------
     2. 전처리 → 분석용 데이터셋 생성
     ------------------------------------------------------------------ */
  function uniqueGroupKey(base, used) {
    var key = base;
    var n = 2;
    while (used[key]) { key = base + ' (' + n + ')'; n++; }
    used[key] = true;
    return key;
  }

  /**
   * 파싱 결과를 검체 레코드 배열로 변환합니다.
   * @param {{headers:string[], rows:Array}} table
   * @param {Object} [overrideMapping] {metricKey: headerName}
   */
  function buildDataset(table, overrideMapping) {
    var log = [];
    var resolved = D.resolveColumns(table.headers);
    var metricHeaders = {};

    // 자동 인식 결과
    Object.keys(resolved.metrics).forEach(function (key) {
      metricHeaders[key] = resolved.metrics[key];
    });
    // 수동 매핑 적용(덮어쓰기)
    if (overrideMapping) {
      Object.keys(overrideMapping).forEach(function (key) {
        var header = overrideMapping[key];
        if (!header) { delete metricHeaders[key]; return; }
        // 같은 헤더를 다른 지표가 이미 쓰고 있으면 제거
        Object.keys(metricHeaders).forEach(function (other) {
          if (other !== key && metricHeaders[other] === header) delete metricHeaders[other];
        });
        metricHeaders[key] = header;
      });
    }

    var metricKeys = Object.keys(metricHeaders);
    if (!metricKeys.length) {
      throw new Error('혈액 지표 컬럼을 인식하지 못했습니다. “컬럼 매핑”에서 직접 연결해 주세요.');
    }
    log.push({ type: 'ok', text: '지표 컬럼 ' + metricKeys.length + '개 인식: ' + metricKeys.map(function (k) { return D.METRIC_BY_KEY[k].label; }).join(', ') });

    var headerIndex = {};
    table.headers.forEach(function (h, i) { headerIndex[String(h)] = i; });

    var roleIndex = {
      id: resolved.roles.id ? headerIndex[resolved.roles.id] : -1,
      sex: resolved.roles.sex ? headerIndex[resolved.roles.sex] : -1,
      age: resolved.roles.age ? headerIndex[resolved.roles.age] : -1,
      group: resolved.roles.group ? headerIndex[resolved.roles.group] : -1
    };
    var metricIndex = {};
    metricKeys.forEach(function (k) { metricIndex[k] = headerIndex[metricHeaders[k]]; });

    if (roleIndex.sex < 0) log.push({ type: 'warn', text: '성별 컬럼을 찾지 못해 공통 참고 범위를 사용합니다.' });
    if (roleIndex.group < 0) log.push({ type: 'warn', text: '그룹/분류 컬럼이 없어 그룹 필터를 사용할 수 없습니다.' });

    var records = [];
    var droppedRows = 0;
    var coercedCells = 0;
    var nullCells = 0;
    var groupUsed = {};
    var limit = Math.min(table.rows.length, MAX_ROWS);

    // 누락값 보정용: 성별·그룹 대푯값 (사전 스캔은 생략하고 수집 후 평균 대체)
    for (var i = 0; i < limit; i++) {
      var raw = table.rows[i] || [];
      var values = {};
      var present = 0;

      metricKeys.forEach(function (key) {
        var cell = raw[metricIndex[key]];
        var num = D.parseNumber(cell);
        if (num === null) {
          if (cell !== undefined && cell !== null && String(cell).trim() !== '') coercedCells++;
          else nullCells++;
          values[key] = null;
        } else {
          values[key] = num;
          present++;
        }
      });

      if (present === 0) { droppedRows++; continue; }

      var rawId = roleIndex.id >= 0 ? raw[roleIndex.id] : null;
      var idText = (rawId === null || rawId === undefined || String(rawId).trim() === '')
        ? 'S-' + String(1000 + records.length + 1)
        : String(rawId).trim();

      var sex = roleIndex.sex >= 0 ? D.normalizeSex(raw[roleIndex.sex]) : '';
      var age = roleIndex.age >= 0 ? D.parseNumber(raw[roleIndex.age]) : null;
      var groupRaw = roleIndex.group >= 0 ? raw[roleIndex.group] : null;
      var group = (groupRaw === null || groupRaw === undefined || String(groupRaw).trim() === '')
        ? '미분류' : String(groupRaw).trim();

      records.push({
        id: idText,
        sex: sex || '미상',
        age: age === null ? null : Math.round(age),
        group: uniqueGroupKey(group, groupUsed),
        values: values,
        raw: raw
      });
    }

    if (!records.length) throw new Error('유효한 검체 레코드가 없습니다. 숫자 데이터를 확인해 주세요.');

    // 결측값 대체(지표별 중앙값)
    var imputed = 0;
    metricKeys.forEach(function (key) {
      var col = records.map(function (r) { return r.values[key]; }).filter(function (v) { return v !== null; });
      if (!col.length) return;
      var median = medianOf(col);
      records.forEach(function (r) {
        if (r.values[key] === null) { r.values[key] = D.round(median, D.METRIC_BY_KEY[key].decimals); imputed++; }
      });
    });

    log.push({ type: 'ok', text: '검체 ' + records.length + '건 로드 (원본 ' + table.rows.length + '행)' });
    if (droppedRows) log.push({ type: 'warn', text: '수치가 없는 ' + droppedRows + '개 행을 제외했습니다.' });
    if (imputed) log.push({ type: 'warn', text: '결측값 ' + imputed + '개를 지표별 중앙값으로 대체했습니다.' });
    if (coercedCells) log.push({ type: 'warn', text: '단위가 섞인 값 ' + coercedCells + '개에서 숫자만 추출했습니다.' });
    if (nullCells) log.push({ type: 'warn', text: '빈 셀 ' + nullCells + '개를 확인했습니다.' });
    if (table.rows.length > MAX_ROWS) log.push({ type: 'warn', text: '브라우저 성능을 위해 상위 ' + MAX_ROWS + '행만 분석합니다.' });

    // 정규화(min-max) 스케일 저장 — 시각화·다변량 거리 계산에 사용
    var scales = {};
    metricKeys.forEach(function (key) {
      var col = records.map(function (r) { return r.values[key]; });
      var min = Math.min.apply(null, col);
      var max = Math.max.apply(null, col);
      scales[key] = { min: min, max: max, span: max - min || 1 };
    });
    log.push({ type: 'ok', text: 'min-max 정규화 완료 (지표별 0–1 스케일 저장)' });

    return {
      records: records,
      metricKeys: metricKeys,
      mapping: { roles: resolved.roles, metricHeaders: metricHeaders, metricIndex: metricIndex, roleIndex: roleIndex },
      candidates: resolved.unmapped,
      scales: scales,
      log: log
    };
  }

  /* ------------------------------------------------------------------
     3. 통계
     ------------------------------------------------------------------ */
  function meanOf(arr) {
    if (!arr.length) return null;
    return arr.reduce(function (a, b) { return a + b; }, 0) / arr.length;
  }

  function medianOf(arr) {
    if (!arr.length) return null;
    var s = arr.slice().sort(function (a, b) { return a - b; });
    var mid = Math.floor(s.length / 2);
    return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
  }

  function stdDevOf(arr) {
    if (arr.length < 2) return 0;
    var m = meanOf(arr);
    return Math.sqrt(arr.reduce(function (acc, v) { return acc + Math.pow(v - m, 2); }, 0) / (arr.length - 1));
  }

  function quantileOf(sortedArr, q) {
    if (!sortedArr.length) return null;
    var pos = (sortedArr.length - 1) * q;
    var base = Math.floor(pos);
    var rest = pos - base;
    if (sortedArr[base + 1] !== undefined) return sortedArr[base] + rest * (sortedArr[base + 1] - sortedArr[base]);
    return sortedArr[base];
  }

  function basicStats(values) {
    var clean = values.filter(function (v) { return v !== null && v !== undefined && isFinite(v); });
    if (!clean.length) return null;
    var sorted = clean.slice().sort(function (a, b) { return a - b; });
    var q1 = quantileOf(sorted, 0.25);
    var q3 = quantileOf(sorted, 0.75);
    return {
      n: clean.length,
      mean: meanOf(clean),
      median: medianOf(clean),
      sd: stdDevOf(clean),
      min: sorted[0],
      max: sorted[sorted.length - 1],
      q1: q1,
      q3: q3,
      iqr: q3 - q1,
      p10: quantileOf(sorted, 0.10),
      p90: quantileOf(sorted, 0.90)
    };
  }

  /** 지표별 요약 통계 + 참고 범위 이탈 건수 */
  function computeStats(records, metricKeys) {
    var out = {};
    metricKeys.forEach(function (key) {
      var metric = D.METRIC_BY_KEY[key];
      var col = records.map(function (r) { return r.values[key]; });
      var st = basicStats(col);
      if (!st) { out[key] = null; return; }
      var high = 0, low = 0;
      records.forEach(function (r) {
        var ref = D.getReference(metric, r.sex);
        var v = r.values[key];
        if (v > ref.max) high++;
        else if (v < ref.min) low++;
      });
      st.metric = metric;
      st.abnormalHigh = high;
      st.abnormalLow = low;
      st.refMin = metric.refMin;
      st.refMax = metric.refMax;
      out[key] = st;
    });
    return out;
  }

  /* ------------------------------------------------------------------
     4. 이상치 탐지
        (a) 참고 범위 이탈     (b) 로버스트 Z-score(MAD)
        (c) IQR 1.5 규칙        (d) 다변량 거리(Mahalanobis 근사)
     ------------------------------------------------------------------ */
  function severityOf(score) {
    if (score >= 2.5) return 'high';
    if (score >= 1.5) return 'medium';
    return 'low';
  }

  var SEVERITY_LABEL = { high: '높음', medium: '중간', low: '낮음' };

  /**
   * @param {Array} records
   * @param {Array<string>} metricKeys
   * @param {number} zThreshold 로버스트 Z-score 임계값
   */
  function detectOutliers(records, metricKeys, zThreshold) {
    zThreshold = zThreshold || 2.5;
    var outliers = [];
    var perMetric = {};
    var perSample = {};
    var robust = {};

    metricKeys.forEach(function (key) {
      perMetric[key] = 0;
      var col = records.map(function (r) { return r.values[key]; }).filter(function (v) { return isFinite(v); });
      var st = basicStats(col);
      if (!st) { robust[key] = null; return; }
      // MAD 기반 스케일 (0.6745 스케일 팩터)
      var deviations = col.map(function (v) { return Math.abs(v - st.median); });
      var mad = medianOf(deviations);
      robust[key] = {
        median: st.median,
        mad: mad,
        scale: mad > 0 ? mad / 0.6745 : (st.sd || 1),
        q1: st.q1,
        q3: st.q3,
        iqr: st.iqr
      };
    });

    records.forEach(function (record) {
      perSample[record.id] = 0;

      metricKeys.forEach(function (key) {
        var metric = D.METRIC_BY_KEY[key];
        var value = record.values[key];
        var ref = D.getReference(metric, record.sex);
        var methods = [];
        var score = 0;

        // (a) 참고 범위 이탈
        if (value > ref.max || value < ref.min) {
          var span = (ref.max - ref.min) || 1;
          var distance = value > ref.max ? (value - ref.max) / span : (ref.min - value) / span;
          score = Math.max(score, 1 + distance * 2);
          methods.push({ name: '참고 범위', score: D.round(1 + distance * 2, 2) });
        }

        var rb = robust[key];
        if (rb && rb.scale > 0) {
          var z = Math.abs(value - rb.median) / rb.scale;
          // (b) 로버스트 Z-score
          if (z >= zThreshold) {
            score = Math.max(score, z);
            methods.push({ name: 'Robust Z', score: D.round(z, 2) });
          } else if (z >= zThreshold * 0.8) {
            methods.push({ name: 'Robust Z(근접)', score: D.round(z, 2) });
          }
          // (c) IQR 1.5 규칙
          if (rb.iqr > 0) {
            var lower = rb.q1 - 1.5 * rb.iqr;
            var upper = rb.q3 + 1.5 * rb.iqr;
            if (value < lower || value > upper) {
              var iqrScore = value > upper ? (value - upper) / (rb.iqr || 1) : (lower - value) / (rb.iqr || 1);
              score = Math.max(score, 1.5 + iqrScore);
              methods.push({ name: 'IQR 1.5×', score: D.round(1.5 + iqrScore, 2) });
            }
          }
        }

        if (!methods.length) return;

        var primary = methods.reduce(function (a, b) { return a.score >= b.score ? a : b; });
        var direction = value > ref.max ? 'high' : (value < ref.min ? 'low' : (value > (rb ? rb.median : value) ? 'high' : 'low'));

        outliers.push({
          sampleId: record.id,
          group: record.group,
          sex: record.sex,
          metricKey: key,
          metricLabel: metric.label,
          metricCode: metric.code,
          unit: metric.unit,
          decimals: metric.decimals,
          value: value,
          refMin: ref.min,
          refMax: ref.max,
          refText: ref.text,
          score: D.round(score, 2),
          severity: severityOf(score),
          direction: direction,
          methods: methods.map(function (m) { return m.name; })
        });

        perMetric[key]++;
        perSample[record.id]++;
      });
    });

    // (d) 다변량 거리 — 정규화 후 지표 평균 편차 기준
    var multivariate = [];
    var multiKey = metricKeys.length >= 2;
    if (multiKey) {
      var normalized = {};
      metricKeys.forEach(function (key) {
        normalized[key] = { mean: 0, sd: 0, values: {} };
        var vals = records.map(function (r) { return r.values[key]; });
        normalized[key].mean = meanOf(vals);
        normalized[key].sd = stdDevOf(vals) || 1;
      });
      var distances = [];
      records.forEach(function (record) {
        var sum = 0;
        metricKeys.forEach(function (key) {
          var z = (record.values[key] - normalized[key].mean) / normalized[key].sd;
          sum += z * z;
        });
        var dist = Math.sqrt(sum / metricKeys.length); // RMS Z
        distances.push({ id: record.id, dist: dist, group: record.group, sex: record.sex });
      });
      var distValues = distances.map(function (d) { return d.dist; });
      var dst = basicStats(distValues);
      var cutoff = dst ? Math.max(dst.q3 + 1.5 * dst.iqr, dst.mean + 1.8 * dst.sd) : Infinity;
      distances.forEach(function (d) {
        if (d.dist > cutoff) {
          multivariate.push({ sampleId: d.id, group: d.group, distance: D.round(d.dist, 2), cutoff: D.round(cutoff, 2) });
        }
      });
    }

    outliers.sort(function (a, b) { return b.score - a.score; });

    return {
      list: outliers,
      perMetric: perMetric,
      perSample: perSample,
      robust: robust,
      multivariate: multivariate.sort(function (a, b) { return b.distance - a.distance; }),
      zThreshold: zThreshold
    };
  }

  /* ------------------------------------------------------------------
     5. 통합 요약
     ------------------------------------------------------------------ */
  function summarize(records, metricKeys, outlierResult) {
    var stats = computeStats(records, metricKeys);
    var totalCells = records.length * metricKeys.length;
    var abnormalCells = outlierResult.list.length;

    var headline = {
      totalSamples: records.length,
      totalMetrics: metricKeys.length,
      abnormalCells: abnormalCells,
      abnormalSamples: Object.keys(outlierResult.perSample).filter(function (id) { return outlierResult.perSample[id] > 0; }).length,
      multivariateCount: outlierResult.multivariate.length,
      outlierRate: totalCells ? (abnormalCells / totalCells) * 100 : 0
    };

    var metricRanking = metricKeys.map(function (key) {
      return { key: key, metric: D.METRIC_BY_KEY[key], count: outlierResult.perMetric[key] || 0 };
    }).sort(function (a, b) { return b.count - a.count; });

    var sampleRanking = Object.keys(outlierResult.perSample).map(function (id) {
      return { id: id, count: outlierResult.perSample[id] };
    }).sort(function (a, b) { return b.count - a.count; });

    var groups = {};
    records.forEach(function (r) {
      if (!groups[r.group]) groups[r.group] = { name: r.group, count: 0, outliers: 0, sum: {} };
      var g = groups[r.group];
      g.count++;
      g.outliers += outlierResult.perSample[r.id] || 0;
      metricKeys.forEach(function (key) {
        if (!g.sum[key]) g.sum[key] = { total: 0, n: 0 };
        g.sum[key].total += r.values[key];
        g.sum[key].n++;
      });
    });
    var groupSummary = Object.keys(groups).map(function (name) {
      var g = groups[name];
      var means = {};
      metricKeys.forEach(function (key) {
        means[key] = g.sum[key] ? g.sum[key].total / g.sum[key].n : null;
      });
      return { name: name, count: g.count, outliers: g.outliers, means: means };
    }).sort(function (a, b) { return b.count - a.count; });

    // 그룹별 헤모글로빈/WBC 평균 비교 차트용
    return { stats: stats, headline: headline, metricRanking: metricRanking, sampleRanking: sampleRanking, groupSummary: groupSummary };
  }

  global.HemoAnalytics = {
    parseFile: parseFile,
    buildDataset: buildDataset,
    basicStats: basicStats,
    computeStats: computeStats,
    detectOutliers: detectOutliers,
    summarize: summarize,
    medianOf: medianOf,
    meanOf: meanOf,
    stdDevOf: stdDevOf,
    SEVERITY_LABEL: SEVERITY_LABEL,
    MAX_ROWS: MAX_ROWS
  };
})(window);
