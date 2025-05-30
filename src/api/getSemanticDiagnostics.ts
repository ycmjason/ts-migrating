import path from 'node:path';
import ts from 'typescript/lib/tsserverlibrary';
import { isPluginEnabled } from './getTSInfoForFile';
import { projectService } from './typescript/projectService';

/**
 * Returns a list of {@link ts.Diagnostic} of a given file.
 *
 * This function returns `[]` if the tsconfig for the file does not list `ts-migrating` in the plugin.
 */
export function getSemanticDiagnosticsForFile(targetFile: string): ts.Diagnostic[] {
  const file = ts.server.toNormalizedPath(path.resolve(process.cwd(), targetFile));

  const projects = [...projectService.configuredProjects.values()];
  if (projects.every(project => !project.containsFile(file))) {
    // clear existing projects to avoid running out of memory
    for (const project of projects) {
      project.close();
    }
    projectService.configuredProjects.clear();
  }

  projectService.openClientFile(file);

  const project = projectService.getDefaultProjectForFile(file, true);
  if (!project) {
    throw new Error('Expect project to exist');
  }

  if (!isPluginEnabled(project.getCompilerOptions())) {
    // tsconfig that this file uses does not have `ts-migrating` declared in the plugin.
    return [];
  }

  const diagnostics = project.getLanguageService().getSemanticDiagnostics(file);

  projectService.closeClientFile(file);

  return diagnostics;
}
