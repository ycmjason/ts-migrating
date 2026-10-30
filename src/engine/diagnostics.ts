import type { SourceFile } from 'typescript/ast';
import { type Diagnostic, DiagnosticCategory } from 'typescript/sync';
import { DIRECTIVE, UNUSED_DIRECTIVE_DIAGNOSTIC_CODE } from '../constants.ts';

type MessageChain = Pick<Diagnostic, 'text' | 'messageChain'>;

/**
 * Flatten a diagnostic's message chain into one string, indenting each level by
 * two spaces (like `ts.flattenDiagnosticMessageText` / `tsc`'s output).
 */
export const flattenDiagnosticMessage = (
  diagnostic: MessageChain,
  newLine = '\n',
  indentLevel = 0,
): string =>
  (indentLevel > 0 ? newLine + '  '.repeat(indentLevel) : '') +
  diagnostic.text +
  (diagnostic.messageChain ?? [])
    .map(child => flattenDiagnosticMessage(child, newLine, indentLevel + 1))
    .join('');

/** Identity of a diagnostic, for telling target-config errors apart from baseline ones. */
export const serializeDiagnostic = (d: Diagnostic): string =>
  `${d.code}/${d.pos}/${d.end}/${d.category}/${flattenDiagnosticMessage(d)}`;

/**
 * Return a new array containing elements in xs but not ys based on getComparer
 */
export const differenceBy = <T, C>(
  xs: readonly T[],
  ys: readonly T[],
  getComparer: (x: T) => C,
): T[] => {
  const ysComparerSet = new Set(ys.map(getComparer));
  return xs.filter(x => !ysComparerSet.has(getComparer(x)));
};

const getLineText = (sourceFile: SourceFile, line: number): string => {
  const lineStarts = sourceFile.getLineStarts();
  return sourceFile.text.slice(lineStarts[line], lineStarts[line + 1] ?? sourceFile.text.length);
};

/** The error reported for a `@ts-migrating` directive that marks nothing. */
export const createUnusedDirectiveDiagnostic = (
  sourceFile: SourceFile,
  position: number,
): Diagnostic => {
  const end = position + DIRECTIVE.length;
  const startPosition = sourceFile.getLineAndCharacterOfPosition(position);
  const endPosition = sourceFile.getLineAndCharacterOfPosition(end);
  return {
    fileName: sourceFile.fileName,
    pos: position,
    end,
    startPosition: { line: startPosition.line, character: startPosition.character },
    endPosition: { line: endPosition.line, character: endPosition.character },
    sourceLines: [{ line: startPosition.line, text: getLineText(sourceFile, startPosition.line) }],
    code: UNUSED_DIRECTIVE_DIAGNOSTIC_CODE,
    category: DiagnosticCategory.Error,
    text: `Unused '${DIRECTIVE}' directive.`,
  };
};
