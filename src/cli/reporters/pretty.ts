import process from 'node:process';
import {
  type Diagnostic,
  type FormatDiagnosticsHost,
  formatDiagnosticsWithColorAndContext,
} from 'typescript/sync';
import { PLUGIN_DIAGNOSTIC_TAG } from '../../constants.ts';
import { type ReportTally, runReport } from './helpers/runReport.ts';

const FORMAT_HOST: FormatDiagnosticsHost = {
  getCanonicalFileName: fileName => fileName,
  getCurrentDirectory: () => process.cwd(),
  getNewLine: () => '\n',
};

/** Prefix the message with `[ts-migrating]`, nesting the original message under it. */
const brandifyDiagnostic = (diagnostic: Diagnostic): Diagnostic => ({
  ...diagnostic,
  text: PLUGIN_DIAGNOSTIC_TAG,
  messageChain: [
    {
      pos: diagnostic.pos,
      end: diagnostic.end,
      code: diagnostic.code,
      category: diagnostic.category,
      text: diagnostic.text,
      messageChain: diagnostic.messageChain,
    },
  ],
});

/**
 * Human-readable reporter: prints diagnostics with colour and source context
 * (like `tsc --pretty`) followed by a summary. This is the default `check`
 * output.
 *
 * Skips marked debt, shows only `ts-migrating` errors by default
 * (`--all-type-errors` adds baseline ones), and prefixes `ts-migrating`
 * diagnostics so they read as `[ts-migrating]`.
 */
export const prettyReporter = (
  { verbose, allTypeErrors }: { verbose: boolean; allTypeErrors: boolean },
  ...inputPaths: string[]
): ReportTally => {
  console.log(
    `⏳ Checking for ${allTypeErrors ? 'all TypeScript errors' : '[ts-migrating] errors only'}...`,
  );
  console.log();

  console.time('Type checking duration');
  const { entries, tally } = runReport({ verbose }, inputPaths);
  for (const entry of entries) {
    // Acknowledged debt is never shown.
    if (entry.markedWithTsMigratingDirective) continue;
    // Default view is [ts-migrating] errors only; -a also shows baseline errors.
    if (!allTypeErrors && entry.origin === 'baseline') continue;
    // Brand ts-migrating errors so they read as `[ts-migrating]`; baseline
    // errors are real `tsc` errors and stay as-is.
    const diagnostic =
      entry.origin === 'ts-migrating' ? brandifyDiagnostic(entry.diagnostic) : entry.diagnostic;
    console.log(formatDiagnosticsWithColorAndContext([diagnostic], FORMAT_HOST));
  }
  console.timeEnd('Type checking duration');

  const { unmarkedTsMigratingErrorCount, baselineErrorCount } = tally;

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
      `❌ ${unmarkedTsMigratingErrorCount} unmarked [ts-migrating] error${unmarkedTsMigratingErrorCount === 1 ? '' : 's'} found. Run \`npx ts-migrating annotate\` to automatically mark them!`,
    );
  } else {
    console.log('✅ No unmarked [ts-migrating] errors found.');
  }

  return tally;
};
