# Overview

This is a simplified rebuild of the CTX road trip app using plain HTML, CSS, and JavaScript with jQuery. The app runs on a mobile device during a road trip, showing two panes side-by-side (landscape) or stacked (portrait):

1. **Map Pane** - Shows current location and nearby point of interest
2. **POI Pane** - Displays information about the selected point of interest

The app provides contextual information during drives - highlighting interesting nearby places like historical sites, parks, wildlife areas, etc.

## Why Not React?

The singleton Orchestrator instance that watches location and manages the POI queue created unnecessary complexity with React's state management, closures, and re-render cycles. This simpler approach uses plain DOM manipulation with callbacks.

# File Structure

All application files are located in the `docs/` directory:
- `docs/index.html` - Main HTML file
- `docs/index.css` - Styles
- `docs/index.js` - Main application logic
- `docs/config.js` - Configuration constants
- `docs/geo.js` - Geographic utilities
- `docs/wikidata.js` - WikiData API integration
- `docs/claude.js` - Claude API integration
- `docs/Orchestrator.js` - Core location and POI management
- `docs/mockGeolocation.js` - Mock geolocation for testing

# JavaScript Modules

## config.js
Configuration constants and debug helpers:
- `cfg('KEY')` - Access config values
- `dbg(msg)` - Debug logging with category prefixes (e.g., "poi.something")
- Configuration includes:
  - Timing: `HEARTBEAT_INTERVAL_MS` (5s), `POI_INTERVAL_MS` (60s / 1min)
  - Map: `MAP_ZOOM_DEFAULT` (13), `MAP_ZOOM_MIN` (7), `MAP_ZOOM_MAX` (15)
  - POI fetching: `POI_FETCH_RADIUS_MILES` (80), `POI_FETCH_TRIGGER_MILES` (10), `POI_PREDICT_MIN_SPEED_MPH` (20), `POI_MIN_DESIRED_COUNT` (20), `POI_PROGRESSIVE_RADII` ([10, 20, 40, 80])
  - Claude API: `CLAUDE_API_VERSION`, `CLAUDE_MODEL` (claude-sonnet-4-6), `CLAUDE_MAX_TOKENS` (1024), `CLAUDE_ROLE` (user)
  - Testing: `MOCK_GEOLOCATION` (null for real GPS, or object with `start`, `end`, `speedMph`, `intervalMs` to simulate travel)

## geo.js
Geographic utility functions:
- `calculateDistanceMiles(point1, point2)` - Distance between two points
- `calculateBearingDegrees(point1, point2)` - Bearing from point 1 to point 2
- `angleDifferenceDegrees(angle1, angle2)` - Difference between two angles
- `calculateDestinationPoint(lat, lng, bearingDegrees, distanceMiles)` - Calculate destination point given start, bearing, and distance

## wikidata.js
WikiData API integration:
- `fetchPoints(lat, lng, radiusMiles)` - Fetches POIs near a location using progressive radius search
- Returns array of POI objects: `{ id, title, description, type, location: {lat, lng}, image, url, adminDiv1 }`
- SPARQL query filters for interesting types:
  - Broad categories: tourist attractions, museums, national parks, archaeological sites, landforms, bodies of water, architectural structures, facilities
  - Specific types: castles, lighthouses, monuments, bridges, towers, churches, buildings, statues, synagogues, temples, cathedrals, viewpoints, parks, waterfalls, mountains, lakes, rivers, caves, beaches, gardens
  - Uses one level of subclass matching (`wdt:P279?`) for performance
- Uses WikiData label service to translate type IDs to human-readable strings
- Converts HTTP image URLs to HTTPS for security
- Includes immediate administrative parent (adminDiv1) for location context
- Returns up to 50 results ordered by distance
- 90 second query timeout

## claude.js
Claude API integration for enriched POI descriptions:
- `askClaude(poi)` - Fetches enriched description from Claude API
- `getClaudeToken()` / `storeClaudeToken(token)` / `clearClaudeToken()` - Manage API token in localStorage
- Returns promise with `{ response: string }` or `{ error: string }`
- Constructs prompt asking Claude to act as a friendly travel guide
- Prompt instructs Claude to be concise, engaging, and suitable for text-to-speech

## mockGeolocation.js
Mock geolocation for testing:
- `createMockGeolocation(mockConfig)` - Creates a mock geolocation object that simulates travel along a straight-line route
- Compatible with HTML5 Geolocation API (`watchPosition`, `clearWatch`)
- Configuration object specifies:
  - `start`: Starting coordinates `{lat, lng}`
  - `end`: Ending coordinates `{lat, lng}`
  - `speedMph`: Travel speed in miles per hour
  - `intervalMs`: Milliseconds between position updates
