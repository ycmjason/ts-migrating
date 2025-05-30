import { globSync } from 'tinyglobby';

export const expandTSFilePaths = (paths: string[]): string[] => {
  return globSync(paths, {
    ignore: ['**/node_modules/**/*'],
    absolute: true,
  }).filter(path => path.endsWith('.ts') || path.endsWith('.tsx'));
};
