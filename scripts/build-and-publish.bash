#!/bin/sh

PACKAGE_NAME=$(node -p "require('./package.json').name")
VERSION=$(node -p "require('./package.json').version")

if npm view "$PACKAGE_NAME@$VERSION" > /dev/null 2>&1; then
  echo "Version $VERSION of $PACKAGE_NAME already exists, skipping publish."
else
  echo "Publishing version $VERSION of $PACKAGE_NAME"
  pnpm build
  npm publish --provenance --access public
fi
