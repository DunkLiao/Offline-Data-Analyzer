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
    "\n      globalThis.__odaTest = { decodeCsvBuffer, parseCsv, analyzeDataset };\n    })();"
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

const { decodeCsvBuffer, parseCsv } = loadAppFunctions();

assert.strictEqual(typeof decodeCsvBuffer, "function", "decodeCsvBuffer should be exposed for tests");

const big5Text = decodeCsvBuffer(big5BytesForTraditionalChineseCsv().buffer).text;
assert.strictEqual(big5Text, "名稱,分數\r\n測試,90\r\n");
assert.strictEqual(parseCsv(big5Text).headers[0], "名稱");

const utf16Text = decodeCsvBuffer(utf16LeBytesForTraditionalChineseCsv().buffer).text;
assert.strictEqual(utf16Text, "名稱,分數\r\n測試,90\r\n");
assert.strictEqual(parseCsv(utf16Text).rows[0]["名稱"], "測試");

console.log("encoding tests passed");
