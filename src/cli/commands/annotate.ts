import fs from 'node:fs/promises';
import type ts from 'typescript/lib/tsserverlibrary';
import { getSemanticDiagnosticsForFile } from '../../api/getSemanticDiagnostics';
import { insertSingleLineCommentAtPositions } from '../../api/insertSingleLineCommentsAtPositions';
import { isPluginDiagnostic } from '../../api/isPluginDiagnostic';
import { DIRECTIVE } from '../../plugin/constants/DIRECTIVE';
import { UNUSED_DIRECTIVE_DIAGNOSTIC_CODE } from '../../plugin/constants/UNUSED_DIRECTIVE_DIAGNOSTIC_CODE';
import { ANNOTATE_WARNING } from '../constants/annotate-warning';
import { getPluginEnabledTSFilePaths } from '../ops/getPluginEnabledTSFilePaths';

const annotateDiagnostics = (source: string, diagnostics: readonly ts.Diagnostic[]): string => {
  return insertSingleLineCommentAtPositions(
    source,
    DIRECTIVE,
    diagnostics
      .map(diagnostic => diagnostic.start)
      // filter last because of how typescript works :(
      .filter(s => s !== undefined),
  );
};

if (import.meta.vitest) {
  const { describe, it, expect } = import.meta.vitest;

  describe('annotateDiagnostics', async () => {
    const ts = await import('typescript/lib/tsserverlibrary');

    const createDiagnosticAtPosition = (pos: number): ts.Diagnostic => ({
      start: pos,
      category: ts.DiagnosticCategory.Warning,
      code: 0,
      file: undefined,
      length: undefined,
      messageText: '',
    });

    it('should add @ts-migrating before the first line', () => {
      expect(
        annotateDiagnostics(`const a = 'hello';`, [createDiagnosticAtPosition(0)]),
      ).toMatchInlineSnapshot(`
        "// @ts-migrating
        const a = 'hello';"
      `);
    });

    it('should add @ts-migrating before the string', () => {
      expect(
        annotateDiagnostics(`const a = 'hello';`, [createDiagnosticAtPosition(10)]),
      ).toMatchInlineSnapshot(`
        "// @ts-migrating
        const a = 'hello';"
      `);
    });

    it('should add @ts-migrating before the first line and the string', () => {
      const code = `const a = 'hello';`;
      expect(
        annotateDiagnostics(code, [
          createDiagnosticAtPosition(0),
          createDiagnosticAtPosition(code.indexOf("'")),
        ]),
      ).toMatchInlineSnapshot(`
        "// @ts-migrating
        const a = 'hello';"
      `);
    });

    describe('jsx', () => {
      it('should add @ts-migrating correctly for jsx one-liner', () => {
        const code = 'const a = <div a={hi}></div>;';
        expect(
          annotateDiagnostics(code, [createDiagnosticAtPosition(code.indexOf('hi'))]),
        ).toMatchInlineSnapshot(`
          "// @ts-migrating
          const a = <div a={hi}></div>;"
        `);
      });

      it('should add @ts-migrating correctly for jsx attributes', () => {
        const code = 'const a = <div\n  a={hi}>\n</div>;';
        expect(
          annotateDiagnostics(code, [createDiagnosticAtPosition(code.indexOf('hi'))]),
        ).toMatchInlineSnapshot(`
          "const a = <div
            // @ts-migrating
            a={hi}>
          </div>;"
        `);
      });

      it('should add @ts-migrating correctly for jsx expressions', () => {
        const code = 'const a = <div>\n  {hi}\n</div>;';
        expect(
          annotateDiagnostics(code, [createDiagnosticAtPosition(code.indexOf('hi'))]),
        ).toMatchInlineSnapshot(`
          "const a = <div>
            {/* @ts-migrating */}
            {hi}
          </div>;"
        `);
      });

      it('should add @ts-migrating correctly for jsx fragment', () => {
        const code = 'const a = <>\n  {hi}\n</>;';
        expect(
          annotateDiagnostics(code, [createDiagnosticAtPosition(code.indexOf('hi'))]),
        ).toMatchInlineSnapshot(`
          "const a = <>
            {/* @ts-migrating */}
            {hi}
          </>;"
        `);
      });

      it('should add @ts-migrating correctly for jsx expressions with attributes', () => {
        const code = 'const a = <div\n  id="yo">\n<div>{hi}</div>\n</div>; const b = 3';
        expect(
          annotateDiagnostics(code, [
            createDiagnosticAtPosition(code.indexOf('hi')),
            createDiagnosticAtPosition(code.indexOf('yo')),
          ]),
        ).toMatchInlineSnapshot(`
          "const a = <div
            // @ts-migrating
            id="yo">
            {/* @ts-migrating */}
          <div>{hi}</div>
          </div>; const b = 3"
        `);
      });

      it('should add @ts-migrating correctly for iife within jsx', () => {
        const code = `const a = <Button>
  {(() => { f(); })()}
  {(() => {
    g();
  })()}
</Button>
`;
        expect(
          annotateDiagnostics(code, [
            createDiagnosticAtPosition(code.indexOf('f')),
            createDiagnosticAtPosition(code.indexOf('g')),
          ]),
        ).toMatchInlineSnapshot(`
          "const a = <Button>
            {/* @ts-migrating */}
            {(() => { f(); })()}
            {(() => {
              // @ts-migrating
              g();
            })()}
          </Button>
          "
        `);
      });
    });

    describe('enum', () => {
      it('should add @ts-migrating correctly for enum', () => {
        const code = 'enum A { }';
        expect(
          annotateDiagnostics(code, [createDiagnosticAtPosition(code.indexOf('A'))]),
        ).toMatchInlineSnapshot(`
          "// @ts-migrating
          enum A { }"
        `);
      });

      it('should add @ts-migrating correctly for weird formatted enum', () => {
        const code = 'enum\nA { }';
        expect(
          annotateDiagnostics(code, [createDiagnosticAtPosition(code.indexOf('A'))]),
        ).toMatchInlineSnapshot(`
          "enum
          // @ts-migrating
          A { }"
        `);
      });
    });

    describe('string template', () => {
      it('should add @ts-migrating correctly for string template', () => {
        const code = 'const message = `I am\n freaking ${awesome}.`;';
        expect(
          annotateDiagnostics(code, [createDiagnosticAtPosition(code.indexOf('awesome'))]),
        ).toMatchInlineSnapshot(`
          "const message = \`I am
           freaking \${// @ts-migrating
          awesome}.\`;"
        `);
      });

      it('should add @ts-migrating correctly for string template with multiple errors', () => {
        const code =
          'const message = `I am\n freaking ${awesome}, ${cool}\n, ${fantastic}, \n${lovely}.`;';
        expect(
          annotateDiagnostics(code, [
            createDiagnosticAtPosition(code.indexOf('awesome')),
            createDiagnosticAtPosition(code.indexOf('cool')),
            createDiagnosticAtPosition(code.indexOf('fantastic')),
            createDiagnosticAtPosition(code.indexOf('lovely')),
          ]),
        ).toMatchInlineSnapshot(`
          "const message = \`I am
           freaking \${// @ts-migrating
          awesome}, \${cool}
          , \${// @ts-migrating
          fantastic}, 
          \${// @ts-migrating
          lovely}.\`;"
        `);
      });

      it('should add @ts-migrating correctly for naive lines after string template', () => {
        const code = 'const x = `I am ${cool}\n${awesome}`;\nf();\ng();';
        expect(
          annotateDiagnostics(code, [
            createDiagnosticAtPosition(code.indexOf('cool')),
            createDiagnosticAtPosition(code.indexOf('awesome')),
            createDiagnosticAtPosition(code.indexOf('f')),
            createDiagnosticAtPosition(code.indexOf('g')),
          ]),
        ).toMatchInlineSnapshot(`
          "// @ts-migrating
          const x = \`I am \${cool}
          \${// @ts-migrating
          awesome}\`;
          // @ts-migrating
          f();
          // @ts-migrating
          g();"
        `);
      });

      // https://github.com/ycmjason/ts-migrating/issues/2
      it('issue #2', () => {
        const code = `const x = z\`I am \${cool}
\${(awesome) => {
  f();
}}\`;
g();`;
        expect(
          annotateDiagnostics(code, [
            createDiagnosticAtPosition(code.indexOf('cool')),
            createDiagnosticAtPosition(code.indexOf('awesome')),
            createDiagnosticAtPosition(code.indexOf('f')),
            createDiagnosticAtPosition(code.indexOf('g')),
          ]),
        ).toMatchInlineSnapshot(`
          "// @ts-migrating
          const x = z\`I am \${cool}
          \${// @ts-migrating
          awesome => {
            // @ts-migrating
            f();
          }}\`;
          // @ts-migrating
          g();"
        `);
      });
    });

    it('should add @ts-migrating comment last', () => {
      const code = '// hello world\nconst x = 3;';
      expect(
        annotateDiagnostics(code, [createDiagnosticAtPosition(code.indexOf('x'))]),
      ).toMatchInlineSnapshot(`
        "// hello world
        // @ts-migrating
        const x = 3;"
      `);
    });

    it('should add @ts-migrating correctly for object computed property name', () => {
      const code = 'const obj = {\n  [a]: 3,\n}';
      expect(
        annotateDiagnostics(code, [createDiagnosticAtPosition(code.indexOf('a'))]),
      ).toMatchInlineSnapshot(`
        "const obj = {
          // @ts-migrating
          [a]: 3,
        }"
      `);
    });

    describe('if-else', () => {
      it('should add @ts-migrating correctly for else if', () => {
        const code = `if (a) {
f();
} else if (b) {
} else {
}`;
        expect(
          annotateDiagnostics(code, [createDiagnosticAtPosition(code.indexOf('b'))]),
        ).toMatchInlineSnapshot(`
          "if (a) {
          f();
          // @ts-migrating
          } else if (b) {
          } else {
          }"
        `);
      });

      it('should add @ts-migrating correctly for else if', () => {
        const code = `if (a) {
f();
}
else if (b) {
} else {
}`;
        expect(
          annotateDiagnostics(code, [createDiagnosticAtPosition(code.indexOf('b'))]),
        ).toMatchInlineSnapshot(`
          "if (a) {
          f();
          }
          // @ts-migrating
          else if (b) {
          } else {
          }"
        `);
      });
    });

    describe('for-loop', () => {
      it('should add @ts-migrating correctly for for-loops', () => {
        const code = `for (let i = 0; i < callbacks.length; i += 1) {
  callbacks[i](event);
}`;

        expect(
          annotateDiagnostics(code, [createDiagnosticAtPosition(code.indexOf('callbacks[i]'))]),
        ).toMatchInlineSnapshot(`
          "for (let i = 0; i < callbacks.length; i += 1) {
            // @ts-migrating
            callbacks[i](event);
          }"
        `);
      });
    });

    it('should deal with chains correctly', () => {
      const code = `const panel1ScrollHeight = jest
      .spyOn(panel1, "scrollHeight", "get");`;
      expect(
        annotateDiagnostics(code, [createDiagnosticAtPosition(code.indexOf('spyOn'))]),
      ).toMatchInlineSnapshot(`
        "const panel1ScrollHeight = jest
              // @ts-migrating
              .spyOn(panel1, "scrollHeight", "get");"
      `);
    });
  });
}

