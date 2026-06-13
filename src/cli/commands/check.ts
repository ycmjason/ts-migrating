import process from 'node:process';
import ts from 'typescript/lib/tsserverlibrary';
import { getSemanticDiagnosticsForFile } from '../../api/getSemanticDiagnostics';
import { getTsMigratingReportForFile } from '../../api/getTsMigratingReportForFile';
import { isPluginDiagnostic } from '../../api/isPluginDiagnostic';
import { getPluginEnabledTSFilePaths } from '../ops/getPluginEnabledTSFilePaths';
import { type JsonReportRow, toJsonReportRow } from '../reporters/jsonReport';

export type Reporter = 'default' | 'json';

export const check = async (
  {
    verbose,
    allTypeErrors,
    reporter,
  }: { verbose: boolean; allTypeErrors: boolean; reporter: Reporter },
  ...inputPaths: string[]
) => {
  if (reporter === 'json') {
    return checkJsonReporter({ verbose, allTypeErrors }, ...inputPaths);
  }
  return checkDefaultReporter({ verbose, allTypeErrors }, ...inputPaths);
};

const checkDefaultReporter = (
  { verbose, allTypeErrors: isCheckingAllTypeErrors }: { verbose: boolean; allTypeErrors: boolean },
  ...inputPaths: string[]
) => {
  const pluginEnabledFiles = getPluginEnabledTSFilePaths(inputPaths, { verbose });

  console.log(
    `⏳ Checking for ${isCheckingAllTypeErrors ? 'all TypeScript errors' : '[ts-migrating] plugin errors only'}...`,
  );

  console.log();

  // Keep running counts only. Holding on to every diagnostic for the whole run
  // pins each one's `SourceFile` and message chain, which adds up to a lot of
  // memory on large repos. See https://github.com/ycmjason/ts-migrating/issues/16
  let totalErrorCount = 0;
  let pluginErrorCount = 0;

  console.time('Type checking duration');
  for (const file of pluginEnabledFiles) {
    const diagnostics = getSemanticDiagnosticsForFile(file);
    totalErrorCount += diagnostics.length;

    const pluginDiagnostics = diagnostics.filter(isPluginDiagnostic);
    pluginErrorCount += pluginDiagnostics.length;

    const diagnosticsToReport = isCheckingAllTypeErrors ? diagnostics : pluginDiagnostics;
    if (diagnosticsToReport.length > 0) {
      console.log(
        ts.formatDiagnosticsWithColorAndContext(diagnosticsToReport, {
          getCanonicalFileName: fileName => fileName,
          getCurrentDirectory: () => process.cwd(),
          getNewLine: () => ts.sys.newLine,
        }),
      );
    }
  }
  console.timeEnd('Type checking duration');

  if (isCheckingAllTypeErrors) {
    if (totalErrorCount > 0) {
      console.error(`❌ ${totalErrorCount} type error${totalErrorCount === 1 ? '' : 's'} found.`);
    } else {
      console.log('✅ No type errors found.');
    }
  }

  if (pluginErrorCount > 0) {
    console.error(
      `❌ ${pluginErrorCount} unmarked plugin error${pluginErrorCount === 1 ? '' : 's'} found. Run \`npx ts-migrating annotate\` to automatically mark them!`,
    );
  } else {
    console.log('✅ No unmarked plugin errors found.');
  }

  process.exit(Math.min(isCheckingAllTypeErrors ? totalErrorCount : pluginErrorCount, 1));
};

/**
 * Emits a flat JSON array of every diagnostic — each tagged with its `origin`
 * (`ts-migrating` vs `baseline`) and whether a `@ts-migrating` directive marks
 * it — for CI gates and dashboards to consume. Unlike the default reporter this
 * also surfaces *marked* errors (the migration debt), which `check` normally
 * hides.
 */
const checkJsonReporter = (
  { verbose, allTypeErrors }: { verbose: boolean; allTypeErrors: boolean },
  ...inputPaths: string[]
): void => {
  // stdout must contain only the JSON document, so divert all progress chatter
  // (here and inside `getPluginEnabledTSFilePaths`) to stderr.
  const pluginEnabledFiles = getPluginEnabledTSFilePaths(inputPaths, {
    verbose,
    log: console.error,
  });

  const cwd = process.cwd();
  const rows: JsonReportRow[] = [];
  let unmarkedTsMigratingErrorCount = 0;
  let baselineErrorCount = 0;

  // Map each diagnostic to a plain row immediately and keep only the rows — never
  // the diagnostics themselves — so we stay within the memory budget from #16.
  for (const file of pluginEnabledFiles) {
    for (const entry of getTsMigratingReportForFile(file)) {
      rows.push(toJsonReportRow(entry, { cwd }));
      if (entry.origin === 'baseline') {
        baselineErrorCount += 1;
      } else if (!entry.markedWithTsMigratingDirective) {
        unmarkedTsMigratingErrorCount += 1;
      }
    }
  }

  // Mirror the default reporter's gate so the same command can both emit a report
  // and gate CI: unmarked ts-migrating errors fail, and with `--all-type-errors`
  // pre-existing (baseline) errors fail too. Marked errors are acknowledged debt
  // and never fail.
  const hasBlockingErrors =
    unmarkedTsMigratingErrorCount > 0 || (allTypeErrors && baselineErrorCount > 0);

  // Wait for stdout to drain before exiting. On large repos the JSON can exceed
  // the OS pipe buffer, in which case `write` only queues it — exiting straight
  // away would truncate the document into invalid JSON.
  process.stdout.write(`${JSON.stringify(rows, null, 2)}\n`, () => {
    process.exit(hasBlockingErrors ? 1 : 0);
  });
};
