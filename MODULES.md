# Module Reference

## config.js

Configuration constants and debug helpers.

**`cfg(key)`** — Returns a config value by name.

**`dbg(msg)`** — Logs if the message's category (prefix before `.`) is enabled in `debugMap`.

### Config Values

| Key | Value | Description |
|-----|-------|-------------|
| `HEARTBEAT_INTERVAL_MS` | 5000 | Timer tick rate |
| `POI_INTERVAL_MS` | 60000 | Min time between automatic POI changes |
| `MAP_ZOOM_DEFAULT` | 13 | Default map zoom (no POI) |
| `MAP_ZOOM_MIN` | 7 | Minimum zoom level |
| `MAP_ZOOM_MAX` | 15 | Maximum zoom level |
| `POI_FETCH_RADIUS_MILES` | 80 | Max search radius |
| `POI_FETCH_TRIGGER_MILES` | 10 | Re-fetch when moved this far |
| `POI_PREDICT_MIN_SPEED_MPH` | 20 | Speed threshold for predicted-position search |
| `POI_MIN_DESIRED_COUNT` | 20 | Target POI count before stopping progressive search |
| `POI_PROGRESSIVE_RADII` | [10, 20, 40, 80] | Radii tried in order during progressive fetch |
| `POI_DIVERSITY_LOOKAHEAD` | 7 | Candidates scanned to find a different type than last shown |
| `CLAUDE_API_VERSION` | `'2023-06-01'` | Anthropic API version header |
| `CLAUDE_MODEL` | `'claude-sonnet-4-6'` | Model used for enriched descriptions |
| `CLAUDE_MAX_TOKENS` | 1024 | Max tokens in Claude response |
| `CLAUDE_ROLE` | `'user'` | Message role for Claude API |
| `MOCK_GEOLOCATION` | object or null | Set to simulate travel; null uses real GPS |

### Debug Categories

`orch`, `pos`, `poi`, `poideets`, `diversity`, `zoom`, `wiki`, `claude`. Set `NONE: true` to silence all.

---

## geo.js

Pure geographic utility functions, no side effects.

- **`calculateDistanceMiles(p1, p2)`** — Haversine distance between `{lat, lng}` points
- **`calculateBearingDegrees(p1, p2)`** — Bearing from p1 to p2 (0–360°)
- **`angleDifferenceDegrees(a1, a2)`** — Smallest difference between two angles (0–180°)
- **`calculateDestinationPoint(lat, lng, bearingDegrees, distanceMiles)`** — Destination given start, bearing, and distance

---

## wikidata.js

WikiData SPARQL API integration.

**`fetchPoints(lat, lng, radiusMiles)`** — Fetches POIs near a location. Returns array of POI objects.

### POI Object Shape

```js
{
  id,           // WikiData entity ID (e.g. "Q12345")
  title,        // Human-readable name
  description,  // Short WikiData description
  type,         // WikiData Q-number of the instance type (e.g. "Q23413")
  location: { lat, lng },
  image,        // HTTPS image URL or null
  url,          // Full WikiData entity URL
  adminDiv1,    // Immediate administrative parent label (city/county/state) or null
}
```

Note: `type` is a raw WikiData Q-number, not a human-readable string.

### SPARQL Query Details

- Filters for interesting types using `VALUES ?interestingType { ... }` with one level of subclass matching (`wdt:P279?`)
- Broad categories: tourist attractions, museums, national parks, archaeological sites, landforms, bodies of water, architectural structures, facilities
- Specific types: castles, lighthouses, monuments, bridges, towers, churches, buildings, statues, synagogues, temples, cathedrals, viewpoints, parks, waterfalls, mountains, lakes, rivers, caves, beaches, gardens
- Returns up to 50 results ordered by distance
- 90-second query timeout via `AbortController`
- Converts HTTP image URLs to HTTPS

---

## claude.js

Claude API integration for enriched POI descriptions.

**`askClaude(poi)`** — Posts to Anthropic API and returns `{ response: string }` or `{ error: string|number }`.

