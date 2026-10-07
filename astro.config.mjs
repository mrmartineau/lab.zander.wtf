// @ts-check
import react from '@astrojs/react';
import solid from '@astrojs/solid-js';
import { defineConfig } from 'astro/config';

import cloudflare from '@astrojs/cloudflare';

// https://astro.build/config
export default defineConfig({
  // Both use JSX, so each integration only claims its own files.
  integrations: [
    react({ exclude: ['**/word-art/**', '**/playground/**'] }),
    solid({ include: ['**/word-art/**', '**/playground/**'] }),
  ],
  adapter: cloudflare(),
  vite: {
    plugins: [
      // ponytail: vite-plugin-solid 2.11.14 sets the dependency scan to
      // `jsx: 'preserve'`, and Rolldown then fails to parse the JSX it kept,
      // so Vite skips pre-bundling. This runs after it and puts the default
      // back. The scan only reads imports, so the runtime it picks is harmless.
      // Delete when vite-plugin-solid fixes it.
      {
        name: 'fix-solid-dep-scan',
        enforce: 'post',
        config: () => ({ optimizeDeps: { rolldownOptions: { transform: { jsx: 'react-jsx' } } } }),
      },
    ],
  },
});
