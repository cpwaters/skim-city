# Source artwork

The original Skim City artwork, kept in the repo but deliberately **outside**
`web/public/` so it is not copied into every deploy — nothing on the site loads
these files.

- `skim-city-text.png` — the wordmark, 1254px square on an opaque black field.
- `skim-city-logo.png` — the full logo.

`web/public/brand/skim-city-wordmark.png` is what the site actually uses. It is
derived from `skim-city-text.png`: the black background flood-filled to
transparency from the edges (the artwork's maroon outer stroke fences in the
black outlines inside the letterforms), trimmed to the mark, and resized to
560px wide — 1.03MB down to 116KB, which matters because the logo is loaded
eagerly on every page.

Regenerate it if the artwork changes; `web/vite.config.ts` fails the build if it
goes missing.
