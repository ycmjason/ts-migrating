import type TsServerLibrary from 'typescript/lib/tsserverlibrary';
import { DIRECTIVE } from './constants/DIRECTIVE';
import { UNUSED_DIRECTIVE_DIAGNOSTIC_CODE } from './constants/UNUSED_DIRECTIVE_DIAGNOSTIC_CODE';
import { createOverwritingProxy } from './createOverwritingProxy';
import { differenceBy } from './utils/collections';
import {
  brandifyDiagnostic,
  getUnmarkedDiagnostics,
  getUnusedDirectiveComments,
  serializeDiagnostic,
} from './utils/diagnostics';

export const createTsMigratingProxyLanguageService = ({
  ts,
  fromLanguageService,
  toLanguageService,
}: {
  ts: typeof TsServerLibrary;
  fromLanguageService: TsServerLibrary.LanguageService;
  toLanguageService: TsServerLibrary.LanguageService;
}) =>
  createOverwritingProxy(fromLanguageService, {
    getQuickInfoAtPosition: (...attrs) => toLanguageService.getQuickInfoAtPosition(...attrs),
    getSemanticDiagnostics: name => {
      const diagnostics = fromLanguageService.getSemanticDiagnostics(name);

      const sourceFile = fromLanguageService.getProgram()?.getSourceFile(name);

      if (!sourceFile) return diagnostics;

      const pluginDiagnostics = (() => {
        const getLineNumberByPosition = (position: number): number =>
          sourceFile.getLineAndCharacterOfPosition(position).line;

        const newlyIntroducedDiagnostics = differenceBy(
          toLanguageService.getSemanticDiagnostics(name),
          diagnostics,
          serializeDiagnostic,
        );

        const directiveComments = fromLanguageService
          .getTodoComments(name, [{ text: DIRECTIVE, priority: 0 }])
          .filter(({ message }) => new RegExp(`^${DIRECTIVE}(\\s|$)`).test(message));

        return [
          ...getUnmarkedDiagnostics(newlyIntroducedDiagnostics, {
            directiveComments,
            getLineNumberByPosition,
          }),
          ...getUnusedDirectiveComments(directiveComments, {
            newlyIntroducedDiagnostics,
            getLineNumberByPosition,
          }).map(({ position, descriptor }) => ({
            category: ts.DiagnosticCategory.Error,
            code: UNUSED_DIRECTIVE_DIAGNOSTIC_CODE,
            file: sourceFile,
            start: position,
            length: descriptor.text.length,
            messageText: `Unused '${descriptor.text}' directive.`,
          })),
        ].map(brandifyDiagnostic);
      })();

      return [...diagnostics, ...pluginDiagnostics];
    },
  });
