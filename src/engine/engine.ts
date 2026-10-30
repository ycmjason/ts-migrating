import path from 'node:path';
import { API } from 'typescript/sync';
import { analyzeFile } from './analyzeFile.ts';
import { createGetNearestTsconfigMembership } from './getNearestTsconfigMembership.ts';
import { isCheckableSourceFile } from './isCheckableSourceFile.ts';
import { isPluginEnabled, resolveTargetCompilerOptions } from './resolveTargetCompilerOptions.ts';
import type { TsMigratingFileReport } from './types.ts';

/**
 * Run `use` with a TypeScript API instance (which spawns TypeScript's native
 * process) and close it afterwards.
 */
export const withApi = <T>(use: (api: API) => T, { cwd = process.cwd() } = {}): T => {
  const api = new API({ cwd });
  try {
    return use(api);
  } finally {
    api.close();
  }
};

export type FileProjectInfo = {
  /** Absolute path of the file. */
  fileName: string;
  /** The tsconfig of the file's default project, if it has one. */
  tsconfigPath: string | undefined;
  /** Whether that tsconfig lists the `ts-migrating` plugin. */
  pluginEnabled: boolean;
};

/**
 * Find each file's default project (as an editor would) and whether that
 * project's tsconfig enables ts-migrating. Files outside of every tsconfig get
 * `tsconfigPath: undefined`.
 */
export const getFileProjectInfos = (api: API, fileNames: readonly string[]): FileProjectInfo[] => {
  const absoluteFileNames = fileNames.map(fileName => path.resolve(fileName));
  const getNearestTsconfigMembership = createGetNearestTsconfigMembership(api);
  const openableFileNames = new Set(
    absoluteFileNames.filter(fileName => {
      // TypeScript has no project for anything else (e.g. `.html`, issue #14).
      if (!isCheckableSourceFile(fileName)) return false;
      const membership = getNearestTsconfigMembership(fileName);
      // JS files are only worth opening when a tsconfig includes them; this
      // keeps build output (e.g. `dist/**/*.js`) out of inferred projects.
      if (/\.[cm]?jsx?$/i.test(fileName)) return membership === 'included';
      return membership !== 'unopenable';
    }),
  );
  if (openableFileNames.size <= 0) {
    return absoluteFileNames.map(fileName => ({
      fileName,
      tsconfigPath: undefined,
      pluginEnabled: false,
    }));
  }

  // Only loads the projects (parse + bind); nothing is type-checked here.
  const snapshot = api.createSnapshot({ openFiles: [...openableFileNames] });
  try {
    return absoluteFileNames.map(fileName => {
      const project = openableFileNames.has(fileName)
        ? snapshot.getDefaultProjectForFile(fileName)
        : undefined;
      const tsconfigPath = project?.configFileName;
      return {
        fileName,
        tsconfigPath,
        pluginEnabled:
          tsconfigPath !== undefined && isPluginEnabled(project?.parsedCommandLine.options ?? {}),
      };
    });
  } finally {
    snapshot.dispose();
  }
};

/**
 * Report `fileNames`, which must all belong to the (ts-migrating enabled)
 * project of `tsconfigPath`.
 *
 * The project gets one snapshot holding both its original program and a
 * program with the target compiler options; it is disposed once the files are
 * reported (or the consumer stops iterating).
 */
export function* reportProjectFiles(
  api: API,
  tsconfigPath: string,
  fileNames: readonly string[],
): Generator<TsMigratingFileReport> {
  const [firstFileName] = fileNames;
  if (firstFileName === undefined) return;

  const snapshot = api.createSnapshot({ openFiles: [firstFileName] });
  try {
    const project =
      snapshot.getConfiguredProject(tsconfigPath) ??
      snapshot.getDefaultProjectForFile(firstFileName);
    if (!project) throw new Error(`[ts-migrating] Could not load the project ${tsconfigPath}.`);

    const { parsedCommandLine } = project;
    const targetCompilerOptions = resolveTargetCompilerOptions(
      api,
      tsconfigPath,
      parsedCommandLine,
    );
    if (!targetCompilerOptions) {
      throw new Error(
        `[ts-migrating] Could not find the "ts-migrating" entry in "compilerOptions.plugins" of ${tsconfigPath} or the configs it extends.`,
      );
    }

    const targetSnapshot = snapshot.update({
      createPrograms: [
        {
          rootFiles: parsedCommandLine.fileNames,
          compilerOptions: targetCompilerOptions,
          options: parsedCommandLine.projectReferences
            ? { projectReferences: parsedCommandLine.projectReferences }
            : undefined,
        },
      ],
    });
    try {
      const [targetProgram] = targetSnapshot.operation.createdPrograms;
      for (const fileName of fileNames) {
        yield {
          fileName,
          entries: analyzeFile({ baselineProgram: project.program, targetProgram }, fileName),
        };
      }
    } finally {
      targetSnapshot.dispose();
    }
  } finally {
    snapshot.dispose();
  }
}

/** Group files by tsconfig, keeping the order in which each tsconfig is first seen. */
export const groupByTsconfig = (infos: readonly FileProjectInfo[]): Map<string, string[]> => {
  const groups = new Map<string, string[]>();
  for (const { fileName, tsconfigPath, pluginEnabled } of infos) {
    if (!pluginEnabled || tsconfigPath === undefined) continue;
    const group = groups.get(tsconfigPath) ?? [];
    group.push(fileName);
    groups.set(tsconfigPath, group);
  }
  return groups;
};

/**
 * Report every file that belongs to a ts-migrating enabled project, one project
 * at a time so only one project's programs are alive at once. Files outside
 * such a project are skipped.
 */
export function* reportFiles(
  api: API,
  fileNames: readonly string[],
): Generator<TsMigratingFileReport> {
  for (const [tsconfigPath, projectFileNames] of groupByTsconfig(
    getFileProjectInfos(api, fileNames),
  )) {
    yield* reportProjectFiles(api, tsconfigPath, projectFileNames);
  }
}
