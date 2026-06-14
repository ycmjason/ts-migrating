import process from 'node:process';
import { type ReportTally, runReport } from './helpers/runReport';
import { type ReportItem, toReportItem } from './helpers/toReportItem';

/**
 * Buffers every diagnostic into a single JSON array. Convenient for `jq '.'` and
 * loading the whole report at once; for very large repos prefer `ndjson`, which
 * streams instead of holding everything in memory.
 */
export const jsonReporter = (
  { verbose }: { verbose: boolean; allTypeErrors: boolean },
  ...inputPaths: string[]
): ReportTally => {
  const cwd = process.cwd();
  const { entries, tally } = runReport({ verbose }, inputPaths);

  const items: ReportItem[] = [];
  for (const entry of entries) {
    items.push(toReportItem(entry, { cwd }));
  }
  console.log(JSON.stringify(items, null, 2));

  return tally;
};
