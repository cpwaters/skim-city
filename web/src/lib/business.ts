/**
 * Fallback business facts for the marketing site.
 *
 * The live values come from `settings/business` via the getBusinessInfo
 * callable — see useBusiness. These are what render before that call returns,
 * and what the site falls back to if it fails: a visitor must never be shown a
 * blank phone number because a request was slow.
 *
 * Keep them in step with the settings document. Anything that drives behaviour
 * — rates, deposit percentage, working days — is never here.
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
