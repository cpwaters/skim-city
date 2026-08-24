/**
 * The service list drives the marketing pages and the booking form's job-type
 * copy. Prices are deliberately described as "from" guidance — every real
 * price comes from a written quote in the CRM.
 */
export interface Service {
  slug: string;
  title: string;
  summary: string;
  detail: string;
  typical: string;
  slotType: 'full_day' | 'repair' | 'either';
}

export const SERVICES: Service[] = [
  {
    slug: 'skimming',
    title: 'Skimming & re-skimming',
    summary: 'Tired, cracked or artexed walls and ceilings brought back to a flat, paintable finish.',
    detail:
      'A fresh coat of finish plaster over sound existing walls or ceilings. The usual fix for old, patched or textured surfaces that have had enough. We fill, prep and skim, then leave it flat and ready for decorating once it has dried out.',
    typical: 'Most rooms are a full day',
    slotType: 'full_day',
  },
  {
    slug: 'replaster',
    title: 'Full room replaster',
    summary: 'Old plaster off, fresh back on — for damp, blown or crumbling walls that need starting again.',
    detail:
      'Where the existing plaster has blown or is beyond skimming, we strip it back, treat what needs treating, then re-board or backing-coat and finish. The right call for damp repairs and older properties.',
    typical: 'One to three full days',
    slotType: 'full_day',
  },
  {
    slug: 'repairs',
    title: 'Patch & crack repairs',
    summary: 'Cracks, holes, dodgy corners and the mess left behind after a radiator or socket has moved.',
    detail:
      'Small work done properly. Filling and making good after electrics or plumbing, re-beading damaged corners, sorting settlement cracks and patching where a fixture has come off the wall.',
    typical: 'Half-day repair slot',
    slotType: 'repair',
  },
  {
    slug: 'boarding-rendering',
    title: 'Boarding & rendering',
    summary: 'Plasterboarding, dot-and-dab, and sand-and-cement or render finishes inside and out.',
    detail:
      'New stud walls and ceilings boarded and finished, dot-and-dab onto masonry, and rendering where a harder wearing surface is wanted. Also covers making good after a stud wall comes down.',
    typical: 'Depends on the job — ask',
    slotType: 'either',
  },
];
