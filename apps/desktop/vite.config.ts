import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  define: { __TORVI_BUILD_ID__: JSON.stringify(process.env.TORVI_BUILD_ID || 'development') },
  clearScreen: false,
  server: { port: 1420, strictPort: true, watch: { ignored: ['**/src-tauri/**'] } },
  envPrefix: ['VITE_', 'TAURI_'],
  build: { target: process.env.TAURI_ENV_PLATFORM === 'windows' ? 'chrome105' : 'safari15', minify: !process.env.TAURI_ENV_DEBUG, sourcemap: false },
});
