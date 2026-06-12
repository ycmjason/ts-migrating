import { spawnSync } from 'node:child_process';
import process from 'node:process';

const FLAG = '--max-old-space-size';
// Match node's flag, in either `--max-old-space-size=N` or `--max_old_space_size=N`
// spelling. node only accepts the `=` form, so neither do we.
const FLAG_PATTERN = /^--max[-_]old[-_]space[-_]size=(.+)$/;

/**
 * Pull node's `--max-old-space-size` flag out of the CLI args so the command
 * parser never sees it, returning the requested size (last one wins, like node)
 * and the remaining args.
 */
export const extractMaxOldSpaceSize = (
  args: readonly string[],
): { sizeMB: string | undefined; rest: string[] } => {
  const rest: string[] = [];
  let sizeMB: string | undefined;

  for (const arg of args) {
    const match = FLAG_PATTERN.exec(arg);
    if (match) {
      sizeMB = match[1];
      continue;
    }
    rest.push(arg);
  }

  return { sizeMB, rest };
};

/**
 * `ts-migrating check`/`annotate` type-check the whole project, which can run
 * past node's default heap on large repos. node's `--max-old-space-size` can't
 * be changed once the process is running (`v8.setFlagsFromString` is ignored
 * for it), so when it's passed to our CLI we re-exec node with it — exactly as
 * if you had run `node --max-old-space-size=<n> …`. See
 * https://github.com/ycmjason/ts-migrating/issues/16
 *
 * Returns the args the CLI should go on to parse (the flag removed). When the
 * flag is present this re-execs and never returns; it only returns if there's
 * nothing to do, or if spawning failed and we fall back to running in-process.
 */
export const applyMaxOldSpaceSize = (): string[] => {
  const { sizeMB, rest } = extractMaxOldSpaceSize(process.argv.slice(2));
  const scriptPath = process.argv[1];
  if (sizeMB === undefined || scriptPath === undefined) return rest;

  const result = spawnSync(
    process.execPath,
    [...process.execArgv, `${FLAG}=${sizeMB}`, scriptPath, ...rest],
    { stdio: 'inherit' },
  );

  // Forward the re-exec'd process's exit code. If we couldn't spawn for some
  // reason, fall back to running in-process (without the larger heap).
  if (!result.error) process.exit(result.status ?? 1);
  return rest;
};

if (import.meta.vitest) {
  const { describe, it, expect } = import.meta.vitest;

  describe('extractMaxOldSpaceSize', () => {
    it('returns the args untouched when the flag is absent', () => {
      expect(extractMaxOldSpaceSize(['check', 'src/'])).toEqual({
        sizeMB: undefined,
        rest: ['check', 'src/'],
      });
    });

    it('extracts the size and strips the flag (after the command)', () => {
      expect(extractMaxOldSpaceSize(['check', '--max-old-space-size=8192'])).toEqual({
        sizeMB: '8192',
        rest: ['check'],
      });
    });

    it('handles the flag before the command and keeps other args', () => {
      expect(extractMaxOldSpaceSize(['--max-old-space-size=8192', 'check', 'src/'])).toEqual({
        sizeMB: '8192',
        rest: ['check', 'src/'],
      });
    });

    it('accepts the underscore spelling node also allows', () => {
      expect(extractMaxOldSpaceSize(['--max_old_space_size=4096', 'check'])).toEqual({
        sizeMB: '4096',
        rest: ['check'],
      });
    });

    it('lets the last occurrence win, like node', () => {
      expect(
        extractMaxOldSpaceSize(['--max-old-space-size=10', 'check', '--max-old-space-size=20']),
      ).toEqual({ sizeMB: '20', rest: ['check'] });
    });

    it('ignores the (invalid) space-separated form, like node', () => {
      expect(extractMaxOldSpaceSize(['check', '--max-old-space-size', '8192'])).toEqual({
        sizeMB: undefined,
        rest: ['check', '--max-old-space-size', '8192'],
      });
    });
  });
}