export const annotate = async ({ verbose }: { verbose: boolean }, ...inputPaths: string[]) => {
  const files = getPluginEnabledTSFilePaths(inputPaths, { verbose });

  console.log(ANNOTATE_WARNING);

  console.log('⏳ Gathering errors introduced in your new tsconfig. This may take a while...');

  console.time('Type checking');
  const filePathAndPluginDiagnostics = files.map(filePath => ({
    filePath,
    diagnostics: getSemanticDiagnosticsForFile(filePath).filter(
      d => isPluginDiagnostic(d) && d.code !== UNUSED_DIRECTIVE_DIAGNOSTIC_CODE,
    ),
  }));
  console.timeEnd('Type checking');

  console.time('Annotation');
  await Promise.all(
    filePathAndPluginDiagnostics.map(async ({ filePath, diagnostics }) => {
      await fs.writeFile(
        filePath,
        annotateDiagnostics(await fs.readFile(filePath, 'utf8'), diagnostics),
      );
      console.log(
        `✅ Annotated ${filePath} (${diagnostics.length} directive${diagnostics.length === 1 ? '' : 's'} added)`,
      );
    }),
  );
  console.timeEnd('Annotation');

  console.log(
    '✨ Annotation complete! Remember to run your formatter / linter, and potentially this command again to fully annotate all errors.',
  );
};