- Calculates route bearing and distance, then emits position updates at intervals
- Simulates realistic position data including heading and speed in m/s
- Stops when destination is reached
- Enabled by setting `MOCK_GEOLOCATION` in config.js (null to use real GPS)

## Orchestrator.js
Core singleton managing the app's location and POI logic:
- Geolocation watching via HTML5 Geolocation API (or mock geolocation for testing)
- POI queue management (fetching, scoring, sorting, deduplication)
- Position and bearing tracking
- Callbacks for position and POI updates

Constructor:
- `new Orchestrator(onPositionUpdate, onPoiUpdate, currentlySpeaking)` - Takes three callbacks

Public methods:
- `popNextPOI()` - Manually advance to next POI (re-scores and re-sorts queue before each pop)
- `getCurrentPosition()` - Get current location
- `getCurrentBearing()` - Get current direction of travel
- `startTimers()` / `clearTimers()` - Manage internal timers (called on visibility change)

Key features:
- Calls `onPositionUpdate(pos)` when location changes
- Calls `onPoiUpdate(poi)` when new POI is available
- **Progressive radius POI fetching**: Searches at increasing radii (10, 20, 40, 80 miles) until POI_MIN_DESIRED_COUNT (20) unseen POIs are found
  - Filters out previously shown POIs from history
  - If all POIs have been shown, reuses them to allow revisiting
  - On error at smaller radius, tries larger radius (dense areas timeout, sparse areas succeed faster)
- **Predicted position search**: When moving above POI_PREDICT_MIN_SPEED_MPH (20 mph), searches ahead of current position by half the fetch trigger distance
- Fetches POIs when queue is empty or position changes significantly (POI_FETCH_TRIGGER_MILES)
- **Re-scores and re-sorts queue on every `popNextPOI()` call** to ensure POIs ahead of travel direction are prioritized
- **Continuous penalty scoring algorithm**: `distance × directionWeight`
  - directionWeight = `1 + (angleDiff / 60)²`
  - 0° ahead: weight = 1.0
  - 60°: weight = 2.0
  - 90°: weight = 3.25
  - 135°: weight = 6.25
  - 180° behind: weight = 10.0
  - Lower score = better (closer POI in direction of travel)
- Queue sorted with lowest scores at end (so `pop()` gets the best POI)
- Re-fetches when queue drops below 3 items
- Defers automatic POI pop when currently speaking

## index.js
Main application logic:
- Initializes Orchestrator with `newPos`, `newPoi`, and `currentlySpeaking` callbacks
- Manages manual mode (click map to explore, recenter button to resume)
- Updates map (Leaflet) with position and POI markers
- Updates POI pane with content
- Implements smart zoom calculation to keep both position and POI visible
- Handles "More" button:
  - Prompts for Claude API token on first use (stored in localStorage)
  - Shift-click to clear saved token
  - Fetches enriched description from Claude API
  - Updates button states: "More" → "Asking..." → "Speaking..."
  - Automatically reads description aloud using Web Speech API
  - Click while speaking to cancel
- Handles chime button (🔕/🔔):
  - Toggles audio notification for new POIs
  - Uses Web Audio API to play a brief sine wave tone (800 Hz, 0.5s fade-out)
- Handles share functionality via Web Share API
- Manages visibility changes (pauses/resumes Orchestrator timers on tab switch)
- Screen wake lock to prevent device from sleeping during use
- Fullscreen button to toggle fullscreen mode
- Toast notifications for empty queue and other events

# Architecture Notes

## Implementation Flow

1. **Initialization** (index.js `load` event)
   - Create single Orchestrator instance with `newPos`, `newPoi`, and `currentlySpeaking` callbacks
   - Set up button click handlers
   - Set up visibility change handler to pause/resume Orchestrator timers
   - Request screen wake lock on load and when returning to visible

2. **Position Updates** (via `newPos` callback)
   - Orchestrator calls `newPos(position)` when location changes
   - If not in manual mode: call `adjustMap()` to update map view and markers

3. **POI Updates** (via `newPoi` callback)
   - Orchestrator calls `newPoi(poi)` when new POI is available
   - If not in manual mode: call `adjustMap()` and `updatePoiPane()`, optionally `playChime()`
   - Updates map with POI marker and recalculates zoom
   - Populates POI pane with title, type, description, and optional image
   - Plays audio chime if enabled (toggleable via bell button)
   - POI interval timer: heartbeat checks if POI_INTERVAL_MS (60s) has elapsed since last pop
     - Allows interval to sync with manual/next button operations
     - Ensures minimum time between automatic POI changes
     - Defers auto-pop if currently speaking

