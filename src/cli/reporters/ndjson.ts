import { runRowReporter } from './rowReporter';

/**
 * Streams every diagnostic as one JSON object per line (NDJSON), so this process
 * never holds the whole report and the consumer can read it line-by-line. Ideal
 * for large repos and shell pipelines (`jq -c`, `grep`, `wc -l`).
 */
export const ndjsonReporter = (
  options: { verbose: boolean; allTypeErrors: boolean },
  ...inputPaths: string[]
): void =>
  runRowReporter(options, inputPaths, {
    onRow: row => console.log(JSON.stringify(row)),
  });
