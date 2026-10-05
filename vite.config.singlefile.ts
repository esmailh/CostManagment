import { readFileSync } from 'node:fs';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';

// Inline the favicon SVG as a data URI so the single-file build is 100% self-contained.
function inlineFavicon(): Plugin {
  return {
    name: 'inline-favicon',
    apply: 'build',
    transformIndexHtml(html) {
      const svg = readFileSync('public/favicon.svg', 'utf8');
      const dataUri = 'data:image/svg+xml;base64,' + Buffer.from(svg).toString('base64');
      return html.replace(
        /<link rel="icon"[^>]*>/,
        `<link rel="icon" href="${dataUri}" type="image/svg+xml" />`,
      );
    },
  };
}

// Builds the whole app (JS + CSS + Persian font) into ONE self-contained index.html
// that can be opened directly from a phone's storage over file:// — no server needed.
export default defineConfig({
  base: './',
  plugins: [react(), viteSingleFile(), inlineFavicon()],
  build: {
    outDir: 'dist-single',
    cssCodeSplit: false,
    assetsInlineLimit: 100000000, // inline the 111KB woff2 font as a data URI
    rollupOptions: {
      output: {
        inlineDynamicImports: true,
      },
    },
  },
});
