import path from 'node:path';
import process from 'node:process';
import ts from 'typescript/lib/tsserverlibrary';
import { getTsMigratingReportForFile } from '../../api/getTsMigratingReportForFile';
import type { DiagnosticOrigin, TsMigratingReportEntry } from '../../api/mod';
import { getPluginEnabledTSFilePaths } from '../ops/getPluginEnabledTSFilePaths';

/** 1-based line/column, mirroring `tsc`/editor gutters (not LSP's 0-based). */
type Position = { line: number; column: number };

/**
 * One flat record per diagnostic — `--reporter json` prints an array of these
 * and `--reporter ndjson` prints one per line. Flat on purpose: trivial to
 * group/sort/count, or pipe onwards to CSV.
 */
export type ReportRow = {
  /** Path relative to the current working directory. */
  file: string;
  /** `null` for file-level diagnostics that have no source position. */
  position: { start: Position; end: Position } | null;
  /** The TypeScript error code, e.g. `7006`. */
  code: number;
  message: string;
  origin: DiagnosticOrigin;
  markedWithTsMigratingDirective: boolean;
};

const toReportRow = (
  { diagnostic, origin, markedWithTsMigratingDirective }: TsMigratingReportEntry,
  { cwd }: { cwd: string },
): ReportRow => {
  const sourceFile = diagnostic.file;

  const position = (() => {
    if (!sourceFile || diagnostic.start === undefined) return null;
    const toPosition = (offset: number): Position => {
      const { line, character } = sourceFile.getLineAndCharacterOfPosition(offset);
      return { line: line + 1, column: character + 1 };
    };
    return {
      start: toPosition(diagnostic.start),
      end: toPosition(diagnostic.start + (diagnostic.length ?? 0)),
    };
  })();

  return {
    file: sourceFile ? path.relative(cwd, sourceFile.fileName) : '',
    position,
    code: diagnostic.code,
    message: ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'),
    origin,
    markedWithTsMigratingDirective,
  };
};

/**
 * Backpressure-aware stdout write: when stdout's buffer is full, `write` returns
 * false and we wait for `drain` before producing more, so a slow consumer can't
 * make Node buffer the whole report in memory. See
 * https://github.com/ycmjason/ts-migrating/issues/16
 */
export const write = async (chunk: string): Promise<void> => {
  if (!process.stdout.write(chunk)) {
    await new Promise<void>(resolve => process.stdout.once('drain', resolve));
  }
};

/**
 * Shared engine for the row-based (json / ndjson) reporters: discover files,
 * turn every diagnostic into a {@link ReportRow} and hand it to `onRow`, then
 * run `onDone`, and finally exit with the same CI gate as the pretty reporter —
 * unmarked ts-migrating errors fail, and with `allTypeErrors` baseline errors do
 * too (marked debt never does). A reporter decides only *how* a row is written.
 */
export const runRowReporter = async (
  { verbose, allTypeErrors }: { verbose: boolean; allTypeErrors: boolean },
  inputPaths: string[],
  {
    onRow,
    onDone,
  }: {
    onRow: (row: ReportRow) => void | Promise<void>;
    onDone?: () => void | Promise<void>;
  },
): Promise<void> => {
  // stdout must contain only the report, so divert all progress chatter
  // (here and inside `getPluginEnabledTSFilePaths`) to stderr.
  const pluginEnabledFiles = getPluginEnabledTSFilePaths(inputPaths, {
    verbose,
    log: console.error,
  });

  const cwd = process.cwd();
  let unmarkedTsMigratingErrorCount = 0;
  let baselineErrorCount = 0;

  for (const file of pluginEnabledFiles) {
    for (const entry of getTsMigratingReportForFile(file)) {
      const row = toReportRow(entry, { cwd });
      if (row.origin === 'baseline') {
        baselineErrorCount += 1;
      } else if (!row.markedWithTsMigratingDirective) {
        unmarkedTsMigratingErrorCount += 1;
      }
      await onRow(row);
    }
  }
  await onDone?.();

  const hasBlockingErrors =
    unmarkedTsMigratingErrorCount > 0 || (allTypeErrors && baselineErrorCount > 0);

  // Force-exit (the TS server keeps the event loop alive), but only once stdout
  // has fully flushed, so the last rows can't be truncated.
  process.stdout.write('', () => process.exit(hasBlockingErrors ? 1 : 0));
};

if (import.meta.vitest) {
  const { describe, it, expect } = import.meta.vitest;

  const sourceFileOf = (fileName: string, content: string): ts.SourceFile =>
    ts.createSourceFile(fileName, content, ts.ScriptTarget.ESNext, true);

  describe('toReportRow', () => {
    const cwd = '/repo';

    it('maps a ts-migrating error to a flat row with a 1-based range', () => {
      const file = sourceFileOf('/repo/src/one.ts', 'const a = 1;\nconst b = obj[i];\n');
      const start = 'const a = 1;\nconst b = '.length;
      const diagnostic: ts.Diagnostic = {
        category: ts.DiagnosticCategory.Error,
        code: 18048,
        file,
        start,
        length: 'obj[i]'.length,
        messageText: "'obj[i]' is possibly 'undefined'.",
      };

      expect(
        toReportRow(
          { diagnostic, origin: 'ts-migrating', markedWithTsMigratingDirective: false },
          { cwd },
        ),
      ).toEqual({
        file: 'src/one.ts',
        position: {
          start: { line: 2, column: 11 },
          end: { line: 2, column: 17 },
        },
        code: 18048,
        message: "'obj[i]' is possibly 'undefined'.",
        origin: 'ts-migrating',
        markedWithTsMigratingDirective: false,
      });
    });

    it('flattens message chains and preserves origin/marked', () => {
      const file = sourceFileOf('/repo/src/two.ts', 'x;\n');
      const diagnostic: ts.Diagnostic = {
        category: ts.DiagnosticCategory.Error,
        code: 2304,
        file,
        start: 0,
        length: 1,
        messageText: {
          category: ts.DiagnosticCategory.Error,
          code: 2304,
          messageText: 'Outer.',
          next: [{ category: ts.DiagnosticCategory.Error, code: 0, messageText: 'Inner.' }],
        },
      };

      const row = toReportRow(
        { diagnostic, origin: 'baseline', markedWithTsMigratingDirective: false },
        { cwd },
      );

      expect(row.message).toBe('Outer.\n  Inner.');
      expect(row.origin).toBe('baseline');
    });

    it('returns null position for diagnostics without a source position', () => {
      const diagnostic: ts.Diagnostic = {
        category: ts.DiagnosticCategory.Error,
        code: 1,
        file: undefined,
        start: undefined,
        length: undefined,
        messageText: 'whole-program error',
      };

      expect(
        toReportRow(
          { diagnostic, origin: 'baseline', markedWithTsMigratingDirective: false },
          { cwd },
        ).position,
      ).toBeNull();
    });
  });
}
