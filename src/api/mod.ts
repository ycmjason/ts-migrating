export type {
  DiagnosticOrigin,
  TsMigratingReportEntry,
} from '../plugin/createTsMigratingProxyLanguageService';
export { getSemanticDiagnosticsForFile } from './getSemanticDiagnostics';
export { getTSInfoForFile } from './getTSInfoForFile';
export { getTsMigratingReportForFile } from './getTsMigratingReportForFile';
export { insertSingleLineCommentAtPositions } from './insertSingleLineCommentsAtPositions';
export { isPluginDiagnostic } from './isPluginDiagnostic';
