/// <reference types="vitest/config" />
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// @ts-expect-error process is a nodejs global
const host = process.env.TAURI_DEV_HOST;

// https://vite.dev/config/
export default defineConfig(async () => ({
  plugins: [react(), tailwindcss()],
  build: {
    chunkSizeWarningLimit: 1000, // Remotion + React bundle is ~918KB - acceptable for desktop app
  },
  test: {
    environment: 'jsdom',
    // Keep vitest out of vendored reference repos (ref/) — the default
    // exclude list is replaced, so node_modules/dist are repeated here
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/ref/**',
      '**/artifacts/**',
      '**/src-tauri/target/**',
    ],
  },

  // Vite options for Tauri: desktop HMR must hit localhost explicitly.
  // `host: false` only binds the loopback interface but leaves HMR client config
  // ambiguous for WebKitGTK, so desktop reloads never connect.
  clearScreen: false,
  server: {
    port: 1520,
    strictPort: true,
    host: host || 'localhost',
    hmr: host
      ? {
          // Physical device / remote (TAURI_DEV_HOST)
          protocol: 'ws',
          host,
          port: 1521,
        }
      : {
          // Desktop webview: same host/port as the dev server
          protocol: 'ws',
          host: 'localhost',
          port: 1520,
        },
    watch: {
      // Never let Vite restart the whole graph when Rust rebuilds
      ignored: ['**/src-tauri/**'],
    },
  },
}));
