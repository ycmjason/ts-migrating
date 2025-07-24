#!/bin/sh

PACKAGE_NAME=$(node -p "require('./package.json').name")
VERSION=$(node -p "require('./package.json').version")

# Extract pre-release tag if present (e.g. 'beta' from '1.0.0-beta.1')
PRERELEASE_TAG=$(echo "$VERSION" | grep --color=never -Po '(alpha|beta|rc)')

# Check if version already exists on npm
if npm view "$PACKAGE_NAME@$VERSION" > /dev/null 2>&1; then
  echo "Version $VERSION of $PACKAGE_NAME already exists, skipping publish."
else
  echo "Publishing version $VERSION of $PACKAGE_NAME"

  pnpm build

  if [ -n "$PRERELEASE_TAG" ]; then
    echo "Detected pre-release tag: $PRERELEASE_TAG"
    npm publish --provenance --access public --tag "$PRERELEASE_TAG"
  else
    echo "Detected stable release"
    npm publish --provenance --access public
  fi
fi
