# Points — CTX Road Trip App

A road trip app using plain HTML, CSS, and JavaScript with jQuery. Shows two panes side-by-side (landscape) or stacked (portrait):

1. **Map Pane** — Current location with directional arrow marker and nearby POI marker
2. **POI Pane** — Title, type, description, image, and action buttons for the selected POI

Provides contextual information during drives — highlighting interesting nearby places like historical sites, parks, wildlife areas, etc.

## File Structure

All application files are in `docs/` (served as GitHub Pages):

| File | Purpose |
|------|---------|
| `index.html` | Main HTML |
| `index.css` | Styles |
| `index.js` | Main app logic, UI, map, speech |
| `config.js` | Config constants and debug helpers |
| `geo.js` | Geographic utility functions |
| `wikidata.js` | WikiData SPARQL API integration |
| `claude.js` | Claude API integration |
| `Orchestrator.js` | Core location and POI queue management |
| `mockGeolocation.js` | Simulated GPS for testing |

## Further Documentation

- [MODULES.md](MODULES.md) — Per-module API reference
- [ARCHITECTURE.md](ARCHITECTURE.md) — Implementation flows, features, and design notes
