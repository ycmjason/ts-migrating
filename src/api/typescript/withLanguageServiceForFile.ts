import path from 'node:path';
import ts from 'typescript/lib/tsserverlibrary';
import type { TsMigratingLanguageService } from '../../plugin/createTsMigratingProxyLanguageService';
import { isPluginEnabled } from '../getTSInfoForFile';
import { projectService } from './projectService';

/**
 * Open `targetFile` in the shared project service, hand the ts-migrating proxy
 * language service to `use`, then close the file again.
 *
 * Returns `undefined` (without invoking `use`) when the file's tsconfig does not
 * enable the `ts-migrating` plugin, so callers can fall back to an empty result.
 */
export const withLanguageServiceForFile = <T>(
  targetFile: string,
  use: (languageService: TsMigratingLanguageService, normalizedFile: string) => T,
): T | undefined => {
  const file = ts.server.toNormalizedPath(path.resolve(process.cwd(), targetFile));

  const projects = [...projectService.configuredProjects.values()];
  if (projects.every(project => !project.containsFile(file))) {
    // clear existing projects to avoid running out of memory
    // https://github.com/ycmjason/ts-migrating/issues/16
    for (const project of projects) {
      project.close();
    }
    projectService.configuredProjects.clear();
  }

  projectService.openClientFile(file);

  try {
    const project = projectService.getDefaultProjectForFile(file, true);
    if (!project) {
      throw new Error('Expect project to exist');
    }

    if (!isPluginEnabled(project.getCompilerOptions())) {
      // tsconfig that this file uses does not have `ts-migrating` declared in the plugin.
      return undefined;
    }

    return use(project.getLanguageService() as TsMigratingLanguageService, file);
  } finally {
    projectService.closeClientFile(file);
  }
};
