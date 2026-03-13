//
// CONFIG.JS
//

// +--------+
// | Config |
// +--------+

const configMap = {

  HEARTBEAT_INTERVAL_MS: 5 * 1000, // 5 seconds
  POI_INTERVAL_MS: 1 * 60 * 1000, // 2 minutes

  MAP_ZOOM_DEFAULT: 13,
  MAP_ZOOM_MIN: 7,
  MAP_ZOOM_MAX: 15,

  POI_FETCH_RADIUS_MILES: 80,
  POI_FETCH_TRIGGER_MILES: 10,

  CLAUDE_API_VERSION: '2023-06-01',
  CLAUDE_MODEL: 'claude-sonnet-4-6',
  CLAUDE_MAX_TOKENS: 1024,
  CLAUDE_ROLE: 'user'
}

export function cfg(name) {
  return(configMap[name]);
}

// +-------+
// | Debug |
// +-------+

const debugMap = {

  NONE: false, // true to mute all without changing individually

  orch: false, // orchestrator lifecycle events
  pos: false, // related to position
  poi: false, // related to points of interest
  poideets: false, // verbose poi details
  zoom: false,
  
  wiki: false, // wikidata queries
  claude: false // claude queries
}

export function dbg(msg) {

  if (debugMap.NONE) return;
  
  const ichDot = msg.indexOf('.');
  
  if (ichDot === -1) {
	console.warn("debug message missing dot class");
	console.log(msg);
	return;
  }

  if (debugMap[msg.substring(0, ichDot)]) console.log(msg);
}

