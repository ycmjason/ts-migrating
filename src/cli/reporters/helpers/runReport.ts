import { getTsMigratingReportForFile } from '../../../api/getTsMigratingReportForFile';
import type { TsMigratingReportEntry } from '../../../api/mod';
import { getPluginEnabledTSFilePaths } from '../../ops/getPluginEnabledTSFilePaths';

export type ReportTally = {
  /** Unmarked `ts-migrating` errors (incl. unused directives) — what fails the check. */
  unmarkedTsMigratingErrorCount: number;
  /** Pre-existing errors that already fail `tsc`. */
  baselineErrorCount: number;
};

/**
 * Shared engine behind the reporters: discover plugin-enabled files and pass
 * every diagnostic (as a {@link TsMigratingReportEntry}) to `onEntry` — a
 * reporter decides what to do with each (flatten and serialize it for
 * json/ndjson, format it for pretty, …).
 *
 * Returns the {@link ReportTally}; deciding the exit code from it is the `check`
 * command's job, so the gate lives in one obvious place. Progress is logged to
 * stderr so a reporter can keep stdout clean.
 */
export const runReport = (
  { verbose }: { verbose: boolean },
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

  return { unmarkedTsMigratingErrorCount, baselineErrorCount };
};
