// Search query templates by vertical. Each template is a function (city) => query.
// Queries are tuned for Exa neural search: descriptive sentences work better
// than keyword soup.

export const VERTICALS = {
  nightlife: {
    label: 'Nightlife',
    queries: [
      (city) => `independent nightlife promoter in ${city} hosting upcoming ticketed events this season`,
      (city) => `${city} nightclub event series with tickets currently on sale`,
      (city) => `underground party promoter ${city} upcoming events lineup`,
    ],
  },
  edm_house_festival: {
    label: 'EDM / House / Festival',
    queries: [
      (city) => `independent EDM and house music promoter ${city} upcoming events tickets`,
      (city) => `warehouse rave or house music event series in ${city} upcoming dates`,
      (city) => `${city} festival production company hosting electronic music event this year`,
    ],
  },
  concerts: {
    label: 'Concerts',
    queries: [
      (city) => `independent concert promoter in ${city} presenting upcoming live music shows`,
      (city) => `small to mid-size concert promoter ${city} upcoming tour dates tickets`,
    ],
  },
  college_market: {
    label: 'College Market (18–25)',
    queries: [
      (city) => `college party promoter ${city} hosting upcoming 18+ events with tickets`,
      (city) => `${city} student-focused event brand 18-25 audience upcoming nightlife`,
      (city) => `Greek life or campus-adjacent event promoter ${city} upcoming ticketed events`,
    ],
  },
  experiential: {
    label: 'Experiential',
    queries: [
      (city) => `experiential event producer ${city} hosting upcoming immersive ticketed experience`,
      (city) => `${city} immersive popup event company upcoming dates tickets on sale`,
    ],
  },
  popup_lifestyle: {
    label: 'Pop-up / Lifestyle',
    queries: [
      (city) => `${city} lifestyle pop-up event series upcoming dates ticketed`,
      (city) => `independent day party or brunch event brand ${city} upcoming tickets`,
    ],
  },
  sports_entertainment: {
    label: 'Sports Entertainment',
    queries: [
      (city) => `independent combat sports or fight night promoter ${city} upcoming ticketed event`,
      (city) => `local pickleball or recreational sports event brand ${city} upcoming ticketed event`,
    ],
  },
};

export const CITIES = [
  'New York', 'Brooklyn', 'Los Angeles', 'Miami', 'Chicago', 'Las Vegas',
  'Austin', 'Nashville', 'Houston', 'Dallas', 'Atlanta', 'San Francisco',
  'San Diego', 'Seattle', 'Denver', 'Boston', 'Washington DC', 'Philadelphia',
  'Phoenix', 'Portland', 'Detroit', 'Minneapolis', 'New Orleans', 'Charlotte',
  'Tampa', 'Orlando', 'Oakland', 'Salt Lake City', 'Kansas City', 'St. Louis',
  // College-market additions (state suffix kept for disambiguation):
  'Columbus, OH', 'Gainesville, FL', 'State College, PA', 'Baton Rouge, LA',
  'Syracuse, NY', 'College Park, MD', 'New Brunswick, NJ', 'Iowa City, IA',
  'Lawrence, KS', 'Lincoln, NE', 'Raleigh, NC', 'Storrs, CT',
  'Tuscaloosa, AL', 'Columbia, SC', 'Madison, WI', 'Lansing, MI',
  'Ann Arbor, MI',
];

export function buildQueries({ cities = CITIES, verticals = Object.keys(VERTICALS) } = {}) {
  const out = [];
  for (const v of verticals) {
    const vert = VERTICALS[v];
    if (!vert) continue;
    for (const city of cities) {
      for (const tmpl of vert.queries) {
        out.push({ vertical: v, city, query: tmpl(city) });
      }
    }
  }
  return out;
}
