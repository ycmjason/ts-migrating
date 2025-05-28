enum FRUITS {
  // ^^^^^^ --ERROR--> [ts-migrating] This syntax is not allowed when 'erasableSyntaxOnly' is enabled.
  APPLE,
  BANANA,
  KIWI,
}

// @ts-migrating - ✅ the next line is type-checked with `erasableSyntaxOnly` disabled!
enum Type {
  A,
  B,
  C,
}
