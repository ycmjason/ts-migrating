import process from 'node:process';
import ts from 'typescript/lib/tsserverlibrary';
import { brandifyDiagnostic } from '../../plugin/utils/diagnostics';
import { runReport } from './helpers/runReport';

const FORMAT_HOST: ts.FormatDiagnosticsHost = {
  getCanonicalFileName: fileName => fileName,
  getCurrentDirectory: () => process.cwd(),
  getNewLine: () => ts.sys.newLine,
};

/**
 * Human-readable reporter: prints diagnostics with colour and source context
 * (like `tsc --pretty`) followed by a summary. This is the default `check`
 * output.
 *
 * Built on {@link runReport}: it skips marked debt, shows only `ts-migrating`
 * errors by default (`--all-type-errors` adds baseline ones), and re-brands
 * `ts-migrating` diagnostics so they read as `[ts-migrating]`. The exit code is
 * handled by `runReport`.
 */
export const prettyReporter = (
  { verbose, allTypeErrors }: { verbose: boolean; allTypeErrors: boolean },
  ...inputPaths: string[]
): void => {
  console.log(
    `⏳ Checking for ${allTypeErrors ? 'all TypeScript errors' : '[ts-migrating] plugin errors only'}...`,
  );
  console.log();

  console.time('Type checking duration');
  const { unmarkedTsMigratingErrorCount, baselineErrorCount } = runReport(
    { verbose, allTypeErrors },
    inputPaths,
    entry => {
      // Acknowledged debt is never shown.
      if (entry.markedWithTsMigratingDirective) return;
      // Default view is [ts-migrating] errors only; -a also shows baseline errors.
      if (!allTypeErrors && entry.origin === 'baseline') return;
      // Brand ts-migrating errors so they read as `[ts-migrating]`; baseline
      // errors are real `tsc` errors and stay as-is.
      const diagnostic =
        entry.origin === 'ts-migrating' ? brandifyDiagnostic(entry.diagnostic) : entry.diagnostic;
      console.log(ts.formatDiagnosticsWithColorAndContext([diagnostic], FORMAT_HOST));
    },
  );
  console.timeEnd('Type checking duration');

  if (allTypeErrors) {
    const totalErrorCount = unmarkedTsMigratingErrorCount + baselineErrorCount;
    if (totalErrorCount > 0) {
      console.error(`❌ ${totalErrorCount} type error${totalErrorCount === 1 ? '' : 's'} found.`);
    } else {
      console.log('✅ No type errors found.');
    }
  }

  if (unmarkedTsMigratingErrorCount > 0) {
    console.error(
      `❌ ${unmarkedTsMigratingErrorCount} unmarked plugin error${unmarkedTsMigratingErrorCount === 1 ? '' : 's'} found. Run \`npx ts-migrating annotate\` to automatically mark them!`,
    );
  } else {
    console.log('✅ No unmarked plugin errors found.');
  }
};
