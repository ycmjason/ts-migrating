/**
 * Whether ts-migrating should run its target-config type-check over `fileName`.
 *
 * We only run over real TypeScript/JavaScript source files:
 * `.ts` `.tsx` `.mts` `.cts` `.js` `.jsx` `.mjs` `.cjs` (the `.js`/`.jsx` family
 * matters for `checkJs` migrations). Everything else — `.html`, `.json`, `.vue`,
 * … — is not ours to check: parsing it as plain TypeScript would only surface
 * bogus errors.
 *
 * See https://github.com/ycmjason/ts-migrating/issues/14
 */
export const isCheckableSourceFile = (fileName: string): boolean =>
  /\.(?:[cm]?[jt]sx?)$/i.test(fileName);
