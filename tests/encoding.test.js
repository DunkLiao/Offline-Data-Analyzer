const fs = require("fs");
const vm = require("vm");
const assert = require("assert");

const htmlSource = fs.readFileSync("index.html", "utf8");
assert.ok(/\[hidden\]\s*\{[^}]*display:\s*none\s*!important/i.test(htmlSource), "hidden elements should not be overridden by component display styles");

function loadAppFunctions() {
  const html = htmlSource;
  const match = html.match(/<script>([\s\S]*?)<\/script>/);
  if (!match) {
    throw new Error("missing script block");
  }

  const appScript = match[1].replace(
    /\n\s*init\(\);\s*\n\s*\}\)\(\);\s*$/,
    "\n      globalThis.__odaTest = { decodeCsvBuffer, parseCsv, analyzeDataset, filterAnalysisResults, sortAnalysisResults, buildAnalysisExport, getChartableColumns, buildHistogram, buildChartModel, parseDateTime, detectDateColumns, computeCorrelation, computeLinearFit, buildScatterModel, buildBoxModel, buildCrosstabModel, buildOverviewModel, buildTimeSeriesModel };\n    })();"
  );

  function element() {
    return {
      textContent: "",
      hidden: false,
      className: "",
      dataset: {},
      title: "",
      value: "",
      disabled: false,
      classList: { add() {}, remove() {} },
      setAttribute() {},
      addEventListener() {},
      append() {},
      appendChild() {},
      focus() {}
    };
  }

  const sandbox = {
    console,
    Intl,
    Date,
    Math,
    Number,
    String,
    Error,
    TextDecoder,
    Uint8Array,
    ArrayBuffer,
    window: { crypto: {}, setTimeout: (fn) => fn(), TextDecoder },
    document: {
      getElementById: () => element(),
      createElement: () => element(),
      createDocumentFragment: () => element()
    },
    indexedDB: {}
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(appScript, sandbox);
  return sandbox.__odaTest;
}

function big5BytesForTraditionalChineseCsv() {
  return Uint8Array.from([
    0xa6, 0x57, 0xba, 0xd9, 0x2c, 0xa4, 0xc0, 0xbc, 0xc6, 0x0d, 0x0a,
    0xb4, 0xfa, 0xb8, 0xd5, 0x2c, 0x39, 0x30, 0x0d, 0x0a
  ]);
}

function utf16LeBytesForTraditionalChineseCsv() {
  const bytes = [0xff, 0xfe];
  for (const codeUnit of "名稱,分數\r\n測試,90\r\n") {
    const code = codeUnit.charCodeAt(0);
    bytes.push(code & 0xff, code >> 8);
  }
  return Uint8Array.from(bytes);
}

const {
  decodeCsvBuffer,
  parseCsv,
  analyzeDataset,
  filterAnalysisResults,
  sortAnalysisResults,
  buildAnalysisExport,
  getChartableColumns,
  buildHistogram,
  buildChartModel,
  parseDateTime,
  detectDateColumns,
  computeCorrelation,
  computeLinearFit,
  buildScatterModel,
  buildBoxModel,
  buildCrosstabModel,
  buildOverviewModel,
  buildTimeSeriesModel
} = loadAppFunctions();

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

assert.strictEqual(typeof decodeCsvBuffer, "function", "decodeCsvBuffer should be exposed for tests");

const big5Text = decodeCsvBuffer(big5BytesForTraditionalChineseCsv().buffer).text;
assert.strictEqual(big5Text, "名稱,分數\r\n測試,90\r\n");
assert.strictEqual(parseCsv(big5Text).headers[0], "名稱");

const utf16Text = decodeCsvBuffer(utf16LeBytesForTraditionalChineseCsv().buffer).text;
assert.strictEqual(utf16Text, "名稱,分數\r\n測試,90\r\n");
assert.strictEqual(parseCsv(utf16Text).rows[0]["名稱"], "測試");

const dataset = {
  id: "test-dataset",
  fileName: "quality.csv",
  importedAt: "2026-09-04T12:00:00.000Z",
  encoding: "UTF-8",
  rowCount: 5,
  columnCount: 3,
  headers: ["金額", "部門", "備註"],
  rows: [
    { "金額": "10", "部門": "風控", "備註": "A" },
    { "金額": "0", "部門": "稽核", "備註": "AA" },
    { "金額": "-5", "部門": "風控", "備註": "" },
    { "金額": "20", "部門": "財務", "備註": "AAA" },
    { "金額": "", "部門": "風控", "備註": "AA" }
  ]
};

const analysis = analyzeDataset(dataset);
const amount = analysis.find((item) => item.name === "金額");
assert.strictEqual(amount.type, "數值");
assert.strictEqual(amount.missingCount, 1);
assert.strictEqual(amount.zeroCount, 1);
assert.strictEqual(amount.negativeCount, 1);
assert.strictEqual(amount.min, -5);
assert.strictEqual(amount.max, 20);
assert.strictEqual(amount.p25, -1.25);
assert.strictEqual(amount.median, 5);
assert.strictEqual(amount.p75, 12.5);

