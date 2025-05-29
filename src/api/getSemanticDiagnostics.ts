import path from 'node:path';
import ts from 'typescript/lib/tsserverlibrary';
import { createProjectService } from './typescript/createProjectService';

const PROJECT_KIND_CONFIGURED = 1;
const projectService = createProjectService();
/**
 * Returns the {@link Diagnostic} of a given file. This function only check for files that has a tsconfig that includes them.
 */
export function getSemanticDiagnosticsForFile(targetFile: string): ts.Diagnostic[] {
  const file = ts.server.toNormalizedPath(path.resolve(process.cwd(), targetFile));

  const projects = [...projectService.configuredProjects.values()];
  if (!projects.some(project => project.containsFile(file))) {
    // clear existing projects to avoid running out of memory
    for (const project of projects) {
      project.close();
    }
    projectService.configuredProjects.clear();
  }

  projectService.openClientFile(file);

  const project = projectService.getDefaultProjectForFile(file, false);

  if (project?.projectKind !== PROJECT_KIND_CONFIGURED) {
    return [];
  }

  if (!project) {
    throw new Error('Expect project to exist');
  }

  const diagnostics = project.getLanguageService().getSemanticDiagnostics(file);

  projectService.closeClientFile(file);

  return diagnostics;
}
