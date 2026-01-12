import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    root: 'src',
    includeSource: ['**/*.{js,ts,tsx,jsx}'],
    setupFiles: ['../vitest.setup.ts'],
  },
});
