import { parse as babelParse } from '@babel/parser';

/**
 * A recast parser for TS/TSX built on `@babel/parser` 8. recast's own
 * `recast/parsers/babel-ts` passes Babel 7 plugin options that Babel 8 rejects,
 * so we mirror its tolerant options with the plugins Babel 8 still needs
 * (everything else is enabled by default now).
 */
export const babelTsParser = {
  parse: (source: string) =>
    babelParse(source, {
      sourceType: 'module',
      strictMode: false,
      allowImportExportEverywhere: true,
      allowReturnOutsideFunction: true,
      startLine: 1,
      tokens: true,
      plugins: ['jsx', 'typescript', 'decorators-legacy', 'doExpressions', 'throwExpressions'],
    }),
};
