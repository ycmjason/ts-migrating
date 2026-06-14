import process from 'node:process';
import { runReport } from './helpers/runReport';
import { type ReportRow, toReportRow } from './helpers/toReportRow';

/**
 * Buffers every diagnostic into a single JSON array. Convenient for `jq '.'` and
 * loading the whole report at once; for very large repos prefer `ndjson`, which
 * streams instead of holding everything in memory.
 */
export const jsonReporter = (
  options: { verbose: boolean; allTypeErrors: boolean },
  ...inputPaths: string[]
): void => {
  const cwd = process.cwd();
  const rows: ReportRow[] = [];
  runReport(options, inputPaths, {
    onEntry: entry => {
      rows.push(toReportRow(entry, { cwd }));
    },
    onDone: () => console.log(JSON.stringify(rows, null, 2)),
  });
};
