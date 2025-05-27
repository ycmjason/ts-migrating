import type ts from 'typescript/lib/tsserverlibrary';
import { PLUGIN_DIAGNOSTIC_TAG } from '../plugin/constants/PLUGIN_DIAGNOSTIC_TAG';

export const isPluginDiagnostic = (diagnostic: ts.Diagnostic): boolean => {
  // all plugin diagnostic are a message chain
  if (typeof diagnostic.messageText === 'string') return false;

  // all plugin diagnostic's first message is this tag
  return diagnostic.messageText.messageText === PLUGIN_DIAGNOSTIC_TAG;
};
