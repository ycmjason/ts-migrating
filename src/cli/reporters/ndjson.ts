import process from 'node:process';
import { type ReportTally, runReport } from './helpers/runReport';
import { toReportItem } from './helpers/toReportItem';

/**
 * Streams every diagnostic as one JSON object per line (NDJSON), so this process
 * never holds the whole report and the consumer can read it line-by-line. Ideal
 * for large repos and shell pipelines (`jq -c`, `grep`, `wc -l`).
 */
export const ndjsonReporter = (
  { verbose }: { verbose: boolean; allTypeErrors: boolean },
  ...inputPaths: string[]
): ReportTally => {
  const cwd = process.cwd();
  const { entries, tally } = runReport({ verbose }, inputPaths);

  for (const entry of entries) {
    console.log(JSON.stringify(toReportItem(entry, { cwd })));
  }

  return tally;
};
