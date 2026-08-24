import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');

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

  return {
    plugins: [react(), tailwindcss()],
    // The CRM is only ever loaded by one person; the marketing site is what
    // needs to be fast. React.lazy() in App.tsx splits the whole /app tree into
    // its own chunk, so the public bundle never carries the CRM.
  };
});
