//
// WIKIDATA.JS
//

import { cfg,dbg } from './config.js';

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
    WHERE {

      # Search for items with coordinates within radius
      SERVICE wikibase:around {
        ?item wdt:P625 ?location.
        bd:serviceParam wikibase:center "Point(${lng} ${lat})"^^geo:wktLiteral.
        bd:serviceParam wikibase:radius "${radiusKm}".
        bd:serviceParam wikibase:distance ?dist.
      }

      # Filter for interesting types of POIs (broader categories + common specific types)
      VALUES ?interestingType {
        # Broad categories
        wd:Q570116    # tourist attraction
        wd:Q33506     # museum
        wd:Q863454    # national park
        wd:Q839954    # archaeological site
        wd:Q271669    # landform
        wd:Q15324     # body of water
        wd:Q811979    # architectural structure
        wd:Q1785071   # facility

        # Common specific types to catch with 1-hop
        wd:Q23413     # castle
        wd:Q39715     # lighthouse
        wd:Q4989906   # monument
        wd:Q12280     # bridge
        wd:Q12518     # tower
        wd:Q16970     # church
        wd:Q41176     # building (catches many historic buildings)
        wd:Q179700    # statue
        wd:Q34627     # synagogue
        wd:Q44539     # temple/shrine
        wd:Q2977      # cathedral
        wd:Q1307276   # viewpoint
        wd:Q22698     # park
        wd:Q34038     # waterfall
        wd:Q8502      # mountain
        wd:Q23397     # lake
        wd:Q4022      # river
        wd:Q35509     # cave
        wd:Q40080     # beach
        wd:Q1107656   # garden
      }

      # Item must be instance of type, and type can be 0-1 subclass away from interesting type
      ?item wdt:P31 ?type.
      ?type wdt:P279? ?interestingType.

      # Get optional image
      OPTIONAL { ?item wdt:P18 ?image. }

      # Get immediate administrative parent (city/county/state)
      OPTIONAL { ?item wdt:P131 ?adminDiv1. }

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
    }
  }).filter(poi => poi.location.lat !== null && poi.location.lng !== null)
}

// +------------+
// | Public API |
// +------------+

/**
 * Fetch POIs from WikiData with a specific radius
 * @param {number} lat - Latitude
 * @param {number} lng - Longitude
 * @param {number} radiusMiles - Search radius in miles
 * @returns {Promise<Array>} Array of POI objects
 */
async function fetchPointsAtRadius(lat, lng, radiusMiles) {
  const query = buildPOIQuery(lat, lng, radiusMiles)

  try {
    const url = new URL(WIKIDATA_QUERY_ENDPOINT)
    url.searchParams.append('query', query)
    url.searchParams.append('format', 'json')

    // Create AbortController for timeout
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), QUERY_TIMEOUT_MS)

    try {
	  dbg(`wiki.start radius=${radiusMiles}mi`);
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

	  dbg(`wiki.${results.length} pois returned`);
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

/**
 * Fetch POIs from WikiData within a radius
 * @param {number} lat - Latitude
 * @param {number} lng - Longitude
 * @param {number} radiusMiles - Search radius in miles
 * @returns {Promise<Array>} Array of POI objects
 */
export async function fetchPoints(lat, lng, radiusMiles) {
  return await fetchPointsAtRadius(lat, lng, radiusMiles);
}
