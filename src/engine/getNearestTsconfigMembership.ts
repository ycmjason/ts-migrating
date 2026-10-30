import { existsSync, statSync } from 'node:fs';
import path from 'node:path';
import type { API } from 'typescript/sync';

export type NearestTsconfigMembership =
  /** The nearest tsconfig, or a project it references, includes the file. */
  | 'included'
  /**
   * The nearest tsconfig matches no files of its own (e.g. a solution-style
   * `"files": []` with `references`, or an `include` that matches nothing) and
   * neither it nor a project it references includes the file.
   */
  | 'unopenable'
  /** The nearest tsconfig doesn't include the file. */
  | 'excluded'
  /** No tsconfig.json in any ancestor directory. */
  | 'no-tsconfig';

/**
 * How a file relates to its nearest `tsconfig.json`, decided by parsing
 * tsconfigs only (no program is built), so we can avoid opening files that
 * can't be in a ts-migrating project.
 *
 * `'unopenable'` files must never be opened: TypeScript 7.1.0-beta's native
 * process panics on them (e.g. a stray root `vitest.config.ts` next to a
 * solution-style tsconfig), which kills the whole API session.
 * TODO: revisit once https://github.com/microsoft/TypeScript/issues/65054 is fixed.
 */
export const createGetNearestTsconfigMembership = (api: API) => {
  const nearestTsconfigByDir = new Map<string, string | undefined>();
  const parsedByConfig = new Map<
    string,
    { fileNames: Set<string>; references: string[] } | undefined
  >();

  const findNearestTsconfig = (dir: string): string | undefined => {
    if (nearestTsconfigByDir.has(dir)) return nearestTsconfigByDir.get(dir);
    const candidate = path.join(dir, 'tsconfig.json');
    const parent = path.dirname(dir);
    const found = existsSync(candidate)
      ? candidate
      : parent === dir
        ? undefined
        : findNearestTsconfig(parent);
    nearestTsconfigByDir.set(dir, found);
    return found;
  };

  const parse = (configPath: string) => {
    if (parsedByConfig.has(configPath)) return parsedByConfig.get(configPath);
    let parsed: { fileNames: Set<string>; references: string[] } | undefined;
    try {
      const { fileNames, projectReferences = [] } = api.parseConfigFile(configPath);
      parsed = {
        fileNames: new Set(fileNames.map(fileName => path.resolve(fileName))),
        references: projectReferences.map(({ path: referencePath }) =>
          statSync(referencePath, { throwIfNoEntry: false })?.isDirectory()
            ? path.join(referencePath, 'tsconfig.json')
            : referencePath,
        ),
      };
    } catch {
      parsed = undefined;
    }
    parsedByConfig.set(configPath, parsed);
    return parsed;
  };

  const isIncluded = (configPath: string, fileName: string, visited: Set<string>): boolean => {
    if (visited.has(configPath)) return false;
    visited.add(configPath);
    const parsed = parse(configPath);
    if (!parsed) return false;
    return (
      parsed.fileNames.has(fileName) ||
      parsed.references.some(reference => isIncluded(reference, fileName, visited))
    );
  };

  return (fileName: string): NearestTsconfigMembership => {
    const configPath = findNearestTsconfig(path.dirname(fileName));
    if (configPath === undefined) return 'no-tsconfig';
    if (isIncluded(configPath, fileName, new Set())) return 'included';
    return parse(configPath)?.fileNames.size === 0 ? 'unopenable' : 'excluded';
  };
};
