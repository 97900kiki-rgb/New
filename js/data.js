/* =====================================================================
   data.js — 지표 정의 · 컬럼 별칭 · 데모 데이터 생성 · CSV 템플릿
   모든 함수는 브라우저 전역(window.HemoData)으로 노출됩니다.
   ===================================================================== */
(function (global) {
  'use strict';

  /* ------------------------------------------------------------------
     1. 지표 정의
        refMin / refMax      : 일반 참고 범위 (정상 판정 기준)
        refMinFemale/Male 등 : 성별 참고 범위 (없으면 공통 범위 사용)
        genMin / genMax      : 시뮬레이션 데이터 생성 범위
        dist                 : 'normal' | 'skew'(오른쪽 꼬리 분포)
     ------------------------------------------------------------------ */
  var METRICS = [
    { key: 'hgb',   code: 'HGB',   label: '헤모글로빈',            unit: 'g/dL',    refMin: 12.0, refMax: 17.5, refMinFemale: 12.0, refMaxFemale: 15.5, refMinMale: 13.5, refMaxMale: 17.5, genMin: 9.0,  genMax: 19.0,  decimals: 1, group: '적혈구', dist: 'normal' },
    { key: 'hct',   code: 'HCT',   label: '헤마토크릿',            unit: '%',       refMin: 36,   refMax: 52,   refMinFemale: 36,   refMaxFemale: 46,   refMinMale: 40,   refMaxMale: 52,   genMin: 28,   genMax: 56,   decimals: 1, group: '적혈구', dist: 'normal' },
    { key: 'rbc',   code: 'RBC',   label: '적혈구 수',             unit: '10⁶/µL',  refMin: 3.8,  refMax: 5.8,  refMinFemale: 3.8,  refMaxFemale: 5.2,  refMinMale: 4.3,  refMaxMale: 5.8,  genMin: 3.0,  genMax: 6.2,  decimals: 2, group: '적혈구', dist: 'normal' },
    { key: 'wbc',   code: 'WBC',   label: '백혈구 수',             unit: '10³/µL',  refMin: 4.0,  refMax: 11.0, genMin: 2.5,  genMax: 16.0, decimals: 2, group: '백혈구', dist: 'skew' },
    { key: 'plt',   code: 'PLT',   label: '혈소판',                unit: '10³/µL',  refMin: 150,  refMax: 450,  genMin: 90,   genMax: 520,  decimals: 0, group: '혈소판', dist: 'normal' },
    { key: 'mcv',   code: 'MCV',   label: '평균 적혈구 용적',       unit: 'fL',      refMin: 80,   refMax: 100,  genMin: 68,   genMax: 108,  decimals: 1, group: '적혈구', dist: 'normal' },
    { key: 'mch',   code: 'MCH',   label: '평균 적혈구 혈색소량',   unit: 'pg',      refMin: 27,   refMax: 33,   genMin: 22,   genMax: 37,   decimals: 1, group: '적혈구', dist: 'normal' },
    { key: 'mchc',  code: 'MCHC',  label: '평균 적혈구 혈색소농도', unit: 'g/dL',    refMin: 32,   refMax: 36,   genMin: 29,   genMax: 38,   decimals: 1, group: '적혈구', dist: 'normal' },
    { key: 'rdw',   code: 'RDW',   label: '적혈구 분포 폭',         unit: '%',       refMin: 11.5, refMax: 14.5, genMin: 10.5, genMax: 17.0, decimals: 1, group: '적혈구', dist: 'skew' },
    { key: 'neut',  code: 'NEUT',  label: '호중구',                unit: '%',       refMin: 40,   refMax: 70,   genMin: 30,   genMax: 82,   decimals: 1, group: '백혈구', dist: 'normal' },
    { key: 'lymph', code: 'LYMPH', label: '림프구',                unit: '%',       refMin: 20,   refMax: 45,   genMin: 12,   genMax: 55,   decimals: 1, group: '백혈구', dist: 'normal' },
    { key: 'mono',  code: 'MONO',  label: '단핵구',                unit: '%',       refMin: 2,    refMax: 10,   genMin: 1,    genMax: 14,   decimals: 1, group: '백혈구', dist: 'skew' },
    { key: 'eos',   code: 'EOS',   label: '호산구',                unit: '%',       refMin: 1,    refMax: 6,    genMin: 0.2,  genMax: 9,    decimals: 1, group: '백혈구', dist: 'skew' },
    { key: 'baso',  code: 'BASO',  label: '호염기구',              unit: '%',       refMin: 0,    refMax: 1,    genMin: 0.1,  genMax: 2.4,  decimals: 1, group: '백혈구', dist: 'skew' },
    { key: 'crp',   code: 'CRP',   label: 'C-반응성 단백',          unit: 'mg/L',    refMin: 0.1,  refMax: 5.0,  genMin: 0.1,  genMax: 12.0, decimals: 2, group: '염증',   dist: 'skew' },
    { key: 'esr',   code: 'ESR',   label: '적혈구 침강 속도',       unit: 'mm/hr',   refMin: 0,    refMax: 20,   genMin: 1,    genMax: 38,   decimals: 0, group: '염증',   dist: 'skew' },
    { key: 'glu',   code: 'GLU',   label: '공복 혈당',              unit: 'mg/dL',   refMin: 70,   refMax: 100,  genMin: 65,   genMax: 130,  decimals: 0, group: '대사',   dist: 'skew' },
    { key: 'chol',  code: 'CHOL',  label: '총 콜레스테롤',           unit: 'mg/dL',   refMin: 0,    refMax: 200,  genMin: 120,  genMax: 265,  decimals: 0, group: '대사',   dist: 'normal', refText: '200 이하' },
    { key: 'crea',  code: 'CREA',  label: '크레아티닌',            unit: 'mg/dL',   refMin: 0.6,  refMax: 1.2,  genMin: 0.5,  genMax: 1.7,  decimals: 2, group: '신장',   dist: 'skew' },
    { key: 'fer',   code: 'FER',   label: '페리틴',                unit: 'ng/mL',   refMin: 30,   refMax: 300,  genMin: 8,    genMax: 420,  decimals: 0, group: '철분',   dist: 'skew' }
  ];

  var METRIC_BY_KEY = {};
  var METRIC_BY_CODE = {};
  METRICS.forEach(function (m) {
    METRIC_BY_KEY[m.key] = m;
    METRIC_BY_CODE[m.code] = m;
  });

  /* ------------------------------------------------------------------
     2. 컬럼 별칭(헤더 자동 인식)
     ------------------------------------------------------------------ */
  var METRIC_ALIASES = {
    hgb:   ['hgb', 'hb', 'hemoglobin', 'haemoglobin', 'hemoglobinhb', 'hemoglobinlevel', '헤모글로빈', '혈색소', '혈색소량'],
    hct:   ['hct', 'pcv', 'hematocrit', 'haematocrit', 'packedcellvolume', '헤마토크릿', '헤마토크리트', '적혈구용적률'],
    rbc:   ['rbc', 'redbloodcell', 'redbloodcells', 'redbloodcellcount', 'erythrocyte', '적혈구', '적혈구수', '적혈구수치'],
    wbc:   ['wbc', 'wbccount', 'whitebloodcell', 'whitebloodcells', 'leukocyte', 'leucocyte', '백혈구', '백혈구수', '백혈구수치', '백혈구개수'],
    plt:   ['plt', 'platelet', 'platelets', 'plateletcount', 'thrombocyte', '혈소판', '혈소판수', '혈소판수치'],
    mcv:   ['mcv', '평균적혈구용적'],
    mch:   ['mch', '평균적혈구혈색소량'],
    mchc:  ['mchc', '평균적혈구혈색소농도'],
    rdw:   ['rdw', 'rdwcv', '적혈구분포폭'],
    neut:  ['neut', 'neutrophil', 'neutrophils', 'neuts', '호중구', '호중구수치'],
    lymph: ['lym', 'lymph', 'lymphocyte', 'lymphocytes', '림프구'],
    mono:  ['mono', 'monocyte', 'monocytes', '단핵구'],
    eos:   ['eos', 'eosinophil', 'eosinophils', '호산구'],
    baso:  ['baso', 'basophil', 'basophils', '호염기구'],
    crp:   ['crp', 'c-reactiveprotein', 'creactiveprotein', 'c반응성단백', 'crp정량'],
    esr:   ['esr', 'erythrocytesedimentationrate', '적혈구침강속도', '혈침'],
    glu:   ['glu', 'glucose', 'glucosefasting', 'fastingglucose', 'fastingbloodsugar', 'fbs', '혈당', '공복혈당'],
    chol:  ['chol', 'cholesterol', 'totalcholesterol', 'serumcholesterol', '총콜레스테롤', '콜레스테롤'],
    crea:  ['crea', 'creatinine', 'serumcreatinine', '크레아티닌'],
    fer:   ['fer', 'ferritin', 'serumferritin', '페리틴']
  };

  var ROLE_ALIASES = {
    id:    ['id', 'no', 'num', 'index', 'idx', 'sampleid', 'caseid', 'patientid', 'subjectid', 'recordid', '검체id', '검체번호', '환자id', '환자번호', '번호'],
    sex:   ['sex', 'gender', '성별'],
    age:   ['age', 'ageyears', '나이', '연령'],
    group: ['group', 'grp', 'category', 'class', 'label', 'diagnosis', 'status', 'cohort', '그룹', '분류', '진단', '구분']
  };

  /* ------------------------------------------------------------------
     3. 헬퍼
     ------------------------------------------------------------------ */
  function normalizeHeader(header) {
    if (header === null || header === undefined) return '';
    return String(header)
      .replace(/\(.*?\)/g, '')   // (g/dL) 같은 단위 제거
      .replace(/\[.*?\]/g, '')
      .toLowerCase()
      .replace(/[\s_\-./\\:]/g, '')
      .replace(/[^0-9a-z가-힣]/g, '');
  }

  function buildAliasIndex() {
    var index = { metrics: {}, roles: {} };
    Object.keys(METRIC_ALIASES).forEach(function (key) {
      index.metrics[normalizeHeader(key)] = key;
      METRIC_ALIASES[key].forEach(function (alias) {
        index.metrics[normalizeHeader(alias)] = key;
      });
    });
    Object.keys(ROLE_ALIASES).forEach(function (role) {
      index.roles[normalizeHeader(role)] = role;
      ROLE_ALIASES[role].forEach(function (alias) {
        index.roles[normalizeHeader(alias)] = role;
      });
    });
    return index;
  }

  var ALIAS_INDEX = buildAliasIndex();

  /**
   * 헤더 배열을 받아 역할/지표 매핑을 만든다.
   * @returns {{roles:Object, metrics:Object, unmapped:string[]}}
   */
  function resolveColumns(headers) {
    var roles = {};
    var metrics = {};
    var unmapped = [];

    headers.forEach(function (header) {
      var norm = normalizeHeader(header);
      if (!norm) { unmapped.push(header); return; }

      if (!roles.id && ALIAS_INDEX.roles[norm] === 'id') { roles.id = header; return; }
      if (!roles.sex && ALIAS_INDEX.roles[norm] === 'sex') { roles.sex = header; return; }
      if (!roles.age && ALIAS_INDEX.roles[norm] === 'age') { roles.age = header; return; }
      if (!roles.group && ALIAS_INDEX.roles[norm] === 'group') { roles.group = header; return; }

      var metricKey = ALIAS_INDEX.metrics[norm];
      if (metricKey && !metrics[metricKey]) { metrics[metricKey] = header; return; }

      unmapped.push(header);
    });

    return { roles: roles, metrics: metrics, unmapped: unmapped };
  }

  /** 문자열에서 숫자만 뽑아낸다. "12.4 g/dL", "<0.5", "1,200" 등을 처리 */
  function parseNumber(value) {
    if (value === null || value === undefined || value === '') return null;
    if (typeof value === 'number') return isFinite(value) ? value : null;
    var cleaned = String(value).replace(/,/g, '').replace(/[^0-9eE+\-.]/g, '');
    if (!cleaned || cleaned === '-' || cleaned === '.') return null;
    var num = Number(cleaned);
    return isFinite(num) ? num : null;
  }

  function normalizeSex(value) {
    if (!value) return '';
    var v = String(value).trim().toLowerCase();
    if (['m', 'male', 'man', '남', '남자', '남성', '1'].indexOf(v) >= 0) return '남';
    if (['f', 'female', 'woman', '여', '여자', '여성', '2'].indexOf(v) >= 0) return '여';
    return String(value).trim();
  }

  /** 검체의 성별을 반영한 참고 범위 */
  function getReference(metric, sex) {
    var min = metric.refMin;
    var max = metric.refMax;
    if (sex === '남' && metric.refMinMale !== undefined) { min = metric.refMinMale; max = metric.refMaxMale; }
    else if (sex === '여' && metric.refMinFemale !== undefined) { min = metric.refMinFemale; max = metric.refMaxFemale; }
    return {
      min: min,
      max: max,
      text: metric.refText ? metric.refText : (min + ' – ' + max),
      sexSpecific: !!(sex === '남' && metric.refMinMale !== undefined) || !!(sex === '여' && metric.refMinFemale !== undefined)
    };
  }

  /* ------------------------------------------------------------------
     4. 결정론적 난수 (데모 재현성 확보)
     ------------------------------------------------------------------ */
  function mulberry32(seed) {
    var a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function makeRandom(seed) {
    var rnd = mulberry32(seed);
    function next() { return rnd(); }
    next.normal = function (mean, sd) {
      // Box–Muller
      var u = 1 - rnd(), v = rnd();
      return (mean || 0) + (sd === undefined ? 1 : sd) * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    };
    return next;
  }

  function round(value, decimals) {
    var f = Math.pow(10, decimals === undefined ? 2 : decimals);
    return Math.round(value * f) / f;
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  /* ------------------------------------------------------------------
     5. 데모/시뮬레이션 데이터 생성
     ------------------------------------------------------------------ */
  var DEMO_GROUPS = [
    { name: '정상군', weight: 0.5,  drift: 0.0,  label: '일반 검진' },
    { name: '경계군', weight: 0.28, drift: 0.30, label: '추적 관찰' },
    { name: '주의군', weight: 0.22, drift: 0.85, label: '정밀 검사' }
  ];

  function pickGroup(rnd) {
    var r = rnd(), acc = 0;
    for (var i = 0; i < DEMO_GROUPS.length; i++) {
      acc += DEMO_GROUPS[i].weight;
      if (r <= acc) return DEMO_GROUPS[i];
    }
    return DEMO_GROUPS[0];
  }

  /**
   * 지표 값 생성 — 실제 임상 데이터처럼 "대부분 참고 범위 안, 일부는 위/아래로 이탈" 분포를 만든다.
   *  (a) 92% : 참고 범위 안쪽의 정규 분포
   *  (b)  8% : 참고 범위를 위 또는 아래로 벗어난 분포 (skew 지표는 위쪽 이탈 비중이 더 큼)
   * @param {Object} metric 지표 정의
   * @param {string} sex '남' | '여'
   * @param {Function} rnd seed 기반 난수 (rnd.normal 사용)
   * @param {number} drift 그룹별 편향 (-1 ~ 1)
   */
  function generateMetricValue(metric, sex, rnd, drift) {
    var ref = getReference(metric, sex);
    var range = ref.max - ref.min;
    var outShare = metric.dist === 'skew' ? 0.07 : 0.05;

    if (rnd() >= outShare) {
      // (a) 정상 범위 안쪽 — 그룹 편향을 반영
      var center = (ref.min + ref.max) / 2 + drift * range * 0.20;
      var sd = range / 4.4;
      return clamp(rnd.normal(center, sd), metric.genMin, metric.genMax);
    }

    // (b) 참고 범위 이탈
    var highBias = metric.dist === 'skew' ? 0.72 : 0.5;
    if (rnd() < highBias) {
      // 상한 초과
      var high = ref.max + range * (0.06 + rnd() * 0.45);
      return clamp(high, ref.max + range * 0.02, metric.genMax);
    }
    // 하한 미달
    var low = ref.min - range * (0.06 + rnd() * 0.45);
    return clamp(low, metric.genMin, ref.min - range * 0.02);
  }

  /**
   * 공개 의료 데이터셋 특성을 흉내 낸 시뮬레이션 데이터.
   * @param {Object} options {count, seed, outlierRate, withMeta}
   * @returns {Array} 검체 레코드 배열
   */
  function generateDataset(options) {
    options = options || {};
    var count = options.count || 180;
    var seed = options.seed || 20260915;
    var outlierRate = options.outlierRate === undefined ? 0.06 : options.outlierRate;
    var rnd = makeRandom(seed);
    var rows = [];

    for (var i = 0; i < count; i++) {
      var groupDef = pickGroup(rnd);
      var sex = rnd() < 0.52 ? '여' : '남';
      var age = Math.round(clamp(rnd.normal(46, 15), 18, 86));
      var values = {};

      // 드리프트 방향을 검체마다 무작위로 두어 평균이 한쪽으로 쏠리지 않게 한다.
      var direction = rnd() < 0.5 ? 1 : -1;
      var drift = groupDef.drift * direction;

      METRICS.forEach(function (metric) {
        values[metric.key] = round(generateMetricValue(metric, sex, rnd, drift), metric.decimals);
      });

      // 생리적 상관관계 반영: HCT ≈ HGB × 3, RBC ≈ HGB / 3.2
      // (이미 이탈한 값을 덮어쓰지 않도록 정상 범위 안에 있을 때만 보정)
      var hgbRef = getReference(METRIC_BY_KEY.hgb, sex);
      if (values.hgb >= hgbRef.min && values.hgb <= hgbRef.max) {
        values.hct = round(clamp(values.hgb * 3 + rnd.normal(0, 1.1), 26, 56), 1);
        values.rbc = round(clamp(values.hgb / 3.2 + rnd.normal(0, 0.15), 3.0, 6.2), 2);
        // MCV ≈ HCT / RBC × 10
        values.mcv = round(clamp((values.hct / values.rbc) * 10 + rnd.normal(0, 2.2), 68, 108), 1);
      } else {
        // 중증 빈혈/적혈구증가증은 MCV·RDW가 함께 변하는 경향
        values.hct = round(clamp(values.hgb * 3 + rnd.normal(0, 1.6), 22, 60), 1);
        values.rbc = round(clamp(values.hgb / 3.2 + rnd.normal(0, 0.3), 2.6, 6.8), 2);
        values.mcv = round(clamp((values.hct / values.rbc) * 10 + rnd.normal(0, 4), 60, 118), 1);
        values.rdw = round(clamp(values.rdw + rnd.normal(1.2, 0.6), 11, 20), 1);
      }

      // 이상치 주입 (전체 검체 중 outlierRate 비율)
      if (rnd() < outlierRate) {
        var injections = 1 + (rnd() < 0.35 ? 1 : 0);
        for (var k = 0; k < injections; k++) {
          var metric = METRICS[Math.floor(rnd() * METRICS.length)];
          var ref = getReference(metric, sex);
          var dir = rnd() < 0.58 ? 1 : -1;
          var offset = (0.08 + rnd() * 0.35) * (ref.max - ref.min);
          var target = dir > 0 ? ref.max + offset : ref.min - offset;
          values[metric.key] = round(clamp(target, metric.genMin, metric.genMax), metric.decimals);
        }
      }

      rows.push({
        id: 'S-' + String(1000 + i + 1),
        sex: sex,
        age: age,
        group: groupDef.name + ' / ' + groupDef.label,
        values: values
      });
    }

    return rows;
  }

  /* ------------------------------------------------------------------
     6. CSV 템플릿
     ------------------------------------------------------------------ */
  var TEMPLATE_METRICS = ['hgb', 'hct', 'rbc', 'wbc', 'plt', 'mcv', 'mch', 'mchc', 'rdw', 'neut', 'lymph', 'mono', 'eos', 'baso', 'crp', 'esr', 'glu', 'chol', 'crea', 'fer'];

  function templateCsv() {
    var header = ['SampleID', 'Sex', 'Age', 'Group'].concat(TEMPLATE_METRICS.map(function (k) { return METRIC_BY_KEY[k].code; }));
    function sampleRow(id, sex, age, group, overrides) {
      var base = { hgb: 14.2, hct: 43, rbc: 4.6, wbc: 6.8, plt: 240, mcv: 88, mch: 30, mchc: 33.5, rdw: 13, neut: 55, lymph: 33, mono: 6, eos: 2.5, baso: 0.5, crp: 1.2, esr: 8, glu: 92, chol: 178, crea: 0.9, fer: 110 };
      Object.keys(overrides || {}).forEach(function (k) { base[k] = overrides[k]; });
      return [id, sex, age, group].concat(TEMPLATE_METRICS.map(function (k) { return base[k]; }));
    }
    var rows = [
      header,
      sampleRow('S-0001', 'M', 42, '정상군', {}),
      sampleRow('S-0002', 'F', 57, '주의군', { hgb: 9.8, hct: 31, wbc: 13.4, plt: 128, crp: 7.9, esr: 28 }),
      sampleRow('S-0003', 'F', 33, '경계군', { hgb: 11.6, fer: 18, rdw: 15.2 })
    ];
    return rows.map(function (row) { return row.join(','); }).join('\n');
  }

  /* ------------------------------------------------------------------ */
  global.HemoData = {
    METRICS: METRICS,
    METRIC_BY_KEY: METRIC_BY_KEY,
    METRIC_BY_CODE: METRIC_BY_CODE,
    METRIC_ALIASES: METRIC_ALIASES,
    normalizeHeader: normalizeHeader,
    resolveColumns: resolveColumns,
    parseNumber: parseNumber,
    normalizeSex: normalizeSex,
    getReference: getReference,
    generateDataset: generateDataset,
    templateCsv: templateCsv,
    makeRandom: makeRandom,
    round: round,
    clamp: clamp,
    formatNumber: function (value, decimals) {
      if (value === null || value === undefined || !isFinite(value)) return '–';
      var d = decimals === undefined ? 2 : decimals;
      return Number(value).toFixed(d);
    }
  };
})(window);
