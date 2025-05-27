import fs from 'node:fs';

export const isDirectory = (path: string): boolean => fs.lstatSync(path).isDirectory();
