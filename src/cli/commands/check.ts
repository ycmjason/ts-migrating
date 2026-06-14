import { type ReporterName, reporters } from '../reporters/mod';

export const check = (
  {
    verbose,
    allTypeErrors,
    reporter,
  }: { verbose: boolean; allTypeErrors: boolean; reporter: ReporterName },
  ...inputPaths: string[]
) => reporters[reporter]({ verbose, allTypeErrors }, ...inputPaths);
