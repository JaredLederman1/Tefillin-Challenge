const COMMUNITY_CITIES = [
  'Atlanta, GA','Austin, TX','Baltimore, MD','Berkeley, CA','Boston, MA','Chicago, IL','Cleveland, OH','Columbus, OH','Dallas, TX','Denver, CO','Detroit, MI','Houston, TX','Ithaca, NY','Los Angeles, CA','Miami, FL','Minneapolis, MN','New York, NY','Philadelphia, PA','Pittsburgh, PA','Providence, RI','San Diego, CA','San Francisco, CA','Seattle, WA','St. Louis, MO','Washington, DC'
];

export function searchCommunityCities(query:string) {
  const terms=query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if(!terms.length)return [];
  return COMMUNITY_CITIES.filter(city=>terms.every(term=>city.toLowerCase().includes(term))).slice(0,6);
}
