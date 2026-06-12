import type ts from 'typescript/lib/tsserverlibrary';
import { createOverwritingProxy } from './createOverwritingProxy';
import { createTsMigratingProxyLanguageService } from './createTsMigratingProxyLanguageService';

export default (({ typescript: ts }) => ({
  create: ({ languageService, languageServiceHost, config, project }) =>
    createTsMigratingProxyLanguageService({
      ts,
      fromLanguageService: languageService,
      toLanguageService: (() => {
        const compilerOptionsOverwrite = (() => {
          const { compilerOptions = {} } = config;
          return compilerOptions;
        })();

        /**
         * Reuse the project's shared document registry so this secondary
         * language service references the *same* parsed `SourceFile`s as the
         * primary one (including the big `lib.*.d.ts` files) instead of
         * re-parsing and holding a second copy of every file's AST.
         *
         * Our overwrite only tweaks type-checking options (e.g. `strict`,
         * `noImplicitAny`), which do not change the registry's bucket key, so
         * the cached source files — and their single bind result — are safe to
         * share between the two programs. Without this, the secondary program
         * roughly doubles AST memory and pushes large repos over the heap
         * limit. See https://github.com/ycmjason/ts-migrating/issues/16
         *
         * `documentRegistry` is an internal field on `ProjectService`; fall
         * back to a private registry (the previous behaviour) when it is
         * missing so we never crash if TypeScript stops exposing it.
         */
        const documentRegistry = (
          project.projectService as unknown as { documentRegistry?: ts.DocumentRegistry }
        ).documentRegistry;

        return ts.createLanguageService(
          createOverwritingProxy<ts.LanguageServiceHost & { updateFromProject?: undefined }>(
            languageServiceHost,
            {
              getCompilationSettings: (...args) => ({
                ...languageServiceHost.getCompilationSettings(...args),
                ...compilerOptionsOverwrite,
              }),
              /**
               * BIG THANK YOU TO https://github.com/allegro/typescript-strict-plugin/blob/master/src/plugin/utils.ts#L28-L32
               * See also: https://github.com/microsoft/TypeScript/blob/v5.8.3/src/services/services.ts#L1693-L1695
               *
               * If we do not reset this, it may cause `getProgram()` to return undefined and crash the plugin.
               * This is especially important in the standalone script.
               */
              updateFromProject: undefined,
            },
          ),
          documentRegistry,
        );
      })(),
    }),
})) satisfies ts.server.PluginModuleFactory;
