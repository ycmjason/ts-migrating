import type ts from 'typescript/lib/tsserverlibrary.js';

export const getPluginsFromCompilerOptions = (
  compilerOptions: ts.CompilerOptions,
): ts.PluginImport[] => {
  return (compilerOptions.plugins ?? []) as ts.PluginImport[];
};
