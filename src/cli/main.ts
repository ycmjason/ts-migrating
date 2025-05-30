#!/usr/bin/env node
import process from 'node:process';
import { buildApplication, buildCommand, buildRouteMap, run } from '@stricli/core';
import packageJSON from '../../package.json' with { type: 'json' };
import { ANNOTATE_WARNING } from './constants/annotate-warning';

(async () => {
  await run(
    buildApplication(
      buildRouteMap({
        routes: {
          check: buildCommand({
            loader: async () => (await import('./commands/check')).check,
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
              },
              aliases: {
                v: 'verbose',
                a: 'allTypeErrors',
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
            loader: async () => (await import('./commands/annotate')).annotate,
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
            func: (await import('./commands/info')).info,
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
    process.argv.slice(2),
    { process },
  );
})();
