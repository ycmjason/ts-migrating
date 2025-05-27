import type ts from 'typescript/lib/tsserverlibrary';
import { createOverwritingProxy } from './createOverwritingProxy';
import { createTsMigratingProxyLanguageService } from './createTsMigratingProxyLanguageService';

export default (({ typescript: ts }) => ({
  create: ({ languageService, languageServiceHost, config }) =>
    createTsMigratingProxyLanguageService({
      ts,
      fromLanguageService: languageService,
      toLanguageService: (() => {
        const compilerOptionsOverwrite = (() => {
          const { compilerOptions = {} } = config;
          return compilerOptions;
        })();

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
        );
      })(),
    }),
})) satisfies ts.server.PluginModuleFactory;
