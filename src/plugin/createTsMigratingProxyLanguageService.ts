import type TsServerLibrary from 'typescript/lib/tsserverlibrary';
import { DIRECTIVE } from './constants/DIRECTIVE';
import { UNUSED_DIRECTIVE_DIAGNOSTIC_CODE } from './constants/UNUSED_DIRECTIVE_DIAGNOSTIC_CODE';
import { createOverwritingProxy } from './createOverwritingProxy';
import { isCheckableSourceFile } from './isCheckableSourceFile';
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
    getSemanticDiagnostics: fileName => {
      const diagnostics = fromLanguageService.getSemanticDiagnostics(fileName);

      // Other language-service plugins own non-TS/JS files — most notably the
      // Angular Language Service owns `.html` templates. Our secondary service
      // has none of those plugins, so running it over such a file would parse
      // the file as plain TypeScript and surface bogus errors.
      // https://github.com/ycmjason/ts-migrating/issues/14
      if (!isCheckableSourceFile(fileName)) return diagnostics;

      const sourceFile = fromLanguageService.getProgram()?.getSourceFile(fileName);

      if (!sourceFile) return diagnostics;

      const pluginDiagnostics = (() => {
        const getLineNumberByPosition = (position: number): number =>
          sourceFile.getLineAndCharacterOfPosition(position).line;

        const newlyIntroducedDiagnostics = differenceBy(
          toLanguageService.getSemanticDiagnostics(fileName),
          diagnostics,
          serializeDiagnostic,
        );

        const directiveComments = fromLanguageService
          .getTodoComments(fileName, [{ text: DIRECTIVE, priority: 0 }])
          .filter(({ message }) => new RegExp(`^${DIRECTIVE}(\\s|$)`).test(message));

        return [
          ...getUnmarkedDiagnostics(newlyIntroducedDiagnostics, {
            sourceFile,
            directiveComments,
            getLineNumberByPosition,
          }),
          ...getUnusedDirectiveComments(directiveComments, {
            sourceFile,
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
