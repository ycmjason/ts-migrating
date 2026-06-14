import process from 'node:process';
import { getTsMigratingReportForFile } from '../../api/getTsMigratingReportForFile';
import { getPluginEnabledTSFilePaths } from '../ops/getPluginEnabledTSFilePaths';
import { type JsonReportRow, toJsonReportRow } from './jsonReportRow';

/**
 * Machine-readable reporter for CI gates and dashboards. Emits every diagnostic
 * — each tagged with its `origin` (`ts-migrating` vs `baseline`) and whether a
 * `@ts-migrating` directive marks it. Unlike the pretty reporter this also
 * surfaces *marked* errors (the migration debt), which `check` normally hides.
 *
 * `json` buffers a single pretty-printed array; `ndjson` streams one JSON object
 * per line so large repos never hold the whole report in memory on either side.
 */
export const jsonReporter = async (
  {
    verbose,
    allTypeErrors,
    format,
  }: { verbose: boolean; allTypeErrors: boolean; format: 'json' | 'ndjson' },
  ...inputPaths: string[]
): Promise<void> => {
  // stdout must contain only the report, so divert all progress chatter
  // (here and inside `getPluginEnabledTSFilePaths`) to stderr.
  const pluginEnabledFiles = getPluginEnabledTSFilePaths(inputPaths, {
    verbose,
    log: console.error,
  });

  // Write a chunk, honouring backpressure: when stdout's buffer is full,
  // `write` returns false and we wait for `drain` before producing more. Without
  // this a slow consumer would make Node buffer the entire report in memory,
  // defeating the point of streaming ndjson. See
  // https://github.com/ycmjason/ts-migrating/issues/16
  const write = async (chunk: string): Promise<void> => {
    if (!process.stdout.write(chunk)) {
      await new Promise<void>(resolve => process.stdout.once('drain', resolve));
    }
  };

  const cwd = process.cwd();
  // `ndjson` streams rows out immediately and never retains them; `json` collects
  // them to print one array at the end. Either way we only ever hold plain rows,
  // not the diagnostics, so we stay within the memory budget from #16.
  const rows: JsonReportRow[] = [];
  let unmarkedTsMigratingErrorCount = 0;
  let baselineErrorCount = 0;

  for (const file of pluginEnabledFiles) {
    for (const entry of getTsMigratingReportForFile(file)) {
      const row = toJsonReportRow(entry, { cwd });
      if (entry.origin === 'baseline') {
        baselineErrorCount += 1;
      } else if (!entry.markedWithTsMigratingDirective) {
        unmarkedTsMigratingErrorCount += 1;
      }

      if (format === 'ndjson') {
        await write(`${JSON.stringify(row)}\n`);
      } else {
        rows.push(row);
      }
    }
  }

  if (format === 'json') {
    await write(`${JSON.stringify(rows, null, 2)}\n`);
  }

  // Mirror the pretty reporter's gate so the same command can both emit a report
  // and gate CI: unmarked ts-migrating errors fail, and with `--all-type-errors`
  // pre-existing (baseline) errors fail too. Marked errors are acknowledged debt
  // and never fail.
  const hasBlockingErrors =
    unmarkedTsMigratingErrorCount > 0 || (allTypeErrors && baselineErrorCount > 0);

  // Force-exit (the TS server keeps the event loop alive), but only once stdout
  // has fully flushed, so the last rows can't be truncated.
  process.stdout.write('', () => process.exit(hasBlockingErrors ? 1 : 0));
};