const department = analysis.find((item) => item.name === "部門");
assert.strictEqual(department.type, "字串");
assert.strictEqual(department.uniqueCount, 3);
assert.deepStrictEqual(plain(department.topValues), [
  { value: "風控", count: 3 },
  { value: "稽核", count: 1 },
  { value: "財務", count: 1 }
]);

const note = analysis.find((item) => item.name === "備註");
assert.strictEqual(note.missingCount, 1);
assert.strictEqual(note.minLength, 1);
assert.strictEqual(note.maxLength, 3);

const filtered = filterAnalysisResults(analysis, "部");
assert.deepStrictEqual(plain(filtered.map((item) => item.name)), ["部門"]);

const sorted = sortAnalysisResults(analysis, "missingRate", "desc");
assert.deepStrictEqual(plain(sorted.map((item) => item.name)), ["金額", "備註", "部門"]);
assert.deepStrictEqual(plain(analysis.map((item) => item.name)), ["金額", "部門", "備註"]);

const exportRows = buildAnalysisExport(dataset, analysis, "json");
assert.strictEqual(exportRows.dataset.fileName, "quality.csv");
assert.strictEqual(exportRows.rowCount, 5);
assert.strictEqual(exportRows.columnCount, 3);
assert.strictEqual(exportRows.rows, undefined);
assert.strictEqual(exportRows.columns.length, 3);

const csvBytes = buildAnalysisExport(dataset, analysis, "csv");
assert.strictEqual(csvBytes.constructor.name, "Uint8Array");
const csvTextFromBig5 = new TextDecoder("big5").decode(csvBytes);
assert.ok(csvTextFromBig5.includes("欄位名稱,型態,缺失值數"));
assert.ok(csvTextFromBig5.includes("金額,數值,1,20.00%"));
assert.strictEqual(Buffer.from(csvBytes).toString("utf8").includes("欄位名稱"), false);

const chartableColumns = getChartableColumns(analysis);
assert.deepStrictEqual(plain(chartableColumns), [
  { name: "金額", type: "數值", defaultChartType: "summary" },
  { name: "部門", type: "字串", defaultChartType: "topValues" },
  { name: "備註", type: "字串", defaultChartType: "topValues" }
]);

assert.deepStrictEqual(plain(buildHistogram([-5, 0, 10, 20], 5)), {
  min: -5,
  max: 20,
  binCount: 5,
  bins: [
    { label: "-5.00 - 0.00", labelLines: ["-5.00", "0.00"], start: -5, end: 0, count: 1 },
    { label: "0.00 - 5.00", labelLines: ["0.00", "5.00"], start: 0, end: 5, count: 1 },
    { label: "5.00 - 10.00", labelLines: ["5.00", "10.00"], start: 5, end: 10, count: 0 },
    { label: "10.00 - 15.00", labelLines: ["10.00", "15.00"], start: 10, end: 15, count: 1 },
    { label: "15.00 - 20.00", labelLines: ["15.00", "20.00"], start: 15, end: 20, count: 1 }
  ]
});

assert.deepStrictEqual(plain(buildHistogram([7, 7, 7], 4)), {
  min: 7,
  max: 7,
  binCount: 1,
  bins: [
    { label: "7.00", labelLines: ["7.00"], start: 7, end: 7, count: 3 }
  ]
});

const summaryChart = buildChartModel(dataset, amount, "summary");
assert.deepStrictEqual(plain(summaryChart), {
  title: "金額 五數摘要",
  type: "summary",
  unitLabel: "數值",
  items: [
    { label: "最小值", value: -5 },
    { label: "P25", value: -1.25 },
    { label: "中位數", value: 5 },
    { label: "P75", value: 12.5 },
    { label: "最大值", value: 20 }
  ]
});

const histogramChart = buildChartModel(dataset, amount, "histogram");
assert.strictEqual(histogramChart.title, "金額 直方圖");
assert.strictEqual(histogramChart.type, "histogram");
assert.strictEqual(histogramChart.items.reduce((sum, item) => sum + item.value, 0), 4);
assert.deepStrictEqual(plain(histogramChart.items[0].labelLines), ["-5.00", "-2.50"]);

const topValuesChart = buildChartModel(dataset, department, "topValues");
assert.deepStrictEqual(plain(topValuesChart), {
  title: "部門 常見值",
  type: "topValues",
  unitLabel: "筆數",
  items: [
    { label: "風控", value: 3 },
    { label: "稽核", value: 1 },
    { label: "財務", value: 1 }
  ]
});

const parsedDate = parseDateTime("2026-09-05");
assert.strictEqual(typeof parsedDate, "number");
assert.strictEqual(parseDateTime("2026-09-05T08:30:00").constructor.name, "Number");
assert.strictEqual(parseDateTime("2026/9/5 08:30"), parseDateTime("2026-09-05T08:30"));
assert.strictEqual(parseDateTime("2026年9月5日"), parseDateTime("2026-09-05"));
assert.strictEqual(parseDateTime("abc"), null);
assert.strictEqual(parseDateTime(""), null);
assert.strictEqual(parseDateTime("13/05/2026"), null);