4. **Manual Mode**
   - User clicks/taps map → `manualModeOn()` → show recenter button, disable next button, pause updates
   - User can freely pan/zoom map without automatic updates
   - User clicks recenter button → `manualModeOff()` → hide recenter button, enable next button, resume updates

5. **Map Rendering** (`adjustMap()`)
   - Lazily initializes Leaflet map on first call
   - Always centers on current position
   - Calculates zoom level to ensure POI marker is visible
   - Position marker: custom blue arrow SVG icon that rotates based on bearing
     - Arrow points in direction of travel
     - Smooth rotation transitions (0.3s ease-out)
     - Blue circle background with semi-transparent fill
   - POI marker: red (custom icon from leaflet-color-markers)

6. **Zoom Calculation** (`calculateZoom()`)
   - If no POI exists, uses default zoom from config
   - Calculates distance in both lat/lng directions separately
   - Determines required meters-per-pixel for each dimension with 2.4x padding (2 × 1.2)
   - Uses the dimension requiring more zoom-out (larger metersPerPixel)
   - Converts to Leaflet zoom level using logarithmic scale
   - Clamps result between zoom levels 7-15 (MAP_ZOOM_MIN and MAP_ZOOM_MAX)
   - Handles POIs in any direction and works in both landscape and portrait

7. **Share Functionality**
   - Uses Web Share API (`navigator.share()`)
   - Shares POI title, description, and Google search URL

8. **More Button / Claude Integration** (`explainPoi()`)
   - Clicking "More" while speaking cancels speech
   - Prompts for Claude API token on first use
   - Shift-click to clear saved token
   - Fetches enriched description from Claude API
   - Updates button states: "More" → "Asking..." → "Speaking..."
   - Displays enriched description (HTML with `<br/>` tags)
   - Automatically speaks description using `speechSynthesis.speak()`
   - Button returns to "More" when speech completes

9. **Text-to-Speech** (`startSpeaking()` / `cancelSpeaking()`)
   - Uses Web Speech API (`window.speechSynthesis`)
   - Reads text content from `#poi-description`
   - Tracks speaking state
   - Clicking "More" while speaking cancels speech
   - Updates button to "Speaking..." during playback

# Features

## Core Functionality
- Orchestrator callback-based architecture with automatic re-scoring/re-sorting
- Progressive radius POI fetching with predicted position search
- WikiData POI fetching with optimized type matching
- Leaflet map with auto-centering on current position
- Smart zoom calculation (considers both dimensions independently)
- Position marker: custom blue arrow that rotates with bearing
- POI marker: red custom icon
- Manual mode (click map to explore, recenter to resume)
- POI pane with title, type, description, and optional image
- Audio chime notification (toggleable bell button 🔕/🔔)
- Share functionality using Web Share API
- Manual POI advancement (next button)
- Visibility change handling (pause/resume on tab switch)
- Screen wake lock to prevent device sleep
- Fullscreen mode toggle
- Toast notifications

## Claude Integration
- Claude API integration for enriched descriptions
- Claude API token management (localStorage with shift-click to clear)
- Text-to-speech using Web Speech API
- "More" button to fetch and speak enriched content
- Click while speaking to cancel

# Testing Tips

- Test in Chrome with device emulation (mobile viewport)
- Use geolocation override in DevTools to simulate movement, or configure `MOCK_GEOLOCATION` in config.js to simulate a realistic road trip at highway speeds
- Test both portrait and landscape orientations
- Verify manual mode: click map → explore → click recenter
- Test with POIs at various distances and directions
- **Test POI re-scoring**: simulate driving on highway, verify POIs ahead are strongly prioritized using continuous penalty algorithm
- **Test progressive radius search**: observe console logs to see expanding radius searches (10, 20, 40, 80 miles) until 20 POIs found
- **Test predicted position search**: simulate highway speeds above 20 mph, verify searches happen ahead of current position
- Test chime notification: toggle bell button (🔕/🔔), verify audio plays on new POI when enabled
- Verify share functionality on mobile device
- Check visibility handling: switch tabs and verify timers pause/resume
- Test Claude integration: click "More" button, provide API token, verify enriched description and speech
- Test speech cancellation: click "More" while speaking to cancel
- Test speech deferral: verify automatic POI changes don't interrupt active speech
- Test token management: shift-click "More" to clear saved token
- Test wake lock: verify device doesn't sleep during use
- Test fullscreen: verify fullscreen toggle works correctly
- Test toast notifications: click "Next" with empty queue
