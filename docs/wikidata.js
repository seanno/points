//
// WIKIDATA.JS
//

import { dbg } from './config.js';

// WikiData API wrapper

// +------------+
// | Constants  |
// +------------+

const WIKIDATA_QUERY_ENDPOINT = 'https://query.wikidata.org/sparql'
const QUERY_TIMEOUT_MS = 90000 // 90 seconds

// +-----------+
// | Utilities |
// +-----------+

/**
 * Build SPARQL query for POIs within a radius
 * Optimized for speed - simpler query with fewer filters
 * @param {number} lat - Latitude
 * @param {number} lng - Longitude
 * @param {number} radiusMiles - Search radius in miles
 * @returns {string} SPARQL query
 */

function buildPOIQuery(lat, lng, radiusMiles) {
  // Convert miles to kilometers (WikiData uses km)
  const radiusKm = radiusMiles * 1.60934

  return `
    SELECT ?item ?itemLabel ?itemDescription ?location
           (MIN(?dist) AS ?minDist)
           (SAMPLE(?image) AS ?image)
           (SAMPLE(?interestingTypeLabel) AS ?interestingTypeLabel)
           (SAMPLE(?adminDiv1Label) AS ?adminDiv1Label)
           (SAMPLE(?adminDiv2Label) AS ?adminDiv2Label)
           (SAMPLE(?adminDiv3Label) AS ?adminDiv3Label)
           (SAMPLE(?adminDiv4Label) AS ?adminDiv4Label)
    WHERE {

      # Search for items with coordinates within radius
      SERVICE wikibase:around {
        ?item wdt:P625 ?location.
        bd:serviceParam wikibase:center "Point(${lng} ${lat})"^^geo:wktLiteral.
        bd:serviceParam wikibase:radius "${radiusKm}".
        bd:serviceParam wikibase:distance ?dist.
      }

      # Filter for interesting types of POIs (using broader categories + hierarchy)
      VALUES ?interestingType {
        wd:Q570116    # tourist attraction (catches castles, lighthouses, monuments, etc.)
        wd:Q33506     # museum
        wd:Q863454    # national park
        wd:Q839954    # archaeological site
        wd:Q271669    # landform (mountains, valleys, hills, canyons, etc.)
        wd:Q15324     # body of water (lakes, rivers, waterfalls, springs, etc.)
        wd:Q811979    # architectural structure (bridges, towers, lighthouses, monuments)
        wd:Q1785071   # facility (mines, dams, industrial sites, etc.)
      }

      # Item must be instance of something that is a subclass of interesting type
      ?item wdt:P31/wdt:P279* ?interestingType.

      # Get optional image
      OPTIONAL { ?item wdt:P18 ?image. }

      # Get administrative divisions - skip div1, get div2, div3, and div4
      OPTIONAL {
        ?item wdt:P131 ?adminDiv1.
        OPTIONAL {
          ?adminDiv1 wdt:P131 ?adminDiv2.
          OPTIONAL {
            ?adminDiv2 wdt:P131 ?adminDiv3.
            OPTIONAL {
              ?adminDiv3 wdt:P131 ?adminDiv4.
            }
          }
        }
      }

      # Get labels and descriptions
      SERVICE wikibase:label {
        bd:serviceParam wikibase:language "en".
      }
    }
    GROUP BY ?item ?itemLabel ?itemDescription ?location
    ORDER BY ASC(?minDist)
    LIMIT 50
  `
}

/**
 * Parse WikiData SPARQL results
 * @param {Object} data - Raw SPARQL results
 * @returns {Array} Array of POI objects
 */
function parseResults(data) {
  if (!data.results || !data.results.bindings) {
    return []
  }

  return data.results.bindings.map(binding => {
    // Parse location string "Point(lng lat)"
    const locationMatch = binding.location.value.match(/Point\(([-\d.]+) ([-\d.]+)\)/)
    const lng = locationMatch ? parseFloat(locationMatch[1]) : null
    const lat = locationMatch ? parseFloat(locationMatch[2]) : null

	let img = binding.image?.value || null;
	if (img && img.startsWith('http://')) img = 'https://' + img.substring(7);
	
    return {
      id: binding.item.value.split('/').pop(),
      title: binding.itemLabel?.value || 'Unknown',
      description: binding.itemDescription?.value || '',
      type: binding.interestingTypeLabel?.value || 'Point of Interest',
      location: { lat, lng },
      image: img,
      url: binding.item.value,
      adminDiv1: binding.adminDiv1Label?.value || null,
      adminDiv2: binding.adminDiv2Label?.value || null,
      adminDiv3: binding.adminDiv3Label?.value || null,
      adminDiv4: binding.adminDiv4Label?.value || null,
    }
  }).filter(poi => poi.location.lat !== null && poi.location.lng !== null)
}

// +------------+
// | Public API |
// +------------+

/**
 * Fetch POIs from WikiData within a radius
 * @param {number} lat - Latitude
 * @param {number} lng - Longitude
 * @param {number} radiusMiles - Search radius in miles
 * @returns {Promise<Array>} Array of POI objects
 */
export async function fetchPoints(lat, lng, radiusMiles) {
  const query = buildPOIQuery(lat, lng, radiusMiles)

  try {
    const url = new URL(WIKIDATA_QUERY_ENDPOINT)
    url.searchParams.append('query', query)
    url.searchParams.append('format', 'json')

    // Create AbortController for timeout
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), QUERY_TIMEOUT_MS)

    try {
	  dbg('wiki.start');
      const response = await fetch(url, {
        headers: {
          'Accept': 'application/sparql-results+json',
          'User-Agent': 'CTX-App/1.0'
        },
        signal: controller.signal
      })

      clearTimeout(timeoutId)
	  dbg(`wiki.end ok=${response.ok}`);

      if (!response.ok) {
        throw new Error(`WikiData query failed: ${response.status} ${response.statusText}`)
      }

      const data = await response.json()
	  const results = parseResults(data);

	  dbg(`wiki.${results.length} pois retunred`);
	  return(results);
	  
    } catch (error) {
      clearTimeout(timeoutId)

      if (error.name === 'AbortError') {
        throw new Error(`WikiData query timed out after ${QUERY_TIMEOUT_MS / 1000} seconds`)
      }
      throw error
    }
  } catch (error) {
    console.error('Error fetching POIs from WikiData:', error)
    throw error
  }
}