**`getClaudeToken()`** / **`storeClaudeToken(token)`** / **`clearClaudeToken()`** — Manage API key in `localStorage`.

### Prompt

Each call randomly selects one of several "angles" from `PROMPT_ANGLES` to vary the narrative style:
- Sensory/physical experience
- Surprising historical fact
- Human stories and real people
- Geological/geographical/ecological explanation
- Connection to everyday modern life
- What makes this specific instance unusual

The prompt instructs Claude to act as a friendly local resident, be concise, avoid exclamation points and trite phrases, and produce text suitable for text-to-speech. Location-relative phrasing ("in front of you", "to the east") is explicitly prohibited.

---

## mockGeolocation.js

Simulates GPS travel along a straight-line route for testing.

**`createMockGeolocation(config)`** — Returns an object implementing the HTML5 Geolocation API (`watchPosition`, `clearWatch`).

Config object:
```js
{
  start: { lat, lng },  // Starting coordinates
  end: { lat, lng },    // Ending coordinates
  speedMph: 65,         // Simulated travel speed
  intervalMs: 7500      // Milliseconds between position updates
}
```

Emits realistic position data including heading and speed (m/s). Stops when destination is reached. Enabled by setting `MOCK_GEOLOCATION` in `config.js` (set to `null` to use real GPS).

---

## Orchestrator.js

Core singleton managing location tracking and the POI queue.

**Constructor:** `new Orchestrator(onPositionUpdate, onPoiUpdate, currentlySpeaking)`

| Argument | Type | Description |
|----------|------|-------------|
| `onPositionUpdate` | `(pos) => void` | Called when location changes |
| `onPoiUpdate` | `(poi) => void` | Called when a new POI is ready |
| `currentlySpeaking` | `() => bool` | Returns true if TTS is active |

### Public Methods

- **`popNextPOI()`** — Advance to next POI. Re-scores and re-sorts queue first. Returns `false` if queue is empty.
- **`getCurrentPosition()`** — Current `{lat, lng, timestamp}` or null.
- **`getCurrentBearing()`** — Degrees (0–360) based on last two positions, or null.
- **`startTimers()`** / **`clearTimers()`** — Start/stop geolocation watch and heartbeat interval. Called on visibility change.

### POI Selection Logic (popNextPOI)

1. Triggers a background fetch if queue has fewer than 3 items
2. Re-scores and re-sorts the entire queue
3. Filters to "ahead" POIs (angleDiff ≤ 90°); falls back to full queue if none qualify
4. **Diversity lookahead**: scans the top `POI_DIVERSITY_LOOKAHEAD` (7) candidates and picks the first whose `type` differs from the last shown type; falls back to the best-scored candidate
5. If the chosen POI is behind the vehicle, triggers an immediate re-fetch
6. Records the POI in history and fires `onPoiUpdate`

### Scoring Algorithm

`score = distance × directionWeight`

where `directionWeight = 1 + (angleDiff / 60)²`

| Angle offset | Weight | Effect |
|---|---|---|
| 0° (ahead) | 1.0 | No penalty |
| 60° | 2.0 | 2× |
| 90° (side) | 3.25 | 3.25× |
| 135° | 6.25 | 6.25× |
| 180° (behind) | 10.0 | 10× |

Lower score = better. Queue sorted with lowest scores at the end so `pop()` gets the best POI. `poi.behind = true` when `angleDiff > 90`.

### Progressive Radius Fetch

Searches at increasing radii (10 → 20 → 40 → 80 miles) until `POI_MIN_DESIRED_COUNT` (20) unseen POIs are found. Filters out history. If all POIs have been shown, falls back to the full unfiltered set. On timeout at a non-smallest radius, tries the next larger radius.

### Predicted Position Search

When speed ≥ `POI_PREDICT_MIN_SPEED_MPH` (20 mph), searches ahead of current position by `POI_FETCH_TRIGGER_MILES / 2` (5 miles) in the direction of travel.
