import { type ReportRow, runRowReporter, write } from './rowReporter';

/**
 * Buffers every diagnostic into a single JSON array. Convenient for `jq '.'` and
 * loading the whole report at once; for very large repos prefer `ndjson`, which
 * streams instead of holding everything in memory.
 */
export const jsonReporter = (
  options: { verbose: boolean; allTypeErrors: boolean },
  ...inputPaths: string[]
): Promise<void> => {
  const rows: ReportRow[] = [];
  return runRowReporter(options, inputPaths, {
    onRow: row => {
      rows.push(row);
    },
    onDone: () => write(`${JSON.stringify(rows, null, 2)}\n`),
  });
};
