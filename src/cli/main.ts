#!/usr/bin/env node
import process from 'node:process';
import { buildApplication, buildCommand, buildRouteMap, run } from '@stricli/core';
import { packageJson as packageJSON } from '../packageJson.ts';
import { ANNOTATE_WARNING } from './constants/annotate-warning.ts';
import { applyMaxOldSpaceSize } from './maxOldSpaceSize.ts';

// Strip (and warn about) the no-op `--max-old-space-size` flag; returns the
// remaining args to parse.
const args = applyMaxOldSpaceSize();

(async () => {
  await run(
    buildApplication(
      buildRouteMap({
        routes: {
          check: buildCommand({
            loader: async () => (await import('./commands/check.ts')).check,
            parameters: {
              flags: {
                verbose: {
                  kind: 'boolean',
                  brief: 'Enable verbose logging.',
                  default: false,
                },
                allTypeErrors: {
                  kind: 'boolean',
                  brief:
                    'Display all type errors. By default, this command only show [ts-migrating] errors, which are type errors introduced by the new tsconfig.',
                  default: false,
                },
                reporter: {
                  kind: 'enum',
                  values: ['pretty', 'json', 'ndjson'],
                  brief:
                    'Output format. "pretty" (default) prints human-readable diagnostics with colour and context; "json" prints a flat JSON array of every diagnostic (origin + @ts-migrating directive info) for CI gates / dashboards; "ndjson" streams the same records one JSON object per line for large repos.',
                  default: 'pretty',
                },
              },
              aliases: {
                v: 'verbose',
                a: 'allTypeErrors',
                r: 'reporter',
              },
              positional: {
                kind: 'array',
                parameter: {
                  placeholder: 'path',
                  brief: 'File / Directories Paths or Globs',
                  parse: String,
                },
              },
            },
            docs: {
              brief: 'Run `@ts-migrating`-aware type checks.',
              customUsage: ['path/to/file1.ts path/to/directory glob/**/example/*'],
            },
          }),
          annotate: buildCommand({
            loader: async () => (await import('./commands/annotate.ts')).annotate,
            parameters: {
              flags: {
                verbose: {
                  kind: 'boolean',
                  brief: 'Enable verbose logging.',
                  default: false,
                },
              },
              aliases: {
                v: 'verbose',
              },
              positional: {
                kind: 'array',
                parameter: {
                  placeholder: 'path',
                  brief: 'File / Directories Paths or Globs',
                  parse: String,
                },
              },
            },
            docs: {
              brief: 'Annotate all errors introduced by the new config with @ts-migrating',
              fullDescription: `Annotate all errors introduced by the new config with @ts-migrating

${ANNOTATE_WARNING}`,
            },
          }),
          info: buildCommand({
            func: (await import('./commands/info.ts')).info,
            parameters: {
              positional: {
                kind: 'array',
                parameter: {
                  placeholder: 'path',
                  brief: 'File / Directories Paths or Globs',
                  parse: String,
                },
              },
            },
            docs: {
              brief: 'Show some debug info that might be useful.',
            },
          }),
        },
        docs: {
          brief: '@ts-migrating CLI',
        },
      }),
      {
        name: packageJSON.name,
        versionInfo: {
          currentVersion: packageJSON.version,
        },
      },
    ),
    args,
    { process },
  );
})();
