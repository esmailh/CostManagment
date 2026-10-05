import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(({ mode }) => ({
  // Capacitor serves packaged files from a local origin, so native assets must
  // use relative paths. The normal web build remains rooted for PWA hosting.
  base: mode === 'capacitor' ? './' : '/',
  plugins: [
    react(),
    mode !== 'capacitor' && VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'icons/apple-touch-icon.png'],
      manifest: {
        name: 'مدیریت هزینه',
        short_name: 'هزینه‌ها',
        description: 'مدیریت ساده و آفلاین هزینه‌های شخصی',
        lang: 'fa',
        dir: 'rtl',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#0f172a',
        theme_color: '#0d9488',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2,ico}'],
        navigateFallback: 'index.html',
      },
    }),
  ].filter(Boolean),
}));
