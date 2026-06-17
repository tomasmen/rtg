import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// `base` is '/' locally; CI sets VITE_BASE to '/<repo>/' for GitHub Pages.
// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  base: process.env.VITE_BASE ?? '/',
});
