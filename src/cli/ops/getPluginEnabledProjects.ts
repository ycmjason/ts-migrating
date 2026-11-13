import type { API } from 'typescript/sync';
import { getFileProjectInfos, groupByTsconfig } from '../../engine/engine.ts';
import { expandFilePaths } from '../expandFilePaths.ts';

/**
 * Expand `inputPaths` into the TypeScript files of ts-migrating enabled
 * projects, grouped by tsconfig so each project is type-checked once.
 */
export const getPluginEnabledProjects = (
  api: API,
  inputPaths: string[],
  // `log` lets the JSON reporters divert progress chatter to stderr so stdout
  // stays a clean JSON document. Defaults to stdout for the human reporters.
  { verbose, log = console.log }: { verbose: boolean; log?: (...args: unknown[]) => void },
): Map<string, string[]> => {
  log('🔎  Looking for ts-migrating enabled TypeScript files...');
  const infos = getFileProjectInfos(
    api,
    expandFilePaths(inputPaths.length <= 0 ? ['.'] : inputPaths),
  );

  if (verbose) {
    for (const { fileName, pluginEnabled } of infos) {
      if (!pluginEnabled) {
        console.warn(`⚠️ Skipping "${fileName}" (tsconfig missing ts-migrating plugin).`);
      }
    }
  }

  const projects = groupByTsconfig(infos);
  const pluginEnabledFiles = [...projects.values()].flat();

  const fileCount = pluginEnabledFiles.length;
  log(
    `👀 ${fileCount} file${fileCount === 1 ? '' : 's'} found${!verbose ? ' (use -v or --verbose to list files)' : ':'}`,
  );

  if (verbose && fileCount > 0) {
    for (const file of pluginEnabledFiles) {
      log(`  • ${file}`);
    }
  }

  log();

  return projects;
};
