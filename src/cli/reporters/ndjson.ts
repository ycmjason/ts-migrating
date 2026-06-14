import { runRowReporter, write } from './rowReporter';

/**
 * Streams every diagnostic as one JSON object per line (NDJSON), so neither this
 * process nor the consumer has to hold the whole report in memory. Ideal for
 * large repos and shell pipelines (`jq -c`, `grep`, `wc -l`).
 */
export const ndjsonReporter = (
  options: { verbose: boolean; allTypeErrors: boolean },
  ...inputPaths: string[]
): Promise<void> =>
  runRowReporter(options, inputPaths, {
    onRow: row => write(`${JSON.stringify(row)}\n`),
  });
