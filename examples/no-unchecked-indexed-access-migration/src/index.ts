const plusOne = (xs: number[]) => {
  return xs[0] + 1;
  //     ^^^^^ --ERROR--> [ts-migrating] Object is possibly 'undefined'.
};

const plusTwo = (xs: number[]) => {
  // @ts-migrating
  return xs[0] + 1; // ✅ - line reverted to original tsconfig, i.e. with `noUncheckedIndexedAccess` disabled!
};
