import { createRequire } from 'node:module';
import { version as typescriptVersion } from 'typescript';
import { API } from 'typescript/sync';
import { getFileProjectInfos } from '../../engine/engine.ts';
import { packageJson } from '../../packageJson.ts';
import { expandFilePaths } from '../expandFilePaths.ts';

export const info = (_flags: unknown, ...pathsOrGlobs: string[]) => {
  console.log('System information:');
  console.log(
    JSON.stringify(
      {
        cwd: process.cwd(),
        'ts-migrating': {
          version: packageJson.version,
        },
        TypeScript: {
          path: createRequire(import.meta.url).resolve('typescript'),
          version: typescriptVersion,
        },
        nodejs: {
          version: process.version,
        },
      },
      null,
      2,
    ),
  );
  console.log();

  const fileNames = expandFilePaths(pathsOrGlobs);
  if (fileNames.length <= 0) return;

  const api = new API({ cwd: process.cwd() });
  try {
    for (const { fileName, tsconfigPath, pluginEnabled } of getFileProjectInfos(api, fileNames)) {
      console.log(`Info about "${fileName}":`);
      console.log({ tsconfigPath: tsconfigPath ?? '[not found]', pluginEnabled });
      console.log();
    }
  } finally {
    api.close();
  }
};
