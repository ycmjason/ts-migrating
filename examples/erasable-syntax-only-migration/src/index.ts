enum FRUITS {
  // ^^^^^^ --ERROR--> [ts-migrating] This syntax is not allowed when 'erasableSyntaxOnly' is enabled.
  APPLE,
  BANANA,
  KIWI,
}

// @ts-migrating - ✅ suppressing the error next line
enum Type {
  A,
  B,
  C,
}
