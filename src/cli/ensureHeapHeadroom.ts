import { spawnSync } from 'node:child_process';
import os from 'node:os';
import process from 'node:process';
import { getHeapStatistics } from 'node:v8';

const SENTINEL_ENV = 'TS_MIGRATING_HEAP_BOOSTED';
const OVERRIDE_ENV = 'TS_MIGRATING_MAX_OLD_SPACE_SIZE';

/** Commands that type-check the whole repo and can run out of memory. */
const HEAVY_COMMANDS = new Set(['check', 'annotate']);

/**
 * Never auto-allocate more than this (MB) for the old space. Big repos on big
 * machines still get plenty of headroom; users who need more can raise it with
 * {@link OVERRIDE_ENV}.
 */
const DEFAULT_CAP_MB = 8192;

/** Skip re-exec when we're already within this many MB of the target. */
const SLACK_MB = 64;

const hasExplicitHeapFlag = (value: string): boolean => /--max[-_]old[-_]space[-_]size/.test(value);

/**
 * Old-space size (MB) we'd like `node` to allow for a heavy command. `0` means
 * "leave node's default alone".
 */
export const resolveTargetHeapMB = ({
  totalMemoryBytes,
  override,
}: {
  totalMemoryBytes: number;
  override: string | undefined;
}): number => {
  if (override !== undefined) {
    const requested = Number(override);
    return Number.isFinite(requested) && requested > 0 ? Math.floor(requested) : 0;
  }
  // Aim for ~half of physical memory, capped, so we use idle RAM on big
  // machines without trying to grab more than the box actually has.
  return Math.min(DEFAULT_CAP_MB, Math.floor(totalMemoryBytes / 1024 / 1024 / 2));
};

export const shouldBoostHeap = ({
  subcommand,
  targetMB,
  currentLimitMB,
  alreadyBoosted,
  userConfiguredHeap,
}: {
  subcommand: string | undefined;
  targetMB: number;
  currentLimitMB: number;
  alreadyBoosted: boolean;
  userConfiguredHeap: boolean;
}): boolean => {
  if (alreadyBoosted) return false; // re-exec guard: never loop
  if (userConfiguredHeap) return false; // respect an explicit choice
  if (subcommand === undefined || !HEAVY_COMMANDS.has(subcommand)) return false;
  if (targetMB <= 0) return false; // disabled via override
  return currentLimitMB < targetMB - SLACK_MB;
};

/**
 * `--max-old-space-size` can't be raised once the process is running
 * (`v8.setFlagsFromString` is ignored for it) and a shebang flag isn't
 * portable, so for the type-checking commands we re-exec `node` with a higher
 * old-space limit when the current one looks too low for a large repo. node's
 * default heap is what makes these repos run out of memory. See
 * https://github.com/ycmjason/ts-migrating/issues/16
 *
 * Override the size — or opt out — with `TS_MIGRATING_MAX_OLD_SPACE_SIZE` (MB;
 * `0` disables), or by passing your own `--max-old-space-size`.
 */
export const ensureHeapHeadroom = (): void => {
  const scriptPath = process.argv[1];
  if (scriptPath === undefined) return;

  const subcommand = process.argv.slice(2).find(arg => !arg.startsWith('-'));

  const targetMB = resolveTargetHeapMB({
    totalMemoryBytes: os.totalmem(),
    override: process.env[OVERRIDE_ENV],
  });

  const boost = shouldBoostHeap({
    subcommand,
    targetMB,
    currentLimitMB: getHeapStatistics().heap_size_limit / 1024 / 1024,
    alreadyBoosted: process.env[SENTINEL_ENV] === '1',
    userConfiguredHeap:
      process.execArgv.some(hasExplicitHeapFlag) ||
      hasExplicitHeapFlag(process.env.NODE_OPTIONS ?? ''),
  });

  if (!boost) return;

  const result = spawnSync(
    process.execPath,
    [...process.execArgv, `--max-old-space-size=${targetMB}`, scriptPath, ...process.argv.slice(2)],
    { stdio: 'inherit', env: { ...process.env, [SENTINEL_ENV]: '1' } },
  );

  // If we somehow couldn't spawn, fall back to running in-process.
  if (result.error) return;

  process.exit(result.status ?? 1);
};

if (import.meta.vitest) {
  const { describe, it, expect } = import.meta.vitest;
  const GB = 1024 * 1024 * 1024;

  describe('resolveTargetHeapMB', () => {
    it('honours a positive override (MB)', () => {
      expect(resolveTargetHeapMB({ totalMemoryBytes: 8 * GB, override: '12000' })).toBe(12000);
    });

    it('treats 0 / invalid overrides as "disabled"', () => {
      expect(resolveTargetHeapMB({ totalMemoryBytes: 8 * GB, override: '0' })).toBe(0);
      expect(resolveTargetHeapMB({ totalMemoryBytes: 8 * GB, override: 'nope' })).toBe(0);
    });

    it('targets ~half of RAM, capped at 8192', () => {
      expect(resolveTargetHeapMB({ totalMemoryBytes: 16 * GB, override: undefined })).toBe(8192);
      expect(resolveTargetHeapMB({ totalMemoryBytes: 8 * GB, override: undefined })).toBe(4096);
      // Never tries to grab more than the cap, even with lots of RAM.
      expect(resolveTargetHeapMB({ totalMemoryBytes: 64 * GB, override: undefined })).toBe(8192);
    });
  });

  describe('shouldBoostHeap', () => {
    const base = {
      subcommand: 'check',
      targetMB: 8192,
      currentLimitMB: 4096,
      alreadyBoosted: false,
      userConfiguredHeap: false,
    };

    it('boosts a heavy command whose current limit is below target', () => {
      expect(shouldBoostHeap(base)).toBe(true);
    });

    it('does not boost light or missing commands', () => {
      expect(shouldBoostHeap({ ...base, subcommand: 'info' })).toBe(false);
      expect(shouldBoostHeap({ ...base, subcommand: undefined })).toBe(false);
    });

    it('does not boost when already boosted or user-configured', () => {
      expect(shouldBoostHeap({ ...base, alreadyBoosted: true })).toBe(false);
      expect(shouldBoostHeap({ ...base, userConfiguredHeap: true })).toBe(false);
    });

    it('does not boost when already at/above target or disabled', () => {
      expect(shouldBoostHeap({ ...base, currentLimitMB: 8192 })).toBe(false);
      expect(shouldBoostHeap({ ...base, targetMB: 0 })).toBe(false);
    });
  });
}
