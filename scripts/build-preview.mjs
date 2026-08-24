#!/usr/bin/env node
/**
 * Folds the built site into a single self-contained HTML file.
 *
 * Used for sharing a look at the real site before it is deployed, or anywhere a
 * static one-file build is easier than hosting. The output is the actual
 * application — same components, same CSS, same fonts — not a mock-up.
 *
 * Run `npm run build:preview` from the repo root.
 *
 * Everything the browser would otherwise fetch is embedded: the JS bundle, the
 * stylesheet, and the two woff2 files. Anything that talks to Firebase will
 * fail, because there is no backend and no network access from a sandboxed
 * page, so the booking calendar, gallery and reviews fall back to their empty
 * and error states. That is the honest picture of the site without its backend.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'web', 'dist');
const out = join(root, 'web', 'preview.html');

if (!existsSync(join(dist, 'index.html'))) {
  console.error('No build found. Run: npm --prefix web run build:preview');
  process.exit(1);
}

let html = readFileSync(join(dist, 'index.html'), 'utf8');

/** Reads a file that the built HTML referenced by absolute path. */
function asset(url) {
  return readFileSync(join(dist, url.replace(/^\//, '')));
}

// --- Stylesheet, with its font URLs turned into data URIs ----------------
html = html.replace(
  /<link rel="stylesheet"[^>]*href="([^"]+)"[^>]*>/g,
  (_match, href) => {
    let css = asset(href).toString('utf8');

    css = css.replace(/url\((['"]?)([^'")]+\.woff2)\1\)/g, (whole, _q, fontUrl) => {
      try {
        const font = asset(fontUrl).toString('base64');
        return `url(data:font/woff2;base64,${font})`;
      } catch {
        console.warn(`  ! could not inline font ${fontUrl}`);
        return whole;
      }
    });

    return `<style>${css}</style>`;
  },
);

// --- JS bundle -----------------------------------------------------------
html = html.replace(
  /<script type="module"[^>]*src="([^"]+)"[^>]*><\/script>/g,
  (_match, src) => {
    const js = asset(src).toString('utf8');
    // `</script>` inside a string literal would close the tag early.
    return `<script type="module">${js.replace(/<\/script>/gi, '<\\/script>')}</script>`;
  },
);

// --- Strip anything still pointing at a file that will not exist ---------
html = html
  .replace(/<link rel="icon"[^>]*>/g, '')
  .replace(/<link rel="preload"[^>]*>/g, '')
  .replace(/<link rel="canonical"[^>]*>/g, '');

// --- Body content only ---------------------------------------------------
// The publishing target wraps content in its own document skeleton, so hand it
// the title, the styles, the mount point and the script — not a second <html>.
// The page's own <title> is written for search results. When the file is
// shared as a standalone preview it just needs to be findable in a list, so
// use the plain brand name.
const title = 'Skim City';
const styles = [...html.matchAll(/<style>([\s\S]*?)<\/style>/g)].map((m) => m[1]).join('\n');
const scripts = [...html.matchAll(/<script type="module">([\s\S]*?)<\/script>/g)]
  .map((m) => m[1])
  .join('\n');

const banner = `
<div id="preview-note" role="note">
  <strong>Static preview.</strong>
  This is the real built site with no backend attached, so booking availability,
  the gallery and reviews show their empty states. Everything else is exactly
  what deploys.
  <button type="button" onclick="document.getElementById('preview-note').remove()"
          aria-label="Dismiss this notice">Dismiss</button>
</div>`;

const bannerCss = `
#preview-note {
  position: fixed; inset-inline: 0; bottom: 0; z-index: 9999;
  display: flex; align-items: center; gap: .75rem; flex-wrap: wrap;
  padding: .7rem 1rem;
  background: #1a1f27; border-top: 2px solid #7a1f2b;
  color: #98a1ae; font: 400 13px/1.5 Inter, system-ui, sans-serif;
}
#preview-note strong { color: #f2f4f7; font-weight: 600; }
#preview-note button {
  margin-inline-start: auto; cursor: pointer;
  background: none; border: 1px solid #3a4350; color: #98a1ae;
  padding: .3rem .7rem; border-radius: 2px;
  font: 500 11px/1 Inter, system-ui, sans-serif;
  letter-spacing: .1em; text-transform: uppercase;
}
#preview-note button:hover { color: #f2f4f7; border-color: #6cabdd; }
body { padding-bottom: 3.5rem; }`;

writeFileSync(
  out,
  `<title>${title}</title>\n<style>${styles}${bannerCss}</style>\n<div id="root"></div>${banner}\n<script type="module">${scripts}</script>\n`,
);

const kb = (n) => `${Math.round(n / 1024)} KB`;
console.log(`Wrote ${out}`);
console.log(`  ${kb(readFileSync(out).length)} — self-contained, no external requests`);
