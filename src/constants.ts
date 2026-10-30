/** The comment directive that marks the next line as migration debt. */
export const DIRECTIVE = '@ts-migrating';

/** The `name` of ts-migrating's entry in `compilerOptions.plugins`. */
export const PLUGIN_NAME = 'ts-migrating';

/** Prefix for `ts-migrating` errors in the human-readable (`pretty`) output. */
export const PLUGIN_DIAGNOSTIC_TAG = '[ts-migrating]';

/**
 * arbitrary code to represent UNUSED_DIRECTIVE_DIAGNOSTIC for easy distinguishing of the error
 *
 * - 555 is my lucky number
 */
export const UNUSED_DIRECTIVE_DIAGNOSTIC_CODE = 555;
