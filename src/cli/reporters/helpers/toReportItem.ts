import path from 'node:path';
import type { Diagnostic } from 'typescript/sync';
import { flattenDiagnosticMessage } from '../../../engine/diagnostics.ts';
import type { DiagnosticOrigin, TsMigratingReportEntry } from '../../../engine/types.ts';

/** 1-based line/column, mirroring `tsc`/editor gutters (not LSP's 0-based). */
type Position = { line: number; column: number };

/**
 * One flat record per diagnostic — `--reporter json` prints an array of these
 * and `--reporter ndjson` prints one per line. Flat on purpose: trivial to
 * group/sort/count, or pipe onwards to CSV.
 */
export type ReportItem = {
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

/** Flatten a {@link TsMigratingReportEntry} into a serializable {@link ReportItem}. */
export const toReportItem = (
  { diagnostic, origin, markedWithTsMigratingDirective }: TsMigratingReportEntry,
  { cwd }: { cwd: string },
): ReportItem => {
  const { fileName, startPosition, endPosition } = diagnostic;

  const toPosition = ({ line, character }: { line: number; character: number }): Position => ({
    line: line + 1,
    column: character + 1,
  });

  return {
    // Normalise to forward slashes so rows line up across OSes (Windows
    // `path.relative` would otherwise emit `src\one.ts`).
    file: fileName ? path.relative(cwd, fileName).replaceAll(path.sep, '/') : '',
    position:
      fileName && startPosition && endPosition
        ? { start: toPosition(startPosition), end: toPosition(endPosition) }
        : null,
    code: diagnostic.code,
    message: flattenDiagnosticMessage(diagnostic),
    origin,
    markedWithTsMigratingDirective,
  };
};

if (import.meta.vitest) {
  const { describe, it, expect } = import.meta.vitest;
  const { DiagnosticCategory } = await import('typescript/sync');
  // `fileName` is a branded path type; plain strings are fine for these fixtures.
  const fileNameOf = (fileName: string) => fileName as Diagnostic['fileName'];

  describe('toReportItem', () => {
    const cwd = '/repo';

    it('maps a ts-migrating error to a flat item with a 1-based range', () => {
      const start = 'const a = 1;\nconst b = '.length;
      expect(
        toReportItem(
          {
            diagnostic: {
              fileName: fileNameOf('/repo/src/one.ts'),
              pos: start,
              end: start + 'obj[i]'.length,
              startPosition: { line: 1, character: 10 },
              endPosition: { line: 1, character: 16 },
              category: DiagnosticCategory.Error,
              code: 18048,
              text: "'obj[i]' is possibly 'undefined'.",
            },
            origin: 'ts-migrating',
            markedWithTsMigratingDirective: false,
          },
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
      const item = toReportItem(
        {
          diagnostic: {
            fileName: fileNameOf('/repo/src/two.ts'),
            pos: 0,
            end: 1,
            startPosition: { line: 0, character: 0 },
            endPosition: { line: 0, character: 1 },
            category: DiagnosticCategory.Error,
            code: 2304,
            text: 'Outer.',
            messageChain: [
              { pos: 0, end: 0, category: DiagnosticCategory.Error, code: 0, text: 'Inner.' },
            ],
          },
          origin: 'baseline',
          markedWithTsMigratingDirective: false,
        },
        { cwd },
      );

      expect(item.message).toBe('Outer.\n  Inner.');
      expect(item.origin).toBe('baseline');
    });

    it('returns null position for diagnostics without a source position', () => {
      expect(
        toReportItem(
          {
            diagnostic: {
              pos: 0,
              end: 0,
              category: DiagnosticCategory.Error,
              code: 1,
              text: 'whole-program error',
            },
            origin: 'baseline',
            markedWithTsMigratingDirective: false,
          },
          { cwd },
        ).position,
      ).toBeNull();
    });
  });
}
