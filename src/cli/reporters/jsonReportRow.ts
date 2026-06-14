import path from 'node:path';
import ts from 'typescript/lib/tsserverlibrary';
import type { DiagnosticOrigin, TsMigratingReportEntry } from '../../api/mod';

/** 1-based line/column, mirroring `tsc`/editor gutters (not LSP's 0-based). */
type Position = { line: number; column: number };

/**
 * One flat record per diagnostic — `ts-migrating check --reporter json` prints
 * an array of these and `--reporter ndjson` prints one per line. Flat on
 * purpose: trivial to group/sort/count, or pipe onwards to CSV.
 */
export type JsonReportRow = {
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

export const toJsonReportRow = (
  { diagnostic, origin, markedWithTsMigratingDirective }: TsMigratingReportEntry,
  { cwd }: { cwd: string },
): JsonReportRow => {
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

if (import.meta.vitest) {
  const { describe, it, expect } = import.meta.vitest;

  const sourceFileOf = (fileName: string, content: string): ts.SourceFile =>
    ts.createSourceFile(fileName, content, ts.ScriptTarget.ESNext, true);

  describe('toJsonReportRow', () => {
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
        toJsonReportRow(
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

      const row = toJsonReportRow(
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
        toJsonReportRow(
          { diagnostic, origin: 'baseline', markedWithTsMigratingDirective: false },
          { cwd },
        ).position,
      ).toBeNull();
    });
  });
}
