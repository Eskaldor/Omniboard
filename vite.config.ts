import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, loadEnv} from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(({mode}) => {
  const env = loadEnv(mode, '.', '');
  return {
    plugins: [
      react(),
      tailwindcss(),
      VitePWA({
        registerType: 'autoUpdate',
        injectRegister: 'auto',
        manifest: {
          name: 'Omniboard',
          short_name: 'Omniboard',
          description: 'Omniboard Player View',
          start_url: '/player',
          scope: '/',
          display: 'standalone',
          background_color: '#09090b',
          theme_color: '#09090b',
          icons: [
            {
              src: '/assets/default/portraits/mystery.png',
              sizes: 'any',
              type: 'image/png',
              purpose: 'any maskable',
            },
          ],
        },
        workbox: {
          navigateFallbackDenylist: [/^\/api\//, /^\/ws\//],
        },
      }),
    ],
    define: {
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      hmr: process.env.DISABLE_HMR !== 'true',
      watch: {
        ignored: ['**/data/**'],
      },
      proxy: {
        '/api': {
          target: 'http://127.0.0.1',
          changeOrigin: true,
        },
        '/ws': {
          target: 'http://127.0.0.1',
          ws: true,
          changeOrigin: true,
        },
        '/assets': {
          target: 'http://127.0.0.1',
          changeOrigin: true,
        },
        '/render': {
          target: 'http://127.0.0.1',
          changeOrigin: true,
        },
        '/locales': {
          target: 'http://127.0.0.1',
          changeOrigin: true,
        }
      }
    },
  };
});
