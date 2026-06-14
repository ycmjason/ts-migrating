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
 * Shared engine behind the reporters: discover plugin-enabled files, hand each
 * diagnostic (as a {@link TsMigratingReportEntry}) to `onEntry`, run `onDone`,
 * set the CI gate exit code, and return the tallies for any summary. A reporter
 * decides what to do with each entry — flatten and serialize it (json/ndjson),
 * format it (pretty), etc.
 *
 * Progress is logged to stderr so a reporter is free to keep stdout clean.
 *
 * We set `process.exitCode` and let the process exit naturally rather than
 * calling `process.exit()`, so Node flushes stdout in full — the project service
 * holds no watchers, so nothing keeps the event loop alive.
 */
export const runReport = (
  { verbose, allTypeErrors }: { verbose: boolean; allTypeErrors: boolean },
  inputPaths: string[],
  {
    onEntry,
    onDone,
  }: {
    onEntry: (entry: TsMigratingReportEntry) => void;
    onDone?: () => void;
  },
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
  onDone?.();

  // Same CI gate as the pretty reporter: unmarked ts-migrating errors fail, and
  // with `--all-type-errors` baseline errors do too. Marked debt never fails.
  process.exitCode =
    unmarkedTsMigratingErrorCount > 0 || (allTypeErrors && baselineErrorCount > 0) ? 1 : 0;

  return { unmarkedTsMigratingErrorCount, baselineErrorCount };
};
