import fs from 'node:fs';
import { join } from 'node:path';
import { isDirectory } from './isDirectory';

export const readdirSyncRecursive = (fromDir: string): string[] => {
  if (!isDirectory(fromDir)) {
    throw new Error(`${fromDir} is not a directory`);
  }

  const paths = fs.readdirSync(fromDir);

  return paths
    .map(relativePath => join(fromDir, relativePath))
    .flatMap(path => {
      if (isDirectory(path)) {
        return readdirSyncRecursive(path);
      }
      return [path];
    });
};
