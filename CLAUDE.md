# Overview

This is a simplified rebuild of the CTX road trip app using plain HTML, CSS, and JavaScript with jQuery. The app is intended to run on a mobile device during a road trip, showing two panes side-by-side (landscape) or stacked (portrait):

1. **Map Pane** - Shows current location and nearby point of interest
2. **POI Pane** - Displays information about the selected point of interest

The app provides contextual information during drives - highlighting interesting nearby places like historical sites, parks, wildlife areas, etc.

## Why Not React?

The singleton Orchestrator instance that watches location and manages the POI queue created unnecessary complexity with React's state management, closures, and re-render cycles. This simpler approach uses plain DOM manipulation with callbacks.

# HTML Element Reference

## Map Pane Elements

- `#map-pane` - Container for entire map pane
- `#map-container` - Target div for Leaflet map initialization
- `#map-loading` - Loading message shown before location acquired (hide when ready)
- `#recenter-button` - Button to exit manual mode and return to auto-follow
- `#next-button` - Button to manually advance to next POI

## POI Pane Elements

- `#poi-pane` - Container for entire POI pane
- `#poi-content` - Scrollable content area
- `#poi-loading` - Loading message shown before first POI (hide when ready)
- `#poi-title` - Element for POI title
- `#poi-type` - POI type/category (e.g., "museum", "castle", "national park")
- `#poi-image` - Container div for image
- `#poi-image-img` - Actual `<img>` tag (set src attribute)
- `#poi-description` - Element containing description text (prepended with type in parentheses)
- `.poi-ux` - Class for elements to show/hide together when POI loads
- `#poi-controls` - Container for button controls
- `#more-button` - Fetches enriched description from Claude API and reads it aloud
- `#next-button` - Button to manually advance to next POI
- `#share-button` - Share button using Web Share API

## Showing/Hiding POI Elements

Initially, most POI elements are hidden. Elements with class `.poi-ux` are shown together when a POI loads:

1. Hide `#poi-loading`
2. Show all `.poi-ux` elements
3. Populate content elements
4. Hide `#poi-image` if no image is available

# JavaScript Modules

## site/config.js
Contains configuration constants and debug helper. Use `cfg('KEY')` to access config values and `dbg(msg)` for debug logging.

Includes Claude API configuration:
- `CLAUDE_API_VERSION` - API version string
- `CLAUDE_MODEL` - Model identifier (claude-sonnet-4-6)
- `CLAUDE_MAX_TOKENS` - Maximum tokens for Claude responses
- `CLAUDE_ROLE` - Role for Claude messages

## site/geo.js
Geographic utility functions:
- `calculateDistanceMiles(lat1, lng1, lat2, lng2)` - Distance between two points
- `calculateBearingDegrees(lat1, lng1, lat2, lng2)` - Bearing from point 1 to point 2
- `angleDifferenceDegrees(angle1, angle2)` - Difference between two angles

## site/wikidata.js
WikiData API integration:
- `fetchPoints(lat, lng, radiusMiles)` - Fetches POIs near a location
- Returns array of POI objects with structure: `{ id, title, description, type, location: {lat, lng}, image, url }`
- SPARQL query filters for interesting types (museums, castles, national parks, etc.)
- Uses WikiData label service to translate type IDs to human-readable strings (e.g., "museum", "castle")
- Converts HTTP image URLs to HTTPS for security

## site/claude.js
Claude API integration for enriched POI descriptions:
- `askClaude(title, city, state)` - Fetches enriched description from Claude API
- `getClaudeToken()` / `storeClaudeToken(token)` / `clearClaudeToken()` - Manage API token in localStorage
- Returns promise with `{ response: string }` or `{ error: string }`
- Constructs prompt asking Claude to act as a friendly travel guide
- NOTE: city and state parameters are accepted but not yet populated from POI data

## site/Orchestrator.js
Core singleton that manages:
- Geolocation watching via HTML5 Geolocation API
- POI queue management (fetching, sorting, caching, deduplication)
- Position and bearing tracking
- Callbacks for position and POI updates

Constructor:
- `new Orchestrator(onPositionUpdate, onPoiUpdate)` - Takes two callbacks

Key public methods:
- `popNextPOI()` - Manually advance to next POI
- `startTimers()` / `clearTimers()` - Manage internal timers (called on visibility change)

The Orchestrator handles:
- Calling `onPositionUpdate(pos)` when location changes
- Calling `onPoiUpdate(poi)` when new POI is available
- Fetching POIs when queue runs low or position changes significantly
- Filtering POIs by distance and bearing (prefers points ahead of vehicle)
- Maintaining history to avoid repeating POIs

## site/index.js
Main application logic (previously described as "app.js" in earlier docs):
- Initializes Orchestrator with callbacks
- Manages manual mode (click map to explore, recenter button to resume)
- Updates map (Leaflet) with position and POI markers
- Updates POI pane with content
- Handles share functionality via Web Share API
- Implements smart zoom calculation to keep both position and POI visible
- Implements "More" button functionality:
  - Prompts for Claude API token on first use (stored in localStorage)
  - Fetches enriched description from Claude API
  - Displays enriched content in POI pane
  - Automatically reads description aloud using Web Speech API
- Implements text-to-speech using `window.speechSynthesis`
- Manages speaking state (click "More" while speaking to cancel)

# Architecture Notes

## Current Implementation Flow

