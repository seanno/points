# Architecture & Implementation Notes

## Initialization Flow

1. `window` `load` event in `index.js`
2. Create single `Orchestrator` instance with `newPos`, `newPoi`, and `currentlySpeaking` callbacks
3. Bind button click handlers (`#more-button`, `#next-button`, `#share-button`, `#recenter-button`, `#fs-button`, `#chime-button`)
4. Request screen wake lock

## Position Updates

`Orchestrator` calls `newPos(pos)` on each geolocation update. If not in manual mode, `adjustMap()` re-centers the map and updates the position marker.

## POI Updates

`Orchestrator` calls `newPoi(poi)` when a new POI is selected. If not in manual mode: `adjustMap()`, `updatePoiPane()`, optionally `playChime()`.

**Automatic POI timer**: The heartbeat (every 5s) checks whether `POI_INTERVAL_MS` (60s) has elapsed since the last pop. If yes and not currently speaking, calls `popNextPOI()`. This design lets manual/Next button operations reset the clock naturally.

## Manual Mode

- User taps/clicks map → `manualModeOn()`: show recenter button, disable next button, pause map/POI updates
- User taps recenter → `manualModeOff()`: hide recenter button, re-enable next button, call `adjustMap()` and `updatePoiPane()`

## Map Rendering (`adjustMap`)

- Lazily initializes Leaflet on first call
- Always centers on current position
- **Position marker**: custom blue arrow SVG (`divIcon`), rotated via CSS `transform: rotate(Ndeg)` on the SVG element with a 0.3s ease-out transition
- **POI marker**: red icon from `leaflet-color-markers`

## Zoom Calculation (`calculateZoom`)

- If no POI: use `MAP_ZOOM_DEFAULT`
- Calculates lat/lng differences in meters separately
- Requires `desiredMetersPerPixel` for each screen dimension with 2.4× padding (2 × 1.2)
- Uses the larger value (more zoomed out) to ensure POI is visible in any direction
- Converts to Leaflet zoom using logarithmic scale
- Clamps to `MAP_ZOOM_MIN`–`MAP_ZOOM_MAX` (7–15)

## Claude Integration (`explainPoi`)

1. If currently speaking → cancel speech and return
2. Check for saved token; shift-click clears it
3. Prompt for token if absent (saved to `localStorage`)
4. Set button to "Asking..." (disabled)
5. `askClaude(poi)` → receives `{ response }` or `{ error }`
6. Replace newlines with `<br/>`, update `#poi-description`
7. Set button to "More" (ready), then `startSpeaking()`

Button states: `More` → `Asking...` (disabled) → `Speaking...` (clickable to cancel) → `More`

## Text-to-Speech

- `startSpeaking()`: creates `SpeechSynthesisUtterance` from `#poi-description` text, sets `speaking = true`, updates button
- `cancelSpeaking()`: calls `synth.cancel()`, resets state; returns `true` if it was speaking
- `currentlySpeaking()` callback lets Orchestrator defer automatic POI changes while speech is active

## Share

Uses `navigator.share()` with POI title, description, and a Google search URL.

## Chime

Toggle via `#chime-button` (🔕/🔔). On new POI (if enabled): Web Audio API sine wave at 800 Hz with 0.5s exponential fade-out.

## Visibility Handling

- Tab hidden → `orchestrator.clearTimers()` (stops GPS watch and heartbeat)
- Tab visible → `orchestrator.startTimers()` + re-request wake lock

## Screen Wake Lock

`navigator.wakeLock.request('screen')` on load and on each visibility restore.

## Fullscreen

`#fs-button` toggles `document.documentElement.requestFullscreen()` / `exitFullscreen()`.

## Toast Notifications

`showToast(message)` briefly displays a `#toast` element for 1 second. Used for "Queue Empty" when Next is pressed with an empty queue.

---

## Testing Tips

- Use Chrome DevTools device emulation (mobile viewport, landscape/portrait)
- Override geolocation in DevTools, or set `MOCK_GEOLOCATION` in `config.js` to simulate highway travel
- Test both orientations
- **POI re-scoring**: drive on a highway and verify POIs ahead are strongly prioritized
- **Progressive radius**: watch console logs for expanding radius attempts
- **Predicted position**: simulate speeds above 20 mph, verify search center is ahead of vehicle
- **Diversity lookahead**: watch `diversity.*` logs to see type-based candidate selection
- **Behind filtering**: simulate U-turn, verify POIs behind trigger a re-fetch
- **Chime**: toggle bell, verify audio on new POI
- **Claude**: click "More", provide API key, verify enriched description and speech
- **Speech cancel**: click "More" while speaking
- **Speech deferral**: verify automatic POI changes don't interrupt active speech
- **Token management**: shift-click "More" to clear saved key
- **Share**: test on mobile
- **Visibility**: switch tabs, verify timers pause/resume
- **Wake lock**: verify device stays awake
- **Fullscreen**: verify toggle works
