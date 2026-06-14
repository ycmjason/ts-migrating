/**
 * Wrap `object` in a proxy whose `overwrite` entries take precedence. Besides
 * overriding existing members (type-checked against `T`), `overwrite` may also
 * introduce brand-new members — the returned type is `T & O` — which we use to
 * hang extra ts-migrating-specific methods off a TypeScript `LanguageService`.
 *
 * Brand-new members are also exposed to own-key enumeration (`ownKeys` /
 * `getOwnPropertyDescriptor`), so a later plugin that re-wraps this service by
 * copying `Object.keys(...)` — the pattern from the TS plugin wiki — keeps them
 * instead of silently dropping them.
 */
export const createOverwritingProxy = <T extends object, O extends object = Partial<T>>(
  object: T,
  overwrite: O & Partial<T>,
): T & O => {
  // Members of `overwrite` that don't already exist on `object`, i.e. the
  // genuinely new ones we need to surface for enumeration.
  const addedKeys = Reflect.ownKeys(overwrite).filter(
    key => Reflect.getOwnPropertyDescriptor(object, key) === undefined,
  );

  return new Proxy(object, {
    get(target, key, receiver) {
      if (key in overwrite) {
        return Reflect.get(overwrite, key, receiver);
      }
      return Reflect.get(target, key, receiver);
    },
    has(target, key) {
      return key in overwrite || key in target;
    },
    ownKeys(target) {
      return [...Reflect.ownKeys(target), ...addedKeys];
    },
    getOwnPropertyDescriptor(target, key) {
      const targetDescriptor = Reflect.getOwnPropertyDescriptor(target, key);
      if (targetDescriptor === undefined && Object.hasOwn(overwrite, key)) {
        return {
          configurable: true,
          enumerable: true,
          writable: true,
          value: Reflect.get(overwrite, key),
        };
      }
      return targetDescriptor;
    },
  }) as T & O;
};
