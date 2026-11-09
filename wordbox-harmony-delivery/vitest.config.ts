import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

/** Convert a path relative to this config file into a normalized absolute path. */
function abs(rel: string): string {
  return fileURLToPath(new URL(rel, import.meta.url)).replace(/\\/g, '/');
}

const coreDir: string = abs('./core/src');
const coreIndex: string = abs('./core/src/index.ts');
const adaptersDir: string = abs('./adapters');

export default defineConfig({
  resolve: {
    alias: [
      { find: /^@core\/(.*)$/, replacement: coreDir + '/$1' },
      { find: /^@core$/, replacement: coreIndex },
      { find: /^@adapters\/(.*)$/, replacement: adaptersDir + '/$1' },
      { find: /^@adapters$/, replacement: adaptersDir },
    ],
  },
  test: {
    environment: 'node',
    globals: true,
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['core/src/**/*.ts'],
      reporter: ['text', 'html'],
    },
  },
});
