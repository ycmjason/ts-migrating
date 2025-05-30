import ts from 'typescript/lib/tsserverlibrary';
import packageJson from '../../../package.json' with { type: 'json' };
import { getTSInfoForFile } from '../../api/mod';
import { expandTSFilePaths } from '../expandTSFilePaths';

export const info = (flags: unknown, ...pathsOrGlobs: string[]) => {
  console.log('System information:');
  console.log(
    JSON.stringify(
      {
        cwd: process.cwd(),
        'ts-migrating': {
          version: packageJson.version,
        },
        TypeScript: {
          path: require.resolve('typescript'),
          version: ts.version,
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

  for (const filePath of expandTSFilePaths(pathsOrGlobs)) {
    console.log(`Info about "${filePath}":`);
    console.log(getTSInfoForFile(filePath));
    console.log();
  }
};
