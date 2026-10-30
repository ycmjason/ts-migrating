import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import type { API, CompilerOptions, ParsedCommandLine } from 'typescript/sync';
import { PLUGIN_NAME } from '../constants.ts';

type RawPluginEntry = { name?: unknown; compilerOptions?: unknown };
type RawTsconfig = { extends?: unknown; compilerOptions?: { plugins?: unknown } };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** Whether the project's (parsed) compiler options list the `ts-migrating` plugin. */
export const isPluginEnabled = (options: CompilerOptions): boolean =>
  (options.plugins ?? []).some(plugin => plugin.name === PLUGIN_NAME);

/**
 * Resolve an `extends` specifier the way `tsc` does: relative/absolute paths
 * (with an implied `.json`), otherwise a package (`pkg`, `pkg/tsconfig.json`,
 * `pkg/some-config`).
 */
const resolveExtends = (specifier: string, fromConfig: string): string | undefined => {
  const dir = path.dirname(fromConfig);

  if (path.isAbsolute(specifier) || specifier.startsWith('./') || specifier.startsWith('../')) {
    const resolved = path.resolve(dir, specifier);
    if (existsSync(resolved)) return resolved;
    if (!resolved.endsWith('.json') && existsSync(`${resolved}.json`)) return `${resolved}.json`;
    return undefined;
  }

  const require = createRequire(path.join(dir, 'tsconfig.json'));
  for (const candidate of [specifier, `${specifier}.json`, `${specifier}/tsconfig.json`]) {
    try {
      return require.resolve(candidate);
    } catch {
      // try the next candidate
    }
  }
  return undefined;
};

/**
 * Find the raw `compilerOptions.plugins` that apply to `configPath`: TypeScript
 * *replaces* `plugins` rather than merging it, so the nearest config in the
 * `extends` chain that defines it wins. With array `extends`, later entries
 * override earlier ones.
 */
const findRawPlugins = (
  api: API,
  configPath: string,
  visited: Set<string>,
): { plugins: unknown; configPath: string } | undefined => {
  if (visited.has(configPath)) return undefined;
  visited.add(configPath);

  const { config } = api.readConfigFile(configPath);
  if (!isRecord(config)) return undefined;
  const raw = config as RawTsconfig;

  if (isRecord(raw.compilerOptions) && raw.compilerOptions.plugins !== undefined) {
    return { plugins: raw.compilerOptions.plugins, configPath };
  }

  const extendsList = (Array.isArray(raw.extends) ? raw.extends : [raw.extends]).filter(
    (specifier): specifier is string => typeof specifier === 'string',
  );
  for (const specifier of [...extendsList].reverse()) {
    const extended = resolveExtends(specifier, configPath);
    if (extended === undefined) continue;
    const found = findRawPlugins(api, extended, visited);
    if (found) return found;
  }

  return undefined;
};

/**
 * The compiler options of the tsconfig you are migrating *to*: the project's own
 * parsed options overridden by the ts-migrating entry's `compilerOptions`.
 *
 * Parsing strips the plugin entry down to `{ name }`, so we read the raw tsconfig
 * (following `extends`) to recover the nested `compilerOptions`, then parse them
 * relative to the config that declares them so enums and paths are normalised
 * like any other compiler option.
 *
 * Returns `undefined` if the ts-migrating entry can't be found in the raw config.
 */
export const resolveTargetCompilerOptions = (
  api: API,
  configPath: string,
  parsedCommandLine: ParsedCommandLine,
): CompilerOptions | undefined => {
  const found = findRawPlugins(api, configPath, new Set());
  if (!found || !Array.isArray(found.plugins)) return undefined;

  const entry = (found.plugins as unknown[]).find(
    (plugin): plugin is RawPluginEntry => isRecord(plugin) && plugin.name === PLUGIN_NAME,
  );
  if (!entry) return undefined;

  const rawTargetOptions = isRecord(entry.compilerOptions) ? entry.compilerOptions : {};
  const { options: targetOptions } = api.parseJsonConfigFileContent(
    { compilerOptions: rawTargetOptions, files: [] },
    { configDirectory: path.dirname(found.configPath) },
  );

  return { ...parsedCommandLine.options, ...targetOptions };
};
