import { greet } from './greet';

// @ts-migrating
greet(true);

greet(1);
//    ^ [ts-migrating] Argument of type 'number' is not assignable to parameter of type 'string'.
