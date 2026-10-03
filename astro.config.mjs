// @ts-check
import react from '@astrojs/react';
import solid from '@astrojs/solid-js';
import { defineConfig } from 'astro/config';

import cloudflare from '@astrojs/cloudflare';

// https://astro.build/config
export default defineConfig({
  // Both use JSX, so each integration only claims its own files.
  integrations: [
    react({ exclude: ['**/word-art/**'] }),
    solid({ include: ['**/word-art/**'] }),
  ],
  adapter: cloudflare(),
});
