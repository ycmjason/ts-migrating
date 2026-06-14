import process from 'node:process';
import { getTsMigratingReportForFile } from '../../../api/getTsMigratingReportForFile';
import type { TsMigratingReportEntry } from '../../../api/mod';
import { getPluginEnabledTSFilePaths } from '../../ops/getPluginEnabledTSFilePaths';

export type ReportTally = {
  /** Unmarked `ts-migrating` errors (incl. unused directives) — what `check` fails on. */
  unmarkedTsMigratingErrorCount: number;
  /** Pre-existing errors that already fail `tsc`. */
  baselineErrorCount: number;
};

/**
 * Shared engine behind the reporters: discover plugin-enabled files and pass
 * every diagnostic (as a {@link TsMigratingReportEntry}) to `onEntry` — a
 * reporter decides what to do with each (flatten and serialize it for
 * json/ndjson, format it for pretty, …). Returns the tallies for any summary and
 * sets the CI gate exit code: unmarked ts-migrating errors fail, and with
 * `allTypeErrors` baseline errors do too (marked debt never fails).
 *
 * It's an eager function rather than a generator on purpose: the exit code is set
 * unconditionally (a generator's would only run if the caller fully drained it),
 * and the tally can be returned for `pretty`'s summary.
 *
 * Progress is logged to stderr so a reporter can keep stdout clean. We set
 * `process.exitCode` rather than calling `process.exit()`, so Node flushes stdout
 * in full — the project service holds no watchers, so nothing keeps the loop alive.
 */
export const runReport = (
  { verbose, allTypeErrors }: { verbose: boolean; allTypeErrors: boolean },
  inputPaths: string[],
  onEntry: (entry: TsMigratingReportEntry) => void,
): ReportTally => {
  const pluginEnabledFiles = getPluginEnabledTSFilePaths(inputPaths, {
    verbose,
    log: console.error,
  });

  let unmarkedTsMigratingErrorCount = 0;
  let baselineErrorCount = 0;

  for (const file of pluginEnabledFiles) {
    for (const entry of getTsMigratingReportForFile(file)) {
      if (entry.origin === 'baseline') {
        baselineErrorCount += 1;
      } else if (!entry.markedWithTsMigratingDirective) {
        unmarkedTsMigratingErrorCount += 1;
      }
      onEntry(entry);
    }
  }

  process.exitCode =
    unmarkedTsMigratingErrorCount > 0 || (allTypeErrors && baselineErrorCount > 0) ? 1 : 0;

  return { unmarkedTsMigratingErrorCount, baselineErrorCount };
};
