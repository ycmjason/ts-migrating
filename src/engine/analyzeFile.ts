import type { Program } from 'typescript/sync';
import {
  createUnusedDirectiveDiagnostic,
  differenceBy,
  serializeDiagnostic,
} from './diagnostics.ts';
import { getDirectives } from './directives.ts';
import { isCheckableSourceFile } from './isCheckableSourceFile.ts';
import type { TsMigratingReportEntry } from './types.ts';

/**
 * Type-check `fileName` with both the current (`baselineProgram`) and the target
 * (`targetProgram`) compiler options and classify every diagnostic:
 *
 * - `baseline`: errors from the current tsconfig.
 * - `ts-migrating`: the errors the target tsconfig *adds*, partitioned into
 *   unmarked / marked by `@ts-migrating` directives, plus an error for every
 *   directive that marks nothing.
 */
export const analyzeFile = (
  { baselineProgram, targetProgram }: { baselineProgram: Program; targetProgram: Program },
  fileName: string,
): TsMigratingReportEntry[] => {
  // https://github.com/ycmjason/ts-migrating/issues/14
  if (!isCheckableSourceFile(fileName)) return [];

  const sourceFile = baselineProgram.getSourceFile(fileName);
  if (!sourceFile) return [];

  const baseline = baselineProgram.getSemanticDiagnostics(fileName);
  const newlyIntroduced = differenceBy(
    targetProgram.getSemanticDiagnostics(fileName),
    baseline,
    serializeDiagnostic,
  );

  const getLine = (position: number): number =>
    sourceFile.getLineAndCharacterOfPosition(position).line;

  const directives = getDirectives(sourceFile);
  const markedLines = new Set(directives.map(({ markedLine }) => markedLine));
  const newlyIntroducedLines = new Set(newlyIntroduced.map(({ pos }) => getLine(pos)));

  const entries: TsMigratingReportEntry[] = baseline.map(diagnostic => ({
    diagnostic,
    origin: 'baseline',
    markedWithTsMigratingDirective: false,
  }));

  const marked: TsMigratingReportEntry[] = [];
  for (const diagnostic of newlyIntroduced) {
    const isMarked = markedLines.has(getLine(diagnostic.pos));
    (isMarked ? marked : entries).push({
      diagnostic,
      origin: 'ts-migrating',
      markedWithTsMigratingDirective: isMarked,
    });
  }

  for (const { position, markedLine } of directives) {
    if (newlyIntroducedLines.has(markedLine)) continue;
    entries.push({
      diagnostic: createUnusedDirectiveDiagnostic(sourceFile, position),
      origin: 'ts-migrating',
      markedWithTsMigratingDirective: false,
    });
  }

  return [...entries, ...marked];
};
