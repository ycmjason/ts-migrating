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
  const ts = await import('typescript/lib/tsserverlibrary');

  const createDiagnosticAtPosition = (pos: number): ts.Diagnostic => ({
    start: pos,
    category: ts.DiagnosticCategory.Warning,
    code: 0,
    file: undefined,
    length: undefined,
    messageText: '',
  });

  describe('annotateDiagnostics', () => {
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

    describe('[jt]sx', () => {
      it('should add @ts-migrating correctly for tsx one-liner', () => {
        const code = 'const a = <div a={hi}></div>;';
        expect(
          annotateDiagnostics(code, [createDiagnosticAtPosition(code.indexOf('hi'))]),
        ).toMatchInlineSnapshot(`
          "// @ts-migrating
          const a = <div a={hi}></div>;"
        `);
      });

      it('should add @ts-migrating correctly for tsx attributes', () => {
        const code = 'const a = <div\n  a={hi}>\n</div>;';
        expect(
          annotateDiagnostics(code, [createDiagnosticAtPosition(code.indexOf('hi'))]),
        ).toMatchInlineSnapshot(`
          "const a = <div
            a={// @ts-migrating
            hi}>
          </div>;"
        `);
      });

      it('should add @ts-migrating correctly for tsx expressions', () => {
        const code = 'const a = <div>\n  {hi}\n</div>;';
        expect(
          annotateDiagnostics(code, [createDiagnosticAtPosition(code.indexOf('hi'))]),
        ).toMatchInlineSnapshot(`
        "const a = <div>
          {// @ts-migrating
          hi}
        </div>;"
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
        enum A {}"
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
