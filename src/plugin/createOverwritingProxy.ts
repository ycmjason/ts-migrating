/**
 * Wrap `object` in a proxy whose `overwrite` entries take precedence. Besides
 * overriding existing members (type-checked against `T`), `overwrite` may also
 * introduce brand-new members — the returned type is `T & O` — which we use to
 * hang extra ts-migrating-specific methods off a TypeScript `LanguageService`.
 */
export const createOverwritingProxy = <T extends object, O extends object = Partial<T>>(
  object: T,
  overwrite: O & Partial<T>,
): T & O =>
  new Proxy(object, {
    get(target, key, receiver) {
      if (key in overwrite) {
        return Reflect.get(overwrite, key, receiver);
      }
      return Reflect.get(target, key, receiver);
    },
  }) as T & O;
