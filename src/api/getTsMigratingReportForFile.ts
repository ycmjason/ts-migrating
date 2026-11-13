import { API } from 'typescript/sync';
import { reportFiles, withApi } from '../engine/engine.ts';
import type { TsMigratingFileReport, TsMigratingReportEntry } from '../engine/types.ts';

/**
 * Returns every diagnostic for a file, annotated with its `origin` and whether a
 * `@ts-migrating` directive marks it.
 *
 * `baseline` entries are the errors of your current tsconfig; `ts-migrating`
 * entries are the errors your target config introduces (including the *marked*
 * ones, i.e. your migration debt, and unused directives).
 *
 * Returns `[]` if the tsconfig for the file does not list `ts-migrating` in its plugins.
 *
 * Each call starts (and stops) TypeScript; to report many files, use
 * {@link getTsMigratingReportForFiles}.
 */
export function getTsMigratingReportForFile(fileName: string): TsMigratingReportEntry[] {
  return withApi(api => [...reportFiles(api, [fileName])][0]?.entries ?? []);
}

/**
 * Batch variant of {@link getTsMigratingReportForFile}: lazily yields one report
 * per file that belongs to a ts-migrating enabled project (other files are
 * skipped). Files are grouped by project, so the reports may come out in a
 * different order than `fileNames`.
 *
 * TypeScript is started on the first iteration and stopped when the iteration
 * finishes (or is abandoned with `break` / `return`).
 */
export function* getTsMigratingReportForFiles(
  fileNames: Iterable<string>,
  { cwd = process.cwd() }: { cwd?: string } = {},
): Generator<TsMigratingFileReport> {
  const api = new API({ cwd });
  try {
    yield* reportFiles(api, [...fileNames]);
  } finally {
    api.close();
  }
}
