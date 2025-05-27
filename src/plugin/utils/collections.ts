/**
 * Return a new array containing elements in xs but not ys based on getComparer
 */
export const differenceBy = <X, Y, C>(
  xs: readonly X[],
  ys: readonly Y[],
  getComparer: (x: X | Y) => C,
): X[] => {
  const xs2ComparerSet = new Set(ys.map(x => getComparer(x)));
  return xs.filter(x => !xs2ComparerSet.has(getComparer(x)));
};
