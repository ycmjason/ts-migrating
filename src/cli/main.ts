#!/usr/bin/env node
import process from 'node:process';
import {
  type CommandContext,
  type TypedCommandParameters,
  buildApplication,
  buildCommand,
  buildRouteMap,
  run,
} from '@stricli/core';
import ts from 'typescript/lib/tsserverlibrary';
import packageJSON from '../../package.json';
import { ANNOTATE_WARNING } from './constants/annotate-warning';

const parameters: NoInfer<
  TypedCommandParameters<
    {
      verbose: boolean;
    },
    string[],
    CommandContext
  >
> = {
  flags: {
    verbose: {
      kind: 'boolean',
      brief: 'Enable verbose logging.',
      default: false,
    },
  },
  positional: {
    kind: 'array',
    parameter: {
      placeholder: 'path',
      brief: 'File / Directories Paths',
      parse: String,
    },
  },
};

(async () => {
  await run(
    buildApplication(
      buildRouteMap({
        routes: {
          check: buildCommand({
            loader: async () => (await import('./commands/check')).check,
            parameters,
            docs: {
              brief: 'Run `@ts-migrating`-aware type checks.',
              customUsage: ['path/to/file1.ts path/to/directory glob/**/example/*'],
            },
          }),
          annotate: buildCommand({
            loader: async () => (await import('./commands/annotate')).annotate,
            parameters,
            docs: {
              brief: 'Annotate all errors introduced by the new config with @ts-migrating',
              fullDescription: `Annotate all errors introduced by the new config with @ts-migrating

${ANNOTATE_WARNING}`,
            },
          }),
          info: buildCommand({
            func: () => {
              console.log(
                JSON.stringify(
                  {
                    cwd: process.cwd(),
                    TypeScript: {
                      path: require.resolve('typescript'),
                      version: ts.version,
                    },
                    nodejs: {
                      version: process.version,
                    },
                  },
                  null,
                  2,
                ),
              );
            },
            parameters: {},
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
