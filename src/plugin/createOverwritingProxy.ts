export const createOverwritingProxy = <T extends object>(object: T, overwrite: Partial<T>) =>
  new Proxy(object, {
    get(target, key, receiver) {
      if (key in overwrite) {
        return Reflect.get(overwrite, key, receiver);
      }
      return Reflect.get(target, key, receiver);
    },
  });
