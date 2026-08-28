import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');

  // The wordmark is referenced by every layout. A missing file would build
  // cleanly and ship a page full of broken-image icons, so check it here where
  // the failure is obvious rather than in production.
  if (!existsSync(resolve(__dirname, 'public/brand/skim-city-wordmark.png'))) {
    throw new Error(
      '\n\nMissing web/public/brand/skim-city-wordmark.png — the Skim City wordmark.\n' +
        'Save the logo artwork to that path and build again.\n',
    );
  }

  // A production build with placeholder Firebase config would deploy a site
  // that looks fine and silently fails every booking. Better to stop here than
  // to find out from a customer.
  if (mode === 'production') {
    const missing = [
      'VITE_FIREBASE_API_KEY',
      'VITE_FIREBASE_PROJECT_ID',
      'VITE_FIREBASE_APP_ID',
    ].filter((key) => !env[key] || env[key].startsWith('demo-') || /^0+$/.test(env[key].replace(/\D/g, '')));

    if (missing.length > 0) {
      throw new Error(
        `\n\nRefusing to build for production with placeholder Firebase config.\n` +
          `Fix these in web/.env.local (or your CI environment): ${missing.join(', ')}\n\n` +
          `Get the real values from:\n` +
          `  console.firebase.google.com/project/skimcity-bac3b\n` +
          `  → Project settings → General → Your apps → Web app\n`,
      );
    }
  }

  // `--mode preview` produces a single self-contained bundle for scripts/
  // build-preview.mjs to inline into one HTML file. The production guard above
  // deliberately does not apply: a preview has no backend to talk to.
  const singleFile = mode === 'preview';

  return {
    plugins: [react(), tailwindcss()],
    build: singleFile
      ? {
          // Everything in one chunk, so there are no sibling files to fetch.
          rollupOptions: { output: { inlineDynamicImports: true } },
          assetsInlineLimit: 100 * 1024 * 1024,
          cssCodeSplit: false,
        }
      : {},
    // The CRM is only ever loaded by one person; the marketing site is what
    // needs to be fast. React.lazy() in App.tsx splits the whole /app tree into
    // its own chunk, so the public bundle never carries the CRM.
  };
});
