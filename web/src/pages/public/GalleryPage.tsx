import { useEffect, useState } from 'react';
import { PageHeader } from '../../components/public/PageHeader';
import { BeforeAfter } from '../../components/public/BeforeAfter';
import { ButtonLink } from '../../components/ui/Button';
import { Spinner } from '../../components/ui/States';
import { getGallery, type PublicGalleryItem } from '../../lib/callables';
import { PLACEHOLDER_GALLERY } from '../../lib/gallery';

/**
 * Public gallery.
 *
 * Photos come from a callable rather than a direct Firestore read so the
 * marketing bundle never loads the Firestore SDK. Until Chris publishes his
 * first photo — or if the call fails — the page falls back to branded
 * placeholder tiles rather than showing an empty grid or an error.
 */
export function GalleryPage() {
  const [items, setItems] = useState<PublicGalleryItem[] | null>(null);

  useEffect(() => {
    let cancelled = false;

    getGallery({})
      .then((result) => {
        if (!cancelled) setItems(result.items);
      })
      .catch(() => {
        // A gallery that won't load is not worth an error message on a
        // marketing page — fall through to the placeholders.
        if (!cancelled) setItems([]);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const hasPhotos = items !== null && items.length > 0;

  return (
    <>
      <PageHeader
        eyebrow="Recent work"
        title="The work"
        intro="Jobs from around Manchester. Every one of these started as a wall someone had stopped looking at."
      />

      <section className="mx-auto max-w-6xl px-5 py-16 sm:py-20">
        {items === null ? (
          <Spinner label="Loading the work" />
        ) : hasPhotos ? (
          <>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {items.map((item) => (
                <figure
                  key={item.id}
                  className="group bg-noir-800 border border-noir-700 rounded-[3px] overflow-hidden"
                >
                  <div className="aspect-4/3 relative overflow-hidden bg-noir-850">
                    {item.beforeUrl ? (
                      <BeforeAfter
                        beforeUrl={item.beforeUrl}
                        afterUrl={item.afterUrl}
                        alt={item.alt || item.title}
                      />
                    ) : (
                      <img
                        src={item.afterUrl}
                        alt={item.alt || item.title}
                        width={item.width}
                        height={item.height}
                        loading="lazy"
                        className="size-full object-cover transition-transform duration-500 group-hover:scale-105"
                      />
                    )}
                  </div>
                  <figcaption className="p-4">
                    <h2 className="display text-sm text-bone mb-1">{item.title}</h2>
                    {item.location && <p className="text-xs text-smoke">{item.location}</p>}
                  </figcaption>
                </figure>
              ))}
            </div>

            {items.some((item) => item.beforeUrl) && (
              <p className="mt-6 text-xs text-smoke-dim text-center">
                Drag the slider on a before/after photo to see the difference.
              </p>
            )}
          </>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {PLACEHOLDER_GALLERY.map((tile) => (
              <figure key={tile.id} className="bg-noir-800 border border-noir-700 rounded-[3px] overflow-hidden">
                <div className="aspect-4/3 grid place-items-center hatch spotlight" aria-hidden="true">
                  <div className="text-center px-4">
                    <div className="mx-auto mb-3 h-px w-10 bg-city-700" />
                    <span className="display text-xs tracking-[0.2em] text-noir-600">{tile.title}</span>
                  </div>
                </div>
                <figcaption className="p-4">
                  <h2 className="display text-sm text-bone mb-1">{tile.title}</h2>
                  <p className="text-xs text-smoke">{tile.location}</p>
                </figcaption>
              </figure>
            ))}
          </div>
        )}

        <div className="mt-14 text-center border-t border-noir-700 pt-12">
          <h2 className="display text-2xl text-bone mb-3">Want yours on here?</h2>
          <p className="text-smoke mb-7 max-w-md mx-auto">
            Book a slot and we'll get your walls looking like they should.
          </p>
          <ButtonLink to="/book" size="lg">
            Book a slot
          </ButtonLink>
        </div>
      </section>
    </>
  );
}
