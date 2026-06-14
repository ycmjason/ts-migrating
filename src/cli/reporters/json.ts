import process from 'node:process';
import { runReport } from './helpers/runReport';
import { type ReportItem, toReportItem } from './helpers/toReportItem';

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
  const items: ReportItem[] = [];
  runReport(options, inputPaths, entry => {
    items.push(toReportItem(entry, { cwd }));
  });
  console.log(JSON.stringify(items, null, 2));
};
