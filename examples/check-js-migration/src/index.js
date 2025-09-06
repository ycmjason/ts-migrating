import { greet } from './greet';

// @ts-migrating
greet(true);
//    ^ 👌 fallback to `checkJs: false`

greet(999999999999);
//    ^ ❌ [ts-migrating] Argument of type 'number' is not assignable to parameter of type 'string'.
