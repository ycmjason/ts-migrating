import { defineConfig } from 'tsup';

export default defineConfig(options => {
  return {
    sourcemap: true,
    format: ['esm', 'cjs'],
    clean: true,
    cjsInterop: true,
    splitting: true,
    minify: !options.watch,
    treeshake: 'safest',
    define: {
      'import.meta.vitest': 'false',
    },
  };
});
