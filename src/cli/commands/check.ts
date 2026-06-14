import { jsonReporter } from '../reporters/json';
import { prettyReporter } from '../reporters/pretty';

export type Reporter = 'pretty' | 'json' | 'ndjson';

export const check = async (
  {
    verbose,
    allTypeErrors,
    reporter,
  }: { verbose: boolean; allTypeErrors: boolean; reporter: Reporter },
  ...inputPaths: string[]
) => {
  if (reporter === 'json' || reporter === 'ndjson') {
    return jsonReporter({ verbose, allTypeErrors, format: reporter }, ...inputPaths);
  }
  return prettyReporter({ verbose, allTypeErrors }, ...inputPaths);
};
