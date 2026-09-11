/**
 * Public-facing business facts used across the marketing site.
 *
 * These are display values only. Anything that drives behaviour — rates,
 * deposit percentage, working days — lives in Firestore `settings/business` so
 * Chris can change it from the CRM without a redeploy.
 */
export const BUSINESS = {
  name: 'Skim City',
  tagline: 'Taking the rough to the smooth',
  phone: '07464848570',
  email: 'chris@skimcity.co.uk',
  city: 'Manchester',
  whatsappGreeting: "Hi Chris, I'm after a plastering quote —",
  coverageAreas: [
    'Manchester',
    'Salford',
    'Stockport',
    'Oldham',
    'Rochdale',
    'Bury',
    'Bolton',
    'Trafford',
    'Tameside',
    'Wigan',
  ],
} as const;
