const fs = require("fs");
const vm = require("vm");
const assert = require("assert");

function loadAppFunctions() {
  const html = fs.readFileSync("index.html", "utf8");
  const match = html.match(/<script>([\s\S]*?)<\/script>/);
  if (!match) {
    throw new Error("missing script block");
  }

  const appScript = match[1].replace(
    /\n\s*init\(\);\s*\n\s*\}\)\(\);\s*$/,
    "\n      globalThis.__odaTest = { decodeCsvBuffer, parseCsv, analyzeDataset, filterAnalysisResults, sortAnalysisResults, buildAnalysisExport };\n    })();"
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
  buildAnalysisExport
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

console.log("encoding tests passed");
