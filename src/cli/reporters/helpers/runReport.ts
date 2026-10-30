import { API } from 'typescript/sync';
import { reportProjectFiles } from '../../../engine/engine.ts';
import type { TsMigratingReportEntry } from '../../../engine/types.ts';
import { getPluginEnabledProjects } from '../../ops/getPluginEnabledProjects.ts';

export type ReportTally = {
  /** Unmarked `ts-migrating` errors (incl. unused directives) — what fails the check. */
  unmarkedTsMigratingErrorCount: number;
  /** Pre-existing errors that already fail `tsc`. */
  baselineErrorCount: number;
};

/**
 * Shared engine behind the reporters. Returns a lazy `entries` stream over every
 * diagnostic (so we never hold them all in memory — see
 * https://github.com/ycmjason/ts-migrating/issues/16) plus a `tally` that is
 * filled in *as `entries` is consumed*.
 *
 * So a reporter just `for…of`s `entries` to produce its output, then reads
 * `tally` — which `check` uses to decide the exit code. Read `tally` only after
 * iterating, since that's when it's complete.
 *
 * Progress is logged to stderr so a reporter can keep stdout clean.
 */
export const runReport = (
  { verbose }: { verbose: boolean },
  inputPaths: string[],
): { entries: Iterable<TsMigratingReportEntry>; tally: ReportTally } => {
  const tally: ReportTally = { unmarkedTsMigratingErrorCount: 0, baselineErrorCount: 0 };

  function* entries(): Generator<TsMigratingReportEntry> {
    const api = new API({ cwd: process.cwd() });
    try {
      const projects = getPluginEnabledProjects(api, inputPaths, { verbose, log: console.error });

      for (const [tsconfigPath, fileNames] of projects) {
        for (const report of reportProjectFiles(api, tsconfigPath, fileNames)) {
          for (const entry of report.entries) {
            if (entry.origin === 'baseline') {
              tally.baselineErrorCount += 1;
            } else if (!entry.markedWithTsMigratingDirective) {
              tally.unmarkedTsMigratingErrorCount += 1;
            }
            yield entry;
          }
        }
      }
    } finally {
      api.close();
    }
  }

  return { entries: entries(), tally };
};
