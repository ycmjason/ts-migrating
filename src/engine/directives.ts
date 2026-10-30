import {
  getTokenAtPosition,
  isJSDocNodeKind,
  type Node,
  type SourceFile,
  SyntaxKind,
} from 'typescript/ast';
import { DIRECTIVE } from '../constants.ts';

/**
 * A `@ts-migrating` must open a comment (`// @ts-migrating`, `/* @ts-migrating`)
 * or a line inside a block comment (` * @ts-migrating`), and be followed by
 * whitespace or the end of the line / comment — `@ts-migrating-abc` is not a
 * directive. Mirrors TypeScript's todo-comment matching that 1.x relied on.
 */
const DIRECTIVE_CANDIDATE_PATTERN = new RegExp(
  `(^(?:\\s|\\*)*|\\/\\/+\\s*|\\/\\*+\\s*)${DIRECTIVE}(?=\\s|\\*\\/|$)`,
  'gm',
);

/** The `[pos, end)` ranges of the comments in the trivia that starts at `pos`. */
const getCommentRangesInTrivia = (text: string, pos: number): [number, number][] => {
  const ranges: [number, number][] = [];
  let i = pos;
  if (i === 0 && text.startsWith('#!')) {
    const newline = text.indexOf('\n');
    i = newline === -1 ? text.length : newline;
  }
  while (i < text.length) {
    if (/\s/.test(text.charAt(i))) {
      i += 1;
    } else if (text.startsWith('//', i)) {
      const newline = text.indexOf('\n', i);
      const end = newline === -1 ? text.length : newline;
      ranges.push([i, end]);
      i = end;
    } else if (text.startsWith('/*', i)) {
      const close = text.indexOf('*/', i + 2);
      const end = close === -1 ? text.length : close + 2;
      ranges.push([i, end]);
      i = end;
    } else {
      break;
    }
  }
  return ranges;
};

const isInComment = (sourceFile: SourceFile, position: number): boolean => {
  let token = getTokenAtPosition(sourceFile, position);
  // Inside a JSDoc comment we get the JSDoc node; its host node's leading
  // trivia holds the comment.
  while (isJSDocNodeKind(token.kind) && token.parent) token = token.parent;
  // JSX text is not trivia: `<div>// @ts-migrating</div>` is not a comment.
  if (token.kind === SyntaxKind.JsxText || token.kind === SyntaxKind.JsxTextAllWhiteSpaces) {
    return false;
  }
  return getCommentRangesInTrivia(sourceFile.text, token.pos).some(
    ([start, end]) => start <= position && position < end,
  );
};

/** Positions of every `@ts-migrating` directive in `sourceFile` (inside comments only). */
export const getDirectivePositions = (sourceFile: SourceFile): number[] => {
  const { text } = sourceFile;
  if (!text.includes(DIRECTIVE)) return [];

  const positions: number[] = [];
  for (const match of text.matchAll(DIRECTIVE_CANDIDATE_PATTERN)) {
    const position = match.index + (match[1]?.length ?? 0);
    if (isInComment(sourceFile, position)) positions.push(position);
  }
  return positions;
};

/** The first line after `fromLine` (both zero-indexed) on which a node starts. */
const findNextNonCommentLine = (sourceFile: SourceFile, fromLine: number): number => {
  // the AST has no comments! so find the first node whose line is after `fromLine`
  let found: number | undefined;
  const visit = (node: Node): void => {
    if (found !== undefined) return;
    // getStart() excludes leading trivia (comments/whitespace)
    const { line } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
    if (line > fromLine) {
      found = line;
      return;
    }
    node.forEachChild(child => {
      visit(child);
      return found !== undefined ? true : undefined;
    });
  };

  visit(sourceFile);

  return found ?? fromLine + 1;
};

export type Directive = {
  /** Offset of the `@ts-migrating` text. */
  position: number;
  /** Zero-indexed line whose newly-introduced errors this directive marks. */
  markedLine: number;
};

export const getDirectives = (sourceFile: SourceFile): Directive[] =>
  getDirectivePositions(sourceFile).map(position => ({
    position,
    markedLine: findNextNonCommentLine(
      sourceFile,
      sourceFile.getLineAndCharacterOfPosition(position).line,
    ),
  }));
