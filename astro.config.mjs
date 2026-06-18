// @ts-check
import react from '@astrojs/react';
import { defineConfig } from 'astro/config';

import cloudflare from '@astrojs/cloudflare';

// https://astro.build/config
export default defineConfig({
  integrations: [react()],
  adapter: cloudflare(),
});