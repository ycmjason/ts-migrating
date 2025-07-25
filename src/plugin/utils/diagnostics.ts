import ts from 'typescript/lib/tsserverlibrary';
import { PLUGIN_DIAGNOSTIC_TAG } from '../constants/PLUGIN_DIAGNOSTIC_TAG';

const serializeDiagnosticMessageText = (
  m: ts.DiagnosticRelatedInformation['messageText'],
): string => {
  if (typeof m === 'string') return m;
  const serializedNext =
    m.next === undefined ? '' : m.next.map(chain => serializeDiagnosticMessageText(chain)).join('');

  return m.messageText + serializedNext;
};

export const serializeDiagnostic = (d: ts.DiagnosticRelatedInformation): string =>
  `${d.code}/${d.start}/${d.length}/${d.file}/${d.category}/${serializeDiagnosticMessageText(d.messageText)}`;

export const brandifyDiagnostic = (
  d: ts.DiagnosticRelatedInformation,
): ts.DiagnosticRelatedInformation => {
  return {
    ...d,
    messageText: {
      category: d.category,
      code: d.code,
      messageText: PLUGIN_DIAGNOSTIC_TAG,
      next: [
        typeof d.messageText === 'string'
          ? {
              category: d.category,
              code: d.code,
              messageText: d.messageText,
            }
          : d.messageText,
      ],
    },
  };
};

const findNextNonCommentLine = (
  sourceFile: ts.SourceFile,
  /** zero indexed */
  fromLine: number,
): number => {
  // typescript ast has no comments! so find the first AST node's line number that is after `fromLine`
  let found: number | undefined;
  const visit = (node: ts.Node) => {
    const { line } = ts.getLineAndCharacterOfPosition(sourceFile, node.pos);
    if (found !== undefined) return node;
    if (line > fromLine) {
      found = line;
      return node;
    }

    return ts.visitEachChild(node, visit, undefined);
  };

  visit(sourceFile);

  return found ?? fromLine + 1;
};

/**
 *  Returns a new array containing elements from `diagnostics` where they are not marked by the given directiveComments
 */
export const getUnmarkedDiagnostics = (
  newlyIntroducedDiagnostics: readonly ts.DiagnosticRelatedInformation[],
  {
    sourceFile,
    directiveComments,
    getLineNumberByPosition,
  }: {
    sourceFile: ts.SourceFile;
    directiveComments: readonly ts.TodoComment[];
    getLineNumberByPosition: (position: number) => number;
  },
): ts.DiagnosticRelatedInformation[] => {
  const markedLineNumbers = new Set(
    directiveComments
      .map(({ position }) => getLineNumberByPosition(position))
      .map(markerCommentLineNumber => findNextNonCommentLine(sourceFile, markerCommentLineNumber)),
  );
  return newlyIntroducedDiagnostics.filter(d => {
    if (d.start === undefined) return true;

    return !markedLineNumbers.has(getLineNumberByPosition(d.start));
  });
};

export const getUnusedDirectiveComments = (
  directiveComments: readonly ts.TodoComment[],
  {
    sourceFile,
    newlyIntroducedDiagnostics,
    getLineNumberByPosition,
  }: {
    sourceFile: ts.SourceFile;
    newlyIntroducedDiagnostics: readonly ts.DiagnosticRelatedInformation[];
    getLineNumberByPosition: (position: number) => number;
  },
) => {
  const newlyIntroducedDiagnosticsLineNumbers = new Set(
    newlyIntroducedDiagnostics
      .map(({ start }) => start)
      .filter(startPosition => startPosition !== undefined)
      .map(startPosition => getLineNumberByPosition(startPosition)),
  );

  return directiveComments.filter(({ position }) => {
    const markerCommentLine = getLineNumberByPosition(position);
    return !newlyIntroducedDiagnosticsLineNumbers.has(
      findNextNonCommentLine(sourceFile, markerCommentLine),
    );
  });
};
