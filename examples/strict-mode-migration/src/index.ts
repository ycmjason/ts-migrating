const greet = (name: string): void => {
  console.log(`Hello, ${name}`);
};

greet(undefined);
//    ^^^^^^^^^ --ERROR--> "[ts-migrating] Argument of type 'undefined' is not assignable to parameter of type 'string'."

// @ts-migrating - the error next line will be ignored
greet(undefined); // ✅ No errors

// @ts-migrating-abc - no effect.

// @ts-migrating - this will show "Unused @ts-migrating directive" error
// ^^^^^^^^^^^^^ --ERROR--> "[ts-migrating] Unused '@ts-migrating' directive"
