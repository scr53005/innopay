import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  // Match Next.js JSX handling for components without a React namespace import.
  esbuild: { jsx: 'automatic' },
  // Component tests do not need the Next.js/Tailwind PostCSS build pipeline.
  css: { postcss: { plugins: [] } },
  test: {
    // 'node' is enough for the pure money-math/lib tests. Switch to 'jsdom' (and add the
    // jsdom devDep) if/when the hub gets component tests, as millewee does.
    environment: 'node',
    include: ['**/*.{test,spec}.{ts,tsx}'],
    exclude: ['node_modules', 'dist', '.next', 'scripts'],
  },
  resolve: {
    // Mirror tsconfig "@/*" so lib files imported via the alias resolve under tests.
    // (Tested lib files themselves use relative imports per the CLAUDE.md alias gotcha;
    // this is belt-and-suspenders for modules imported via "@/".)
    alias: { '@': resolve(__dirname, '.') },
  },
});
