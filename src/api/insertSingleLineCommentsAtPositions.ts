import * as recast from 'recast';
import * as typescriptParser from 'recast/parsers/babel-ts';
import { expect } from 'vitest';

const getAbsolutePosition = (
  code: string,
  { line, column }: recast.types.namedTypes.Position,
): number => {
  const lines = code.split(/(?<=\n)/);

  const lineIndex = line - 1;
  if (lineIndex < 0 || lineIndex >= lines.length) throw new RangeError('Invalid line number');
  if (column < 0 || column > (lines[lineIndex]?.length ?? 0))
    throw new RangeError('Invalid column number');

  return lines.slice(0, lineIndex).reduce((acc, l) => acc + l.length, 0) + column;
};

const getLineColumnPosition = (
  code: string,
  absolutePosition: number,
): recast.types.namedTypes.Position => {
  if (absolutePosition < 0 || absolutePosition >= code.length) {
    throw new RangeError('Invalid position');
  }

  const lines = code.split(/(?<=\n)/);

  let currentPosition = 0;
  for (const [i, line] of lines.entries()) {
    currentPosition += line.length;

    if (currentPosition > absolutePosition) {
      return {
        line: i + 1,
        column: line.length - (currentPosition - absolutePosition),
      };
    }
  }
  throw new RangeError('Invalide position');
};

if (import.meta.vitest) {
  const { it, describe } = import.meta.vitest;
  const ts = await import('typescript/lib/tsserverlibrary');

  describe('getAbsolutePosition / getLineColumnPosition', () => {
    it('should return the absolute position and back', () => {
      const code = `const a = 'hi'
const b = 'bye'
hello()`;
      const sourcefile = ts.createSourceFile(
        'tmp.ts',
        code,
        ts.ScriptTarget.Latest,
        true,
        ts.ScriptKind.TSX,
      );
      const checkForIndex = (index: number) => {
        const { line, character } = ts.getLineAndCharacterOfPosition(sourcefile, index);
        expect(getAbsolutePosition(code, { line: line + 1, column: character })).toBe(index);
        expect(getLineColumnPosition(code, index)).toEqual({ line: line + 1, column: character });
      };

      checkForIndex(code.indexOf('='));
      checkForIndex(code.indexOf('\n'));
      checkForIndex(code.indexOf('const b'));
      checkForIndex(code.indexOf('bye'));
      checkForIndex(code.indexOf('llo()'));
    });

    it('should deal with empty line start correctly', () => {
      const code = '\nconst a = "hi"';
      expect(getLineColumnPosition(code, 0)).toEqual({ line: 1, column: 0 });
    });
  });
}

export const insertSingleLineCommentAtPositions = (
  code: string,
  comment: string,
  positions: number[],
): string => {
  const ast = recast.parse(code, { parser: typescriptParser });

  const linesToAdd: Set<number> = new Set(
    positions.map(position => getLineColumnPosition(code, position).line),
  );

  recast.types.visit(ast, {
    visitNode(path) {
      const { node } = path;
      if (
        !recast.types.namedTypes.Expression.check(node) &&
        !recast.types.namedTypes.Statement.check(node)
      ) {
        return this.traverse(path);
      }

      // we don't wanna add comment before jsx nodes
      if (node.type.startsWith('JSX')) {
        return this.traverse(path);
      }

      const nodeLine = node.loc?.start.line;
      if (nodeLine === undefined) return this.traverse(path);

      if (linesToAdd.has(nodeLine)) {
        linesToAdd.delete(nodeLine);
        node.comments = [
          recast.types.builders.commentLine(` ${comment}`, true),
          ...(node?.comments ?? []),
        ];
      }

      return this.traverse(path);
    },
  });

  return recast.print(ast).code;
};

if (import.meta.vitest) {
  const { it, describe } = import.meta.vitest;

  describe('insertSingleLineCommentsAtPositions', () => {
    it('should insert comment at given position', () => {
      expect(
        insertSingleLineCommentAtPositions(`f();\ng();\n\nconst a = 'hello';`, 'hello', [0]),
      ).toMatchInlineSnapshot(`
        "// hello
        f();
        g();

        const a = 'hello';"
      `);
    });

    it('should only insert one comment if given multiple positions on the same line', () => {
      expect(
        insertSingleLineCommentAtPositions(`f();\ng();\n\nconst a = 'hello';`, 'hello', [0, 1, 2]),
      ).toMatchInlineSnapshot(`
        "// hello
        f();
        g();

        const a = 'hello';"
      `);
    });
  });
}
