/**
 * Placeholder tiles for the public gallery.
 *
 * Real photos live in Firestore `galleryItems`, uploaded through the CRM at
 * /app/gallery. These are the fallback shown only while nothing has been
 * published yet, so a brand-new site has a presentable Work page instead of an
 * empty one.
 */
export interface PlaceholderTile {
  id: string;
  title: string;
  location: string;
}

export const PLACEHOLDER_GALLERY: PlaceholderTile[] = [
  { id: 'p1', title: 'Ceiling re-skim', location: 'Chorlton, Manchester' },
  { id: 'p2', title: 'Full room replaster', location: 'Salford' },
  { id: 'p3', title: 'Artex removal & skim', location: 'Stockport' },
  { id: 'p4', title: 'Chimney breast patch', location: 'Prestwich, Bury' },
  { id: 'p5', title: 'Dot & dab boarding', location: 'Oldham' },
  { id: 'p6', title: 'Hallway & stairs', location: 'Didsbury, Manchester' },
];
