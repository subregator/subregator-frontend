import { sveltekit } from '@sveltejs/kit/vite';
import adapter from '@sveltejs/adapter-node';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [sveltekit({ adapter: adapter({ precompress: true }) })],
  server: { port: 5173, strictPort: true },
  preview: { port: 4173, strictPort: true }
});
