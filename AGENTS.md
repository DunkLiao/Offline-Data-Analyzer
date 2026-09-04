# Repository Guidelines

## Project Structure & Module Organization

This repository is a browser-only offline CSV analyzer. The application is contained in `index.html`, including markup, styles, and JavaScript. User-facing behavior and requirements are documented in `README.md` and `SPEC.md`. Automated checks live in `tests/`, currently `tests/encoding.test.js`, which extracts app functions from the inline script. Manual acceptance fixtures live in `uat-samples/` and cover UTF-8, Big5/CP950, UTF-16LE, quoted CSV, and numeric type scenarios.

## Build, Test, and Development Commands

There is no build step and no package manager setup required. Open `index.html` directly in a modern browser to run the app locally.

```powershell
node tests/encoding.test.js
```

Runs encoding, CSV parsing, and analysis logic checks.

```powershell
node -e "const fs=require('fs');const html=fs.readFileSync('index.html','utf8');const scripts=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m=>m[1]);if(!scripts.length) throw new Error('missing script');for(const s of scripts) new Function(s);if(/https?:\/\//i.test(html)) throw new Error('external URL found');if(/cdn/i.test(html)) throw new Error('CDN reference found');if(/\b(confirm|alert)\s*\(/.test(html)) throw new Error('native modal API found');console.log('HTML script syntax OK; offline/native-dialog checks OK.');"
```

Checks inline script syntax and verifies the offline/no-native-dialog constraints.

## Coding Style & Naming Conventions

Keep the app self-contained in `index.html` unless a change clearly justifies adding files. Use two-space indentation for HTML, CSS, and JavaScript. Prefer descriptive camelCase function and variable names such as `decodeCsvBuffer`, `parseCsv`, and `analyzeDataset`. Preserve Traditional Chinese UI copy and keep files encoded as UTF-8. Do not add CDN links, analytics, tracking scripts, external APIs, or network dependencies.

## Testing Guidelines

Add focused Node assertions to `tests/encoding.test.js` when changing decoding, parsing, or dataset analysis logic. Add representative CSV fixtures under `uat-samples/` for browser-based validation, using numbered filenames like `06_utf8_new_case.csv`. After UI or storage changes, manually open `index.html`, import the UAT samples, verify encoding labels, field statistics, IndexedDB history loading, and delete confirmation behavior.

## Commit & Pull Request Guidelines

The current history uses Conventional Commits, for example `feat: add offline CSV data analyzer`. Continue using short messages such as `fix: handle empty quoted csv rows` or `test: add utf16 parsing fixture`. Pull requests should summarize user-visible changes, list commands run, mention any manual UAT sample coverage, and include screenshots or screen recordings for layout changes.

## Security & Configuration Tips

This tool is designed for sensitive local CSV files. All parsing, analysis, and persistence must remain in the browser via File API and IndexedDB. Avoid changes that upload data, persist data outside the browser profile, or introduce hidden network access.
