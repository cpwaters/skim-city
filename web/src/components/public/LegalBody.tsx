import type { ReactNode } from 'react';

/**
 * Shared shell for the legal pages. Tailwind's typography plugin isn't
 * installed, so the prose styling is declared here once rather than repeated
 * across every heading and paragraph.
 */
export function LegalBody({ updated, children }: { updated: string; children: ReactNode }) {
  return (
    <section className="mx-auto max-w-3xl px-5 py-16 sm:py-20">
      <p className="text-xs font-display uppercase tracking-[0.16em] text-smoke-dim mb-10">
        Last updated {updated}
      </p>

      <div
        className="
          text-smoke leading-relaxed
          [&_h2]:display [&_h2]:text-bone [&_h2]:text-lg [&_h2]:mt-10 [&_h2]:mb-3
          [&_p]:mb-4
          [&_ul]:mb-4 [&_ul]:space-y-2 [&_ul]:pl-5 [&_li]:list-disc [&_li]:marker:text-city-700
          [&_a]:text-city-500 [&_a]:underline [&_a]:underline-offset-4 hover:[&_a]:text-city-600
          [&_strong]:text-bone
        "
      >
        {children}
      </div>
    </section>
  );
}
