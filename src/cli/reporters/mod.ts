import type { ReportTally } from './helpers/runReport';
import { jsonReporter } from './json';
import { ndjsonReporter } from './ndjson';
import { prettyReporter } from './pretty';

type ReporterFn = (
  options: { verbose: boolean; allTypeErrors: boolean },
  ...inputPaths: string[]
) => ReportTally;

/**
 * Maps each `--reporter` value to its implementation, so the `check` command can
 * dispatch with a lookup instead of a conditional. Every reporter returns the
 * {@link ReportTally} so `check` can decide the exit code in one place.
 */
export const reporters = {
  pretty: prettyReporter,
  json: jsonReporter,
  ndjson: ndjsonReporter,
} satisfies Record<string, ReporterFn>;

export type ReporterName = keyof typeof reporters;
