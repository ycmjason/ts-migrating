import { rmSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { getSemanticDiagnosticsForFile } from './getSemanticDiagnostics';
import { isPluginDiagnostic } from './isPluginDiagnostic';

/**
 * End-to-end coverage for https://github.com/ycmjason/ts-migrating/issues/14
 *
 * These run the *real* plugin loaded by a real `ts.server.ProjectService`
 * (see ./typescript/projectService) via `getSemanticDiagnosticsForFile`.
 *
 * Note: a plain TypeScript program never pulls a `.html` file in (TS gates
 * program membership by extension), and only the Angular Language Service
 * attaches templates to the plugin's project. We can't install Angular here, so
 * the precise "template is in the program" regression is covered deterministically
 * in ../plugin/createTsMigratingProxyLanguageService.test.ts. These E2E tests
 * prove the plugin pipeline runs end-to-end and never flags a template file.
 */

const ROOT = join(tmpdir(), 'ts-migrating-issue14-e2e');
afterAll(() => rmSync(ROOT, { recursive: true, force: true }));

let counter = 0;
const setupTmpDir = async (files: Record<string, string>): Promise<string> => {
  const dir = join(ROOT, (counter++).toString());
  for (const [relativePath, content] of Object.entries(files)) {
    const fullPath = join(dir, relativePath);
    await mkdir(dirname(fullPath), { recursive: true });
    await writeFile(fullPath, content, 'utf8');
  }
  return dir;
};

const tsconfig = JSON.stringify({
  compilerOptions: {
    target: 'ES2020',
    module: 'commonjs',
    strict: false,
    skipLibCheck: true,
    esModuleInterop: true,
    forceConsistentCasingInFileNames: true,
    plugins: [{ name: 'ts-migrating', compilerOptions: { strict: true } }],
  },
  include: ['src'],
  exclude: ['node_modules', 'dist'],
});

describe('issue #14 (e2e): Angular-style component through the real plugin', () => {
  it('flags target-config errors in the component .ts (pipeline runs end-to-end)', async () => {
    const dir = await setupTmpDir({
      './tsconfig.json': tsconfig,
      // `noImplicitAny` (part of `strict`) flags the untyped parameter.
      './src/app.component.ts': `export class AppComponent {\n  greet(name) {\n    return \`hi \${name}\`;\n  }\n}\n`,
    });

    const pluginDiagnostics = getSemanticDiagnosticsForFile(
      join(dir, 'src/app.component.ts'),
    ).filter(isPluginDiagnostic);

    expect(pluginDiagnostics.length).toBeGreaterThan(0);
  });

  it('does not surface plugin diagnostics for an .html template (and does not throw)', async () => {
    const dir = await setupTmpDir({
      './tsconfig.json': tsconfig,
      './src/app.component.ts': `export class AppComponent {\n  title = 'hello';\n}\n`,
      './src/app.component.html': `<div class="title">{{ title }}</div>\n<span>{{ undefinedVariable }}</span>\n`,
    });

    const diagnostics = getSemanticDiagnosticsForFile(join(dir, 'src/app.component.html'));

    expect(diagnostics.filter(isPluginDiagnostic)).toEqual([]);
  });
});