const dateColumns = detectDateColumns({
  headers: ["日期", "分類"],
  rows: [
    { "日期": "2026-01-01", "分類": "A" },
    { "日期": "2026-01-02", "分類": "B" },
    { "日期": "2026-01-03", "分類": "C" }
  ]
});
assert.deepStrictEqual(plain(dateColumns), ["日期"]);

assert.strictEqual(computeCorrelation([{ x: 1, y: 2 }, { x: 2, y: 4 }, { x: 3, y: 6 }]), 1);
assert.strictEqual(computeCorrelation([{ x: 1, y: 1 }]), null);
assert.deepStrictEqual(plain(computeLinearFit([{ x: 0, y: 1 }, { x: 1, y: 3 }, { x: 2, y: 5 }])), { slope: 2, intercept: 1 });

const scatterModel = buildScatterModel(dataset, "金額", "金額", false);
assert.strictEqual(scatterModel, null);
const scatterOk = buildScatterModel({
  headers: ["a", "b"],
  rows: [
    { a: "1", b: "2" },
    { a: "2", b: "4" },
    { a: "", b: "x" }
  ]
}, "a", "b", true);
assert.strictEqual(scatterOk.n, 2);
assert.strictEqual(scatterOk.excluded, 1);
assert.strictEqual(scatterOk.correlation, 1);
assert.deepStrictEqual(plain(scatterOk.trendline), { slope: 2, intercept: 0 });

const boxModel = buildBoxModel([-10, 1, 2, 3, 4, 5, 6, 7, 8, 20]);
assert.strictEqual(boxModel.q1, 2.25);
assert.strictEqual(boxModel.median, 4.5);
assert.strictEqual(boxModel.q3, 6.75);
assert.strictEqual(boxModel.iqr, 4.5);
assert.strictEqual(boxModel.lowerFence, -4.5);
assert.strictEqual(boxModel.upperFence, 13.5);
assert.deepStrictEqual(plain(boxModel.outliers), [
  { value: -10, count: 1 },
  { value: 20, count: 1 }
]);
assert.strictEqual(buildBoxModel([]), null);

const crossModel = buildCrosstabModel({
  headers: ["群組", "狀態", "金額"],
  rows: [
    { "群組": "A", "狀態": "開", "金額": "10" },
    { "群組": "A", "狀態": "關", "金額": "20" },
    { "群組": "B", "狀態": "開", "金額": "30" },
    { "群組": "B", "狀態": "關", "金額": "" },
    { "群組": "B", "狀態": "開", "金額": "50" }
  ]
}, "群組", "狀態", "count", null);
assert.strictEqual(crossModel.includedRows, 5);
assert.strictEqual(crossModel.excludedRows, 0);
assert.strictEqual(crossModel.rows.length, 2);
assert.strictEqual(crossModel.columns.length, 2);
const crossSum = buildCrosstabModel({
  headers: ["群組", "狀態", "金額"],
  rows: [
    { "群組": "A", "狀態": "開", "金額": "10" },
    { "群組": "A", "狀態": "關", "金額": "20" },
    { "群組": "B", "狀態": "開", "金額": "30" },
    { "群組": "B", "狀態": "關", "金額": "" },
    { "群組": "B", "狀態": "開", "金額": "50" }
  ]
}, "群組", "狀態", "sum", "金額");
assert.strictEqual(crossSum.includedRows, 4);
assert.strictEqual(crossSum.excludedRows, 1);
const aRowSum = crossSum.rows.find((r) => r.label === "A");
assert.strictEqual(aRowSum.rowTotal, 30);

const overviewModel = buildOverviewModel(analysis);
assert.strictEqual(overviewModel.totalColumns, 3);
assert.strictEqual(overviewModel.typeSummary.length, 2);
assert.strictEqual(overviewModel.missingRateItems.length, 3);
assert.strictEqual(overviewModel.missingRateItems[0].label, "金額");

const lineModel = buildTimeSeriesModel({
  headers: ["日期", "數值"],
  rows: [
    { "日期": "2026-01-02", "數值": "10" },
    { "日期": "2026-01-01", "數值": "20" },
    { "日期": "2026-01-01", "數值": "30" },
    { "日期": "", "數值": "99" }
  ]
}, "日期", "數值", "mean");
assert.strictEqual(lineModel.points.length, 2);
assert.strictEqual(lineModel.excluded, 1);
assert.strictEqual(lineModel.points[0].value, 25);
assert.strictEqual(lineModel.points[1].value, 10);
assert.strictEqual(lineModel.aggregation, "mean");

const lineSum = buildTimeSeriesModel({
  headers: ["日期", "數值"],
  rows: [
    { "日期": "2026-01-01", "數值": "10" },
    { "日期": "2026-01-01", "數值": "30" }
  ]
}, "日期", "數值", "sum");
assert.strictEqual(lineSum.points[0].value, 40);

console.log("encoding tests passed");