1. **Initialization** (site/index.js `load` event)
   - Create single Orchestrator instance with `newPos` and `newPoi` callbacks
   - Set up button click handlers (#more-button, #next-button, #share-button, #recenter-button)
   - Set up visibility change handler to pause/resume Orchestrator timers

2. **Position Updates** (via `newPos` callback)
   - Orchestrator calls `newPos(position)` when location changes
   - If not in manual mode: call `adjustMap()` to update map view and markers

3. **POI Updates** (via `newPoi` callback)
   - Orchestrator calls `newPoi(poi)` when new POI is available
   - If not in manual mode: call `adjustMap()` and `updatePoiPane()`
   - Updates map with POI marker and recalculates zoom
   - Populates POI pane with title, type, description, and optional image

4. **Manual Mode**
   - User clicks/taps map → `manualModeOn()` → show recenter button, disable next button, pause updates
   - User can freely pan/zoom map without automatic updates
   - User clicks recenter button → `manualModeOff()` → hide recenter button, enable next button, resume updates

5. **Map Rendering** (`adjustMap()`)
   - Always centers on current position
   - Calculates zoom level to ensure POI marker is visible
   - Zoom calculation considers both horizontal and vertical displacement
   - Uses intelligent padding to keep POI on screen regardless of direction

6. **Share Functionality**
   - Uses Web Share API (`navigator.share()`)
   - Shares POI title, description, and Google search URL

7. **More Button / Claude Integration** (`explainPoi()`)
   - Clicking "More" while speaking cancels speech
   - Prompts for Claude API token on first use
   - Shift-click to clear saved token
   - Fetches enriched description from Claude API
   - Updates button states: "More" → "Asking..." → "Speaking..."
   - Displays enriched description in `#poi-description`
   - Automatically speaks description using `speechSynthesis.speak()`
   - Button returns to "More" when speech completes

8. **Text-to-Speech** (`startSpeaking()` / `cancelSpeaking()`)
   - Uses Web Speech API (`window.speechSynthesis`)
   - Reads content from `#poi-description`
   - Tracks speaking state
   - Clicking "More" while speaking cancels speech
   - Updates button to "Speaking..." during playback

## Leaflet Setup

The map is initialized lazily on first `adjustMap()` call:

```javascript
// Initialize map (done once)
map = L.map('map-container');

// Add tile layer
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
}).addTo(map);

// Set up manual mode trigger
map.on('click', () => { manualModeOn() });

// Update map view (done on each position/POI change)
map.setView([pos.lat, pos.lng], zoom);

// Current position marker (blue, default Leaflet marker)
if (posMarker) posMarker.setLatLng([pos.lat, pos.lng]);
else posMarker = L.marker([pos.lat, pos.lng]).addTo(map);

// POI marker (red custom icon)
const poiIcon = L.icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-red.png',
  iconRetinaUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41]
});
if (poiMarker) poiMarker.setLatLng([poi.location.lat, poi.location.lng]);
else poiMarker = L.marker([poi.location.lat, poi.location.lng], {icon: poiIcon}).addTo(map);
```

## jQuery Patterns

Simple DOM manipulation examples used in the app:

```javascript
// Show/hide elements
$('#map-loading').hide();
$('#poi-image').show();
$('.poi-ux').show();  // Show multiple elements with class

// Set text content
$('#poi-title').text(poi.title);
$('#poi-description').text((poi.type ? '(' + poi.type + ') ' : '') + poi.description);

// Set attributes
$('#poi-image-img').attr('src', poi.image);

// Enable/disable buttons
$('#next-button').prop('disabled', true);

// Event handlers
$('#more-button').click((evt) => explainPoi(evt));
$('#recenter-button').click((evt) => manualModeOff());
$('#share-button').click((evt) => shareCurrentPoi());

// Web Speech API
const utterance = new SpeechSynthesisUtterance($('#poi-description').text());
utterance.onend = (evt) => { /* handle completion */ };
window.speechSynthesis.speak(utterance);
window.speechSynthesis.cancel(); // to stop speaking
```

## Zoom Calculation

The `calculateZoom()` function ensures both current position and POI are visible:

1. If no POI exists, uses default zoom from config
2. Calculates distance in both lat/lng directions separately
3. Determines required meters-per-pixel for each dimension with 2.8x padding
4. Uses the dimension requiring more zoom-out (larger metersPerPixel)
5. Converts to Leaflet zoom level using logarithmic scale
6. Clamps result between zoom levels 8-15

This approach handles POIs in any direction (east/west/north/south) and works in both landscape and portrait orientations.

# Current Status

## Implemented Features ✓

- ✓ Orchestrator callback-based architecture
- ✓ WikiData POI fetching with type labels
- ✓ Leaflet map with auto-centering on current position
- ✓ Smart zoom calculation (considers both dimensions)
- ✓ Position and POI markers
- ✓ Manual mode (click map to explore, recenter to resume)
- ✓ POI pane with title, type, description, and optional image
- ✓ Share functionality using Web Share API
- ✓ Manual POI advancement (next button)
- ✓ Visibility change handling (pause/resume on tab switch)
- ✓ Claude API integration for enriched descriptions
- ✓ Claude API token management (localStorage)
- ✓ Text-to-speech using Web Speech API
- ✓ "More" button to fetch and speak enriched content

## To Be Implemented

- City and state extraction/fetching for POIs (parameters exist in `askClaude()` but are not yet populated)

# Testing Tips

- Test in Chrome with device emulation (mobile viewport)
- Use geolocation override in DevTools to simulate movement
- Test both portrait and landscape orientations
- Verify manual mode: click map → explore → click recenter
- Test with POIs at various distances and directions
- Verify share functionality on mobile device
- Check visibility handling: switch tabs and verify timers pause/resume
- Test Claude integration: click "More" button, provide API token, verify enriched description and speech
- Test speech cancellation: click "More" while speaking to cancel
- Test token management: shift-click "More" to clear saved token
