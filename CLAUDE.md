# Overview

This is a simplified rebuild of the CTX road trip app using plain HTML, CSS, and JavaScript with jQuery. The app runs on a mobile device during a road trip, showing two panes side-by-side (landscape) or stacked (portrait):

1. **Map Pane** - Shows current location and nearby point of interest
2. **POI Pane** - Displays information about the selected point of interest

The app provides contextual information during drives - highlighting interesting nearby places like historical sites, parks, wildlife areas, etc.

## Why Not React?

The singleton Orchestrator instance that watches location and manages the POI queue created unnecessary complexity with React's state management, closures, and re-render cycles. This simpler approach uses plain DOM manipulation with callbacks.

# JavaScript Modules

## config.js
Configuration constants and debug helpers:
- `cfg('KEY')` - Access config values
- `dbg(msg)` - Debug logging with category prefixes (e.g., "poi.something")
- Configuration includes:
  - Timing: `HEARTBEAT_INTERVAL_MS` (5s), `POI_INTERVAL_MS` (2min)
  - Map: `MAP_ZOOM_DEFAULT` (13)
  - POI fetching: `POI_FETCH_RADIUS_MILES` (80), `POI_FETCH_TRIGGER_MILES` (10)
  - Claude API: `CLAUDE_API_VERSION`, `CLAUDE_MODEL` (claude-sonnet-4-6), `CLAUDE_MAX_TOKENS` (1024)

## geo.js
Geographic utility functions:
- `calculateDistanceMiles(lat1, lng1, lat2, lng2)` - Distance between two points
- `calculateBearingDegrees(lat1, lng1, lat2, lng2)` - Bearing from point 1 to point 2
- `angleDifferenceDegrees(angle1, angle2)` - Difference between two angles

## wikidata.js
WikiData API integration:
- `fetchPoints(lat, lng, radiusMiles)` - Fetches POIs near a location
- Returns array of POI objects: `{ id, title, description, type, location: {lat, lng}, image, url, adminDiv1, adminDiv2, adminDiv3, adminDiv4 }`
- SPARQL query filters for interesting types (tourist attractions, museums, castles, national parks, monuments, historic sites, mountains, lakes, waterfalls)
- Uses WikiData label service to translate type IDs to human-readable strings
- Converts HTTP image URLs to HTTPS for security
- Includes administrative divisions (adminDiv fields) for location context

## claude.js
Claude API integration for enriched POI descriptions:
- `askClaude(poi)` - Fetches enriched description from Claude API
- `getClaudeToken()` / `storeClaudeToken(token)` / `clearClaudeToken()` - Manage API token in localStorage
- Returns promise with `{ response: string }` or `{ error: string }`
- Constructs prompt asking Claude to act as a friendly travel guide
- Prompt instructs Claude to be concise, engaging, and suitable for text-to-speech

## Orchestrator.js
Core singleton managing the app's location and POI logic:
- Geolocation watching via HTML5 Geolocation API
- POI queue management (fetching, scoring, sorting, deduplication)
- Position and bearing tracking
- Callbacks for position and POI updates

Constructor:
- `new Orchestrator(onPositionUpdate, onPoiUpdate)` - Takes two callbacks

Public methods:
- `popNextPOI()` - Manually advance to next POI
- `getCurrentPosition()` - Get current location
- `getCurrentBearing()` - Get current direction of travel
- `startTimers()` / `clearTimers()` - Manage internal timers (called on visibility change)

Key features:
- Calls `onPositionUpdate(pos)` when location changes
- Calls `onPoiUpdate(poi)` when new POI is available
- Fetches POIs when queue is empty or position changes significantly
- Scores POIs by distance and bearing (prefers points ahead of vehicle, weights POIs behind × 2)
- Maintains history to avoid repeating POIs during session

## index.js
Main application logic:
- Initializes Orchestrator with `newPos` and `newPoi` callbacks
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
- Handles share functionality via Web Share API
- Manages visibility changes (pauses/resumes Orchestrator timers on tab switch)

# Architecture Notes

## Implementation Flow

1. **Initialization** (index.js `load` event)
   - Create single Orchestrator instance with `newPos` and `newPoi` callbacks
   - Set up button click handlers
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
   - Lazily initializes Leaflet map on first call
   - Always centers on current position
   - Calculates zoom level to ensure POI marker is visible
   - Position marker: blue (default Leaflet marker)
   - POI marker: red (custom icon from leaflet-color-markers)

6. **Zoom Calculation** (`calculateZoom()`)
   - If no POI exists, uses default zoom from config
   - Calculates distance in both lat/lng directions separately
   - Determines required meters-per-pixel for each dimension with 2.8x padding
   - Uses the dimension requiring more zoom-out (larger metersPerPixel)
   - Converts to Leaflet zoom level using logarithmic scale
   - Clamps result between zoom levels 8-15
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
- Orchestrator callback-based architecture
- WikiData POI fetching with type labels and administrative divisions
- Leaflet map with auto-centering on current position
- Smart zoom calculation (considers both dimensions)
- Position marker (blue) and POI marker (red)
- Manual mode (click map to explore, recenter to resume)
- POI pane with title, type, description, and optional image
- Share functionality using Web Share API
- Manual POI advancement (next button)
- Visibility change handling (pause/resume on tab switch)

## Claude Integration
- Claude API integration for enriched descriptions
- Claude API token management (localStorage with shift-click to clear)
- Text-to-speech using Web Speech API
- "More" button to fetch and speak enriched content
- Click while speaking to cancel

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
