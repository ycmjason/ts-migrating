import path from 'node:path';
import ts from 'typescript/lib/tsserverlibrary';
import { getPluginsFromCompilerOptions } from './typescript/getPluginsFromCompilerOptions';
import { projectService } from './typescript/projectService';

type TSInfo = {
  tsconfigPath: string;
  pluginEnabled: boolean;
};

export const getTSInfoForFile = (filePath: string): TSInfo => {
  const file = ts.server.toNormalizedPath(path.resolve(process.cwd(), filePath));
  projectService.openClientFile(file);

  const tsInfo = (() => {
    const project = projectService.getDefaultProjectForFile(file, true);
    const compilerOptions = project?.getCompilerOptions() ?? {};
    return {
      tsconfigPath: (compilerOptions.configFilePath as string) ?? '[not found]',
      pluginEnabled: isPluginEnabled(compilerOptions),
    };
  })();

  projectService.closeClientFile(file);
  return tsInfo;
};

export const isPluginEnabled = (compilerOptions: ts.CompilerOptions): boolean =>
  getPluginsFromCompilerOptions(compilerOptions).some(({ name }) => name === 'ts-migrating');
