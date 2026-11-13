import type { Diagnostic } from 'typescript/sync';

/** Which config surfaced a diagnostic. */
export type DiagnosticOrigin =
  /** Introduced by the tsconfig you are migrating *to* (the ts-migrating entry's `compilerOptions`). */
  | 'ts-migrating'
  /** Already present in your project before the migration, i.e. from your current tsconfig. */
  | 'baseline';

/** A single diagnostic, annotated with how ts-migrating sees it. */
export type TsMigratingReportEntry = {
  diagnostic: Diagnostic;
  origin: DiagnosticOrigin;
  /**
   * `true` when this is a `ts-migrating` error on a line marked with a
   * `@ts-migrating` directive — acknowledged migration debt that `check`
   * suppresses. Always `false` for `baseline` errors.
   */
  markedWithTsMigratingDirective: boolean;
};

/** The report for one file. */
export type TsMigratingFileReport = {
  /** Absolute path of the file. */
  fileName: string;
  entries: TsMigratingReportEntry[];
};
