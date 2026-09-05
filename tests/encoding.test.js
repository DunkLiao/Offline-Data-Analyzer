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
    "\n      globalThis.__odaTest = { decodeCsvBuffer, parseCsv, analyzeDataset, filterAnalysisResults, sortAnalysisResults, buildAnalysisExport, getChartableColumns, buildHistogram, buildChartModel };\n    })();"
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
  buildChartModel
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

console.log("encoding tests passed");
