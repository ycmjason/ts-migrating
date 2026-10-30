# `@ts-migrating` — Progressively Upgrade `tsconfig.json`

🚀 **TypeScript keeps evolving — and your `tsconfig` should too.**

This tool lets you upgrade to your desired `compilerOptions` (e.g. `strict`, `noUncheckedIndexedAccess`, `erasableSyntaxOnly`, `checkJs`) across your entire codebase, while letting problematic lines fall back to the old `compilerOptions`.

Upgrading `tsconfig` often breaks existing code, and fixing all errors at once is unrealistic.

**`@ts-migrating`** helps your team migrate to a desired `tsconfig` gradually and safely.

> I chose `@ts-migrating` (rather than `@ts-migration`) to better reflect the tool’s progressive and incremental philosophy.

> 📣 **ts-migrating 2.x is a CLI for TypeScript 7.1+.** TypeScript 7 (the native Go port) cannot load language service plugins ([microsoft/TypeScript#63800](https://github.com/microsoft/TypeScript/issues/63800)), so there is no editor integration anymore: `@ts-migrating` comments are inert in the editor; CI is the gate. On TypeScript 5–6, or if you want editor support, use 1.x (see [Migrating from 1.x](#-migrating-from-1x)). TypeScript 7 is the last major ts-migrating will support.

## 🙋‍♀️ Why not `@ts-expect-error` / `@ts-ignore`?

Using `@ts-expect-error` or `@ts-ignore` to silence TypeScript errors can work in the short term — but they come with trade-offs:

- They suppress all errors on the line, not just those introduced by the new `compilerOptions`. This can hide unrelated issues and introduce technical debt.
- There are cases where you actually want to use `@ts-expect-error` and `@ts-ignore`. Mixing their real usages with `tsconfig` migration is 🤮.
- To use them, you'd have to switch your real `tsconfig` to the new `compilerOptions` straight away, so every unmarked line breaks `tsc` and your build at once.

`@ts-migrating` takes a different approach: your `tsconfig` (and therefore `tsc`, your editor and your build) stays as it is, while `ts-migrating check` type-checks your code with the desired `compilerOptions` and lets you revert them line-by-line. This keeps your code clean, and your intent clear — enabling a safer and more maintainable upgrade path.

## 🤖 How does this work?

You declare the `compilerOptions` you're migrating to in your `tsconfig.json` (see [setup](#-install-and-setup)). `tsc`, your editor and your build ignore them. `ts-migrating check` type-checks each project twice through TypeScript's own API: once with your current `compilerOptions` and once with the target ones. The errors only the target config produces are the `[ts-migrating]` errors; the ones on lines marked with `@ts-migrating` are your acknowledged migration debt.

The philosophy behind the tool follows three simple steps:

1. 🛑 **Prevention**
   - Errors from your target config are surfaced in CI by `ts-migrating check`.
   - This ensures no new violations are introduced into the codebase.

2. 🔧 **Reduction**
   - Lines marked with `@ts-migrating` are type-checked with your original `tsconfig`. Ensuring type-safety throughout.
   - Developers can progressively fix these lines, reducing violations over time.

3. ✅ **Migration**
   - Once all violations are fixed, no `@ts-migrating` directives remain.
   - At this point, you're ready to fully adopt the new tsconfig — and the tool has served its purpose.

## 📚 Overview

`@ts-migrating` is a CLI, `ts-migrating`, with three commands:

- `ts-migrating check`
  - Run `@ts-migrating`-aware type checking using your new `tsconfig`.
  - Pass `--reporter json` (or `ndjson`) to emit a machine-readable report for CI gates and dashboards (see [📊 JSON reporting](#-json-reporting)).
- `ts-migrating annotate`
  - Automatically mark all errors caused by your new `tsconfig` with `@ts-migrating`.
  - ⚠️ Run this with a clean git state!!! This script will automatically add the `@ts-migrating` directive above every line with TypeScript error introduced by your new `tsconfig`. Please review the changes carefully. It is recommended to run your formatter and linter afterwards. You may need to run this command again after formatter / linter.️
- `ts-migrating info`
  - Print debug info: versions, and which tsconfig each given file belongs to and whether it enables ts-migrating.

A `@ts-migrating` comment marks the next line that isn't a comment. In JSX children, write it as `{/* @ts-migrating */}`.

## 🎪 Examples

- [Migrating to `strict`](./examples/strict-mode-migration/src/index.ts)
- [Migrating to `noUncheckedIndexedAccess`](./examples/no-unchecked-indexed-access-migration/src/index.ts):

  ```console
  $ npx ts-migrating check
  examples/no-unchecked-indexed-access-migration/src/index.ts:2:10 - error TS2532: [ts-migrating]
    Object is possibly 'undefined'.

  2   return xs[0] + 1;
             ~~~~~

  ❌ 1 unmarked [ts-migrating] error found. Run `npx ts-migrating annotate` to automatically mark them!
  ```

- [Migrating to `erasableSyntaxOnly`](./examples/erasable-syntax-only-migration/src/index.ts)
- [Migrating to `checkJs`](./examples/check-js-migration/src/index.js)

## 📦 Install and Setup

`ts-migrating` 2.x needs TypeScript 7.1 or later (it uses TypeScript's own API, from the `typescript` package you already have) and Node.js 22.18 or later.

To install:

```bash
cd my-cool-project
npm install -D ts-migrating
```

In your existing `tsconfig.json`, add `ts-migrating` to `plugins`, with the compiler options you're migrating to:

```jsonc
{
  // ...
  "compilerOptions": {
    // ...
    "plugins": [
      {
        "name": "ts-migrating",
        "compilerOptions": {
          // ... put the compiler options you wish to migrate to, for example:
          "strict": true
        }
      }
    ]
    // ...
  }
  // ...
}
```

ℹ️ _Note: `tsc`, your editor and your build ignore `plugins`. Only `ts-migrating` reads this entry. It may also live in a config you `extends` (like any `plugins`, the nearest config that defines `plugins` wins)._

🎉 Your codebase is now ready!

### ✅ Verify the Setup

- Run:

  ```bash
  npx ts-migrating check
  ```

  You should see errors from the new config, excluding those marked with `@ts-migrating`.

- Add `// @ts-migrating` before a line with an error and run it again — the error should be gone.
- Not seeing what you expect? `npx ts-migrating info path/to/file.ts` shows which tsconfig the file belongs to and whether it enables ts-migrating.

### ✨ Optional Next Steps

- Run `npx ts-migrating annotate` to automatically annotate newly introduced errors with `// @ts-migrating`.
- Add `npx ts-migrating check` to your CI to prevent unreviewed errors from slipping through. Since your editor won't show `[ts-migrating]` errors, this is where they get caught.

## 📊 JSON reporting

For CI gates and dashboards, `check` can emit a machine-readable report instead of the human-readable output:

```bash
npx ts-migrating check --reporter json    # one JSON array
npx ts-migrating check --reporter ndjson  # one JSON object per line (streamable)
```

`stdout` carries **one entry per diagnostic** (progress logs go to `stderr`, so `stdout` stays pure). The flat shape is easy to `jq`/group/count or convert to CSV. With `json` you get a single array:

```jsonc
[
  {
    "file": "src/one.ts", // relative to the current working directory
    "position": {
      // 1-based line/column; null for file-level diagnostics
      "start": { "line": 32, "column": 10 },
      "end": { "line": 32, "column": 18 }
    },
    "code": 7006, // the TypeScript error code
    "message": "Parameter 'x' implicitly has an 'any' type.",
    "origin": "ts-migrating", // "ts-migrating" = introduced by your target tsconfig; "baseline" = already present with your current tsconfig
    "markedWithTsMigratingDirective": false // true = suppressed by a @ts-migrating directive (i.e. migration debt)
  }
]
```

`--reporter ndjson` emits the exact same records, but one JSON object per line ([NDJSON](https://github.com/ndjson/ndjson-spec)) instead of an array. Prefer it on large repos: it streams (neither `ts-migrating` nor your consumer has to hold the whole report in memory) and pipes line-by-line into `jq -c`, `grep`, or `wc -l`.

This gives you everything to build your own metrics, for example:

- **Track remaining migration debt** — count entries where `markedWithTsMigratingDirective` is `true`. This is the number that trends down to zero as you migrate (the unmarked ones are kept at `0` by your CI gate).
- **Fail CI on regressions** — compare the debt count against the base branch and fail if it goes up.
- **Break down by error code** — group `origin: "ts-migrating"` entries by `code` to see what to tackle first.

```bash
# remaining migration debt
npx ts-migrating check --reporter json | jq '[.[] | select(.markedWithTsMigratingDirective)] | length'

# unmarked ts-migrating errors grouped by error code
# (filter *before* grouping so marked debt and baseline errors don't leak in)
npx ts-migrating check --reporter json \
  | jq 'map(select(.origin == "ts-migrating" and (.markedWithTsMigratingDirective | not)))
        | group_by(.code)[] | { code: .[0].code, count: length }'

# streaming: count remaining debt line-by-line, nothing held in memory
npx ts-migrating check --reporter ndjson \
  | jq -c 'select(.markedWithTsMigratingDirective)' | wc -l
```

> ℹ️ The command still exits non-zero when there are _unmarked_ `ts-migrating` errors (and, with `--all-type-errors`, when there are pre-existing `baseline` errors), so it can both gate CI and produce the report. The JSON is printed regardless of the exit code.

> ℹ️ Stale (unused) `@ts-migrating` directives are reported too — as unmarked `ts-migrating` entries with code `555` — so the JSON gate fails on them exactly like the default `check`. Filter them out with `select(.code != 555)` if you only want real type errors.

## API

You can use this project programmatically, for custom integrations such as reporting error counts to a dashboard. The functions are exposed via `ts-migrating/api` (ESM only, with TypeScript types):

- [`getTsMigratingReportForFile`](./src/api/getTsMigratingReportForFile.ts) — returns one entry per diagnostic for a file, each tagged with its `origin` (`ts-migrating` vs `baseline`) and whether it is `markedWithTsMigratingDirective`. This powers the [JSON reporter](#-json-reporting). `diagnostic` is TypeScript 7's `Diagnostic` (from `typescript/sync`).

  ```ts
  import { getTsMigratingReportForFile } from 'ts-migrating/api';

  const report = getTsMigratingReportForFile('path/to/file.ts');
  const debt = report.filter(e => e.markedWithTsMigratingDirective).length;
  ```

- [`getTsMigratingReportForFiles`](./src/api/getTsMigratingReportForFile.ts) — the same for many files at once (much faster than calling the above in a loop: each project is loaded once). It lazily yields `{ fileName, entries }` per file, grouped by project:

  ```ts
  import { getTsMigratingReportForFiles } from 'ts-migrating/api';

  for (const { fileName, entries } of getTsMigratingReportForFiles(['src/a.ts', 'src/b.ts'])) {
    console.log(fileName, entries.length);
  }
  ```

## 🚚 Migrating from 1.x

1.x stays available for TypeScript 5–6 and editor support: it lives on the [`v1` branch](https://github.com/ycmjason/ts-migrating/tree/v1) (`npm install -D ts-migrating@1`).

To move to 2.x:

1. Upgrade to TypeScript 7.1+ and Node.js 22.18+.
2. Keep your `tsconfig.json` as is: the `plugins` entry is unchanged.
3. Run `ts-migrating check` in CI (if you don't already): it is now the only place `[ts-migrating]` errors show up.

What changed:

- 🔌 **No language service plugin.** TypeScript 7 can't load it, so the `ts-migrating` package entry point (`main` / `.`) is gone and your editor shows your current `tsconfig`'s errors only. `@ts-migrating` comments are inert in the editor.
- 🧩 **API:** `ts-migrating/api` keeps `getTsMigratingReportForFile` (its `diagnostic` is now TypeScript 7's `Diagnostic`, with `fileName`, `pos`, `end`, `startPosition`, `text`, …) and adds `getTsMigratingReportForFiles`. `getSemanticDiagnosticsForFile`, `isPluginDiagnostic`, `getTSInfoForFile` and `insertSingleLineCommentAtPositions` are removed.
- 📦 **ESM only**, like TypeScript 7.
- 💾 **`--max-old-space-size` does nothing** (it only prints a warning): type-checking runs in TypeScript 7's native process, not in Node's heap.
- 📜 `check` and `annotate` now also cover `.js`/`.jsx`/`.mjs`/`.cjs`/`.mts`/`.cts` files that a tsconfig includes (handy for `checkJs` migrations), not just `.ts`/`.tsx`.

Unchanged: the `@ts-migrating` syntax, `check`'s flags, exit codes and JSON/NDJSON records, the unused-directive error code `555`, and `annotate`'s output.

## 📣 Shoutout

This project wouldn't be possible without inspiration from:

- [allegro/typescript-strict-plugin](https://github.com/allegro/typescript-strict-plugin), which 1.x's language service plugin learned a lot from.

## 👤 Author

YCM Jason
