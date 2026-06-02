/**
 * Whether ts-migrating should run its target-config type-check over `fileName`.
 *
 * The plugin computes "what errors would the target compilerOptions introduce"
 * by running a secondary, plugin-less TypeScript language service. That service
 * knows nothing about other language-service plugins — most notably the Angular
 * Language Service — so handing it their files (e.g. Angular `.html` templates)
 * makes it parse them as plain TypeScript and report bogus errors.
 *
 * We therefore only run over real TypeScript/JavaScript source files:
 * `.ts` `.tsx` `.mts` `.cts` `.js` `.jsx` `.mjs` `.cjs` (the `.js`/`.jsx` family
 * matters for `checkJs` migrations). Everything else — `.html`, `.json`, `.vue`,
 * … — is left to whichever plugin owns it.
 *
 * See https://github.com/ycmjason/ts-migrating/issues/14
 */
export const isCheckableSourceFile = (fileName: string): boolean =>
  /\.(?:[cm]?[jt]sx?)$/i.test(fileName);
