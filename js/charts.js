/* =====================================================================
   charts.js — Chart.js 기반 시각화 (실시간 대시보드)
   window.HemoCharts 로 노출됩니다.
   ===================================================================== */
(function (global) {
  'use strict';

  var D = global.HemoData;
  var registry = {};

  var COLORS = {
    accent: '#3ea6ff',
    accentSoft: 'rgba(62, 166, 255, 0.22)',
    violet: '#7c5cff',
    cyan: '#2fd8d0',
    green: '#35d69b',
    amber: '#ffb648',
    rose: '#ff5f7e',
    grid: 'rgba(120, 150, 210, 0.14)',
    tick: '#a9b6d4'
  };

  var GROUP_COLORS = ['#3ea6ff', '#35d69b', '#ffb648', '#7c5cff', '#2fd8d0', '#ff5f7e', '#a893ff'];

  var BASE_OPTIONS = {
    responsive: true,
    maintainAspectRatio: false,
    animation: { duration: 450 },
    plugins: {
      legend: { labels: { color: COLORS.tick, boxWidth: 12, font: { size: 11 } } },
      tooltip: {
        backgroundColor: 'rgba(12, 18, 36, 0.95)',
        borderColor: 'rgba(120, 160, 230, 0.35)',
        borderWidth: 1,
        titleColor: '#eaf0ff',
        bodyColor: '#cfdaf3',
        padding: 10,
        cornerRadius: 8,
        displayColors: true
      }
    }
  };

  function deepMerge(base, extra) {
    var out = Object.assign({}, base);
    Object.keys(extra || {}).forEach(function (k) {
      if (base && typeof base[k] === 'object' && !Array.isArray(base[k]) && typeof extra[k] === 'object' && !Array.isArray(extra[k])) {
        out[k] = deepMerge(base[k], extra[k]);
      } else {
        out[k] = extra[k];
      }
    });
    return out;
  }

  function getContext(id) {
    var canvas = document.getElementById(id);
    if (!canvas) return null;
    // 숨겨진 뷰(display:none) 안에서는 캔버스 크기가 0이므로 그리지 않는다.
    // 탭이 활성화되면 app.js 가 다시 호출해 정상 크기로 렌더링한다.
    if (!canvas.offsetParent && !canvas.offsetWidth && !canvas.offsetHeight) return null;
    if (registry[id]) { registry[id].destroy(); delete registry[id]; }
    var ctx = canvas.getContext('2d');
    var gradient = ctx.createLinearGradient(0, 0, 0, canvas.height || 300);
    gradient.addColorStop(0, 'rgba(62, 166, 255, 0.85)');
    gradient.addColorStop(1, 'rgba(124, 92, 255, 0.55)');
    return { canvas: canvas, ctx: ctx, gradient: gradient };
  }

  function destroyAll() {
    Object.keys(registry).forEach(function (id) { registry[id].destroy(); delete registry[id]; });
  }

  /**
   * 탭 전환 직후 호출 — display:none 안에서 생성되어 0×0 으로 잡힌
   * 캔버스 크기를 부모 컨테이너 기준으로 다시 계산한다.
   */
  function resizeAll() {
    Object.keys(registry).forEach(function (id) {
      var chart = registry[id];
      if (!chart || !chart.canvas) return;
      // 숨겨진 상태에서 만들어진 차트는 부모 크기가 0이었으므로 강제로 다시 잡는다.
      var parent = chart.canvas.parentElement;
      if (parent && parent.clientWidth > 0 && parent.clientHeight > 0) {
        chart.resize(parent.clientWidth, parent.clientHeight);
      } else if (chart.resize) {
        chart.resize();
      }
    });
  }

  /** 해당 차트가 그려진 캔버스가 보이는 상태인지 확인 (지연 렌더링용) */
  function isVisible(id) {
    var canvas = document.getElementById(id);
    if (!canvas) return false;
    return !!(canvas.offsetParent || canvas.offsetWidth || canvas.offsetHeight);
  }

  function categoryOptions(title, extra) {
    return deepMerge({
      scales: {
        x: {
          grid: { color: 'rgba(120, 150, 210, 0.08)' },
          ticks: { color: COLORS.tick, font: { size: 10 }, autoSkip: false, maxRotation: 60, minRotation: 0 }
        },
        y: {
          grid: { color: COLORS.grid },
          ticks: { color: COLORS.tick, font: { size: 10 } }
        }
      },
      plugins: { title: { display: !!title, text: title || '', color: '#cfdaf3', font: { size: 12, weight: '600' } } }
    }, extra);
  }

  /* ------------------------------------------------------------------ */
  /* 1. 주요 지표 분포 — 참고 범위(플로팅 바) + 평균(선)                 */
  /* ------------------------------------------------------------------ */
  function renderDistribution(id, stats, metricKeys) {
    if (!getContext(id)) return null;
    var valid = metricKeys.filter(function (k) { return stats[k]; });
    if (!valid.length) return null;

    var labels = valid.map(function (k) { return D.METRIC_BY_KEY[k].code; });
    var bands = valid.map(function (k) {
      var m = D.METRIC_BY_KEY[k];
      return [m.refMin, m.refMax];
    });
    var means = valid.map(function (k) { return D.round(stats[k].mean, D.METRIC_BY_KEY[k].decimals); });
    var mins = valid.map(function (k) { return D.round(stats[k].min, D.METRIC_BY_KEY[k].decimals); });
    var maxs = valid.map(function (k) { return D.round(stats[k].max, D.METRIC_BY_KEY[k].decimals); });

    var ctx = getContext(id);
    var config = {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [
          {
            label: '참고 범위',
            data: bands,
            backgroundColor: 'rgba(62, 166, 255, 0.16)',
            borderColor: 'rgba(62, 166, 255, 0.55)',
            borderWidth: 1,
            borderRadius: 4,
            barPercentage: 0.55
          },
          {
            label: '전체 평균',
            type: 'line',
            data: means,
            borderColor: COLORS.amber,
            backgroundColor: COLORS.amber,
            pointStyle: 'rectRot',
            pointRadius: 5,
            pointHoverRadius: 7,
            borderWidth: 2,
            tension: 0.25,
            order: 0
          },
          {
            label: '최대값',
            type: 'line',
            data: maxs,
            borderColor: 'rgba(255, 95, 126, 0.75)',
            backgroundColor: 'rgba(255, 95, 126, 0.75)',
            pointRadius: 2,
            borderWidth: 1,
            borderDash: [4, 4],
            tension: 0.25
          },
          {
            label: '최소값',
            type: 'line',
            data: mins,
            borderColor: 'rgba(47, 216, 208, 0.75)',
            backgroundColor: 'rgba(47, 216, 208, 0.75)',
            pointRadius: 2,
            borderWidth: 1,
            borderDash: [4, 4],
            tension: 0.25
          }
        ]
      },
      options: categoryOptions('', {
        plugins: {
          tooltip: {
            callbacks: {
              label: function (item) {
                var label = item.dataset.label + ': ';
                var val = item.raw;
                if (Array.isArray(val)) return label + val[0] + ' – ' + val[1] + ' ' + (D.METRIC_BY_KEY[valid[item.dataIndex]].unit || '');
                return label + val + ' ' + (D.METRIC_BY_KEY[valid[item.dataIndex]].unit || '');
              }
            }
          }
        }
      })
    };

    registry[id] = new global.Chart(ctx.ctx, config);
    return registry[id];
  }

  /* ------------------------------------------------------------------ */
  /* 2. 지표별 정상/이상 비율 (누적 막대)                                */
  /* ------------------------------------------------------------------ */
  function renderStatus(id, stats, metricKeys) {
    if (!getContext(id)) return null;
    var valid = metricKeys.filter(function (k) { return stats[k]; });
    if (!valid.length) return null;

    var labels = valid.map(function (k) { return D.METRIC_BY_KEY[k].code; });
    var normalCounts = valid.map(function (k) { return stats[k].n - (stats[k].abnormalHigh + stats[k].abnormalLow); });
    var lowCounts = valid.map(function (k) { return stats[k].abnormalLow; });
    var highCounts = valid.map(function (k) { return stats[k].abnormalHigh; });

    var ctx = getContext(id);
    registry[id] = new global.Chart(ctx.ctx, {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [
          { label: '정상 범위', data: normalCounts, backgroundColor: 'rgba(53, 214, 155, 0.55)', borderColor: 'rgba(53, 214, 155, 0.9)', borderWidth: 1, borderRadius: 3 },
          { label: '낮음 (low)', data: lowCounts, backgroundColor: 'rgba(255, 182, 72, 0.6)', borderColor: 'rgba(255, 182, 72, 0.9)', borderWidth: 1, borderRadius: 3 },
          { label: '높음 (high)', data: highCounts, backgroundColor: 'rgba(255, 95, 126, 0.62)', borderColor: 'rgba(255, 95, 126, 0.95)', borderWidth: 1, borderRadius: 3 }
        ]
      },
      options: categoryOptions('', {
        scales: {
          x: { stacked: true, grid: { color: 'rgba(120, 150, 210, 0.08)' }, ticks: { color: COLORS.tick, font: { size: 10 }, autoSkip: false, maxRotation: 60 } },
          y: { stacked: true, grid: { color: COLORS.grid }, ticks: { color: COLORS.tick, font: { size: 10 } } }
        }
      })
    });
    return registry[id];
  }

  /* ------------------------------------------------------------------ */
  /* 3. 산점도 — 헤모글로빈 × 백혈구                                     */
  /* ------------------------------------------------------------------ */
  function renderScatter(id, records, perSampleOutliers) {
    if (!getContext(id)) return null;
    if (!records.length) return null;

    var xKey = 'hgb';
    var yKey = 'wbc';
    var groups = {};
    records.forEach(function (r) {
      var key = r.group || '미분류';
      if (!groups[key]) groups[key] = [];
      groups[key].push(r);
    });

    var groupNames = Object.keys(groups).sort();
    var datasets = groupNames.map(function (name, i) {
      var color = GROUP_COLORS[i % GROUP_COLORS.length];
      return {
        label: name,
        data: groups[name].map(function (r) {
          var count = perSampleOutliers[r.id] || 0;
          return {
            x: D.round(r.values[xKey], 1),
            y: D.round(r.values[yKey], 2),
            id: r.id,
            group: r.group,
            outliers: count
          };
        }),
        backgroundColor: color,
        borderColor: 'rgba(255,255,255,0.55)',
        borderWidth: 0,
        pointRadius: function (context) {
          var raw = context.raw || {};
          return raw.outliers ? Math.min(4 + raw.outliers * 1.8, 12) : 4;
        },
        pointHoverRadius: 10,
        pointStyle: 'circle'
      };
    });

    // 이상치 검체는 테두리 강조용 별도 데이터셋
    var flagged = records.filter(function (r) { return (perSampleOutliers[r.id] || 0) > 0; });
    datasets.push({
      label: '이상치 검체',
      data: flagged.map(function (r) {
        return { x: D.round(r.values[xKey], 1), y: D.round(r.values[yKey], 2), id: r.id, outliers: perSampleOutliers[r.id] || 0 };
      }),
      backgroundColor: 'transparent',
      borderColor: COLORS.rose,
      borderWidth: 2,
      pointRadius: 8,
      pointHoverRadius: 12,
      pointStyle: 'circle',
      showLine: false,
      order: -1
    });

    var xMetric = D.METRIC_BY_KEY[xKey];
    var yMetric = D.METRIC_BY_KEY[yKey];
    var ctx = getContext(id);

    registry[id] = new global.Chart(ctx.ctx, {
      type: 'scatter',
      data: { datasets: datasets },
      options: deepMerge(BASE_OPTIONS, {
        plugins: {
          tooltip: {
            callbacks: {
              label: function (item) {
                var raw = item.raw || {};
                return [
                  String(raw.id || '') + (raw.group ? ' · ' + raw.group : ''),
                  xMetric.label + ': ' + raw.x + ' ' + xMetric.unit,
                  yMetric.label + ': ' + raw.y + ' ' + yMetric.unit
                ];
              }
            }
          }
        },
        scales: {
          x: {
            title: { display: true, text: xMetric.label + ' (' + xMetric.unit + ')', color: COLORS.tick, font: { size: 11 } },
            grid: { color: COLORS.grid },
            ticks: { color: COLORS.tick, font: { size: 10 } }
          },
          y: {
            title: { display: true, text: yMetric.label + ' (' + yMetric.unit + ')', color: COLORS.tick, font: { size: 11 } },
            grid: { color: COLORS.grid },
            ticks: { color: COLORS.tick, font: { size: 10 } }
          }
        }
      })
    });
    return registry[id];
  }

  /* ------------------------------------------------------------------ */
  /* 4. 이상치 항목 Top N (가로 막대)                                    */
  /* ------------------------------------------------------------------ */
  function renderTopOutliers(id, metricRanking, limit) {
    if (!getContext(id)) return null;
    var top = metricRanking.filter(function (r) { return r.count > 0; }).slice(0, limit || 8);
    if (!top.length) {
      var ctxEmpty = getContext(id);
      registry[id] = new global.Chart(ctxEmpty.ctx, {
        type: 'bar',
        data: { labels: ['이상치 없음'], datasets: [{ label: '건수', data: [0], backgroundColor: 'rgba(53, 214, 155, 0.4)' }] },
        options: categoryOptions('탐지된 이상치가 없습니다')
      });
      return registry[id];
    }

    var labels = top.map(function (r) { return r.metric.label + ' (' + r.metric.code + ')'; });
    var data = top.map(function (r) { return r.count; });
    var colors = top.map(function (r, i) {
      var ratio = 1 - i / Math.max(top.length, 1);
      return 'rgba(' + Math.round(62 + 193 * ratio) + ', ' + Math.round(166 - 71 * ratio) + ', ' + Math.round(255 - 129 * ratio) + ', 0.72)';
    });

    var ctx = getContext(id);
    registry[id] = new global.Chart(ctx.ctx, {
      type: 'bar',
      data: { labels: labels, datasets: [{ label: '이상치 건수', data: data, backgroundColor: colors, borderRadius: 6, barPercentage: 0.7 }] },
      options: categoryOptions('', {
        indexAxis: 'y',
        plugins: { legend: { display: false } },
        scales: {
          x: { grid: { color: COLORS.grid }, ticks: { color: COLORS.tick, font: { size: 10 }, precision: 0 } },
          y: { grid: { display: false }, ticks: { color: COLORS.tick, font: { size: 10 } } }
        }
      })
    });
    return registry[id];
  }

  /* ------------------------------------------------------------------ */
  /* 5. 이상치 탐지 화면 차트                                            */
  /* ------------------------------------------------------------------ */
  function renderOutlierByMetric(id, perMetric, metricKeys) {
    if (!getContext(id)) return null;
    var valid = metricKeys.slice();
    var labels = valid.map(function (k) { return D.METRIC_BY_KEY[k].code; });
    var data = valid.map(function (k) { return perMetric[k] || 0; });
    var ctx = getContext(id);
    registry[id] = new global.Chart(ctx.ctx, {
      type: 'bar',
      data: { labels: labels, datasets: [{ label: '이상치 개수', data: data, backgroundColor: 'rgba(255, 95, 126, 0.55)', borderColor: 'rgba(255, 95, 126, 0.95)', borderWidth: 1, borderRadius: 5 }] },
      options: categoryOptions('', {
        plugins: { legend: { display: false } },
        scales: {
          x: { grid: { color: 'rgba(120, 150, 210, 0.08)' }, ticks: { color: COLORS.tick, font: { size: 10 }, autoSkip: false, maxRotation: 60 } },
          y: { grid: { color: COLORS.grid }, ticks: { color: COLORS.tick, font: { size: 10 }, precision: 0 } }
        }
      })
    });
    return registry[id];
  }

  function renderOutlierBySample(id, sampleRanking, limit) {
    if (!getContext(id)) return null;
    var top = sampleRanking.slice(0, limit || 15);
    if (!top.length) {
      var ctxEmpty = getContext(id);
      registry[id] = new global.Chart(ctxEmpty.ctx, {
        type: 'bar',
        data: { labels: ['이상치 없음'], datasets: [{ label: '건수', data: [0], backgroundColor: 'rgba(53, 214, 155, 0.4)' }] },
        options: categoryOptions('탐지된 이상치가 없습니다')
      });
      return registry[id];
    }
    var ctx = getContext(id);
    registry[id] = new global.Chart(ctx.ctx, {
      type: 'bar',
      data: {
        labels: top.map(function (s) { return s.id; }),
        datasets: [{
          label: '이상치 개수',
          data: top.map(function (s) { return s.count; }),
          backgroundColor: 'rgba(124, 92, 255, 0.6)',
          borderColor: 'rgba(140, 112, 255, 0.95)',
          borderWidth: 1,
          borderRadius: 6
        }]
      },
      options: categoryOptions('', {
        indexAxis: 'y',
        plugins: { legend: { display: false } },
        scales: {
          x: { grid: { color: COLORS.grid }, ticks: { color: COLORS.tick, font: { size: 10 }, precision: 0 } },
          y: { grid: { display: false }, ticks: { color: COLORS.tick, font: { size: 10 } } }
        }
      })
    });
    return registry[id];
  }

  /** 검체 상세 모달용 — 검체 1건의 지표별 정규화 위치 (레이다) */
  function renderSampleRadar(containerId, record, stats) {
    var canvas = document.getElementById(containerId);
    if (!canvas) return null;
    if (registry[containerId]) { registry[containerId].destroy(); delete registry[containerId]; }
    var keys = Object.keys(stats).filter(function (k) { return stats[k] && record.values[k] !== null; });
    if (keys.length < 3) return null;

    var labels = keys.map(function (k) { return D.METRIC_BY_KEY[k].code; });
    var refMid = keys.map(function (k) { return 100; });
    var points = keys.map(function (k) {
      var m = D.METRIC_BY_KEY[k];
      var ref = D.getReference(m, record.sex);
      var mid = (ref.min + ref.max) / 2;
      var half = ((ref.max - ref.min) / 2) || 1;
      var pct = 100 + ((record.values[k] - mid) / half) * 50; // 참고범위 중앙=100, 경계=50/150
      return Math.max(20, Math.min(200, D.round(pct, 0)));
    });

    registry[containerId] = new global.Chart(canvas.getContext('2d'), {
      type: 'radar',
      data: {
        labels: labels,
        datasets: [
          { label: '참고 범위 중앙(100)', data: refMid, borderColor: 'rgba(120, 150, 210, 0.45)', backgroundColor: 'rgba(120, 150, 210, 0.08)', borderDash: [4, 4], pointRadius: 0, borderWidth: 1 },
          { label: String(record.id), data: points, borderColor: COLORS.accent, backgroundColor: 'rgba(62, 166, 255, 0.22)', pointBackgroundColor: COLORS.amber, pointRadius: 4, borderWidth: 2 }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { labels: { color: COLORS.tick, boxWidth: 12, font: { size: 11 } } },
          tooltip: {
            backgroundColor: 'rgba(12, 18, 36, 0.95)',
            borderColor: 'rgba(120, 160, 230, 0.35)',
            borderWidth: 1,
            callbacks: {
              label: function (item) {
                var key = keys[item.dataIndex];
                var m = D.METRIC_BY_KEY[key];
                if (item.datasetIndex === 1) {
                  return m.label + ': ' + record.values[key] + ' ' + m.unit + ' (참고범위 대비 ' + item.raw + '%)';
                }
                return '참고 범위 중앙 기준선';
              }
            }
          }
        },
        scales: {
          r: {
            angleLines: { color: 'rgba(120, 150, 210, 0.18)' },
            grid: { color: 'rgba(120, 150, 210, 0.18)' },
            pointLabels: { color: COLORS.tick, font: { size: 10 } },
            ticks: { display: false, min: 0, max: 200 },
            suggestedMin: 0,
            suggestedMax: 200
          }
        }
      }
    });
    return registry[containerId];
  }

  global.HemoCharts = {
    renderDistribution: renderDistribution,
    renderStatus: renderStatus,
    renderScatter: renderScatter,
    renderTopOutliers: renderTopOutliers,
    renderOutlierByMetric: renderOutlierByMetric,
    renderOutlierBySample: renderOutlierBySample,
    renderSampleRadar: renderSampleRadar,
    destroyAll: destroyAll,
    resizeAll: resizeAll,
    isVisible: isVisible,
    COLORS: COLORS
  };
})(window);
