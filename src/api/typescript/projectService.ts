import ts from 'typescript/lib/tsserverlibrary';

export const projectService = new ts.server.ProjectService({
  host: {
    ...ts.sys,
    setTimeout,
    clearTimeout,
    setImmediate,
    clearImmediate,
    watchDirectory: () => ({ close: () => {} }),
    watchFile: () => ({ close: () => {} }),
  },
  session: undefined,
  logger: {
    close: () => {},
    hasLevel: () => false,
    loggingEnabled: () => false,
    perftrc: () => {},
    info: () => {},
    startGroup: () => {},
    endGroup: () => {},
    msg: () => {},
    getLogFileName: () => undefined,
  },
  cancellationToken: ts.server.nullCancellationToken,
  useSingleInferredProject: true,
  useInferredProjectPerProjectRoot: true,
  typingsInstaller: ts.server.nullTypingsInstaller,
  allowLocalPluginLoads: true,
});
