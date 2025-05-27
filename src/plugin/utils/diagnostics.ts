import type ts from 'typescript/lib/tsserverlibrary';
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

/**
 *  Returns a new array containing elements from `diagnostics` where they are not marked by the given directiveComments
 */
export const getUnmarkedDiagnostics = (
  newlyIntroducedDiagnostics: readonly ts.DiagnosticRelatedInformation[],
  {
    directiveComments,
    getLineNumberByPosition,
  }: {
    directiveComments: readonly ts.TodoComment[];
    getLineNumberByPosition: (position: number) => number;
  },
): ts.DiagnosticRelatedInformation[] => {
  const markedLineNumbers = new Set(
    directiveComments
      .map(({ position }) => getLineNumberByPosition(position))
      .map(markerCommentLineNumber => markerCommentLineNumber + 1),
  );
  return newlyIntroducedDiagnostics.filter(d => {
    if (d.start === undefined) return true;

    return !markedLineNumbers.has(getLineNumberByPosition(d.start));
  });
};

export const getUnusedDirectiveComments = (
  directiveComments: readonly ts.TodoComment[],
  {
    newlyIntroducedDiagnostics,
    getLineNumberByPosition,
  }: {
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
    return !newlyIntroducedDiagnosticsLineNumbers.has(markerCommentLine + 1);
  });
};
