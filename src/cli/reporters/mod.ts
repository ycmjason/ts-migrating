import { jsonReporter } from './json';
import { prettyReporter } from './pretty';

type ReporterFn = (
  options: { verbose: boolean; allTypeErrors: boolean },
  ...inputPaths: string[]
) => void | Promise<void>;

/**
 * Maps each `--reporter` value to its implementation, so the `check` command can
 * dispatch with a lookup instead of a conditional. `json`/`ndjson` share one
 * reporter and only differ by the `format` they pass.
 */
export const reporters = {
  pretty: prettyReporter,
  json: (options, ...inputPaths) => jsonReporter({ ...options, format: 'json' }, ...inputPaths),
  ndjson: (options, ...inputPaths) => jsonReporter({ ...options, format: 'ndjson' }, ...inputPaths),
} satisfies Record<string, ReporterFn>;

export type ReporterName = keyof typeof reporters;
