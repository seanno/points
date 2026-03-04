//
// INDEX.JS
//

import { cfg, dbg } from './config.js';
import { Orchestrator } from './Orchestrator.js';

// +--------------------------+
// | Setup & Window Lifecycle |
// +--------------------------+

let orchestrator = null;

window.addEventListener('load', (evt) => {
  
  orchestrator = new Orchestrator(newPos, newPoi);

  $('#next-button').click((evt) => orchestrator.popNextPOI());
  $('#share-button').click((evt) => shareCurrentPoi());
  $('#recenter-button').click((evt) => manualModeOff());
});

document.addEventListener('visibilitychange', (evt) => {
  if (!orchestrator) return;
  if (document.hidden) orchestrator.clearTimers();
  else orchestrator.startTimers();
});

// +-------------+
// | Manual Mode |
// +-------------+

let manualMode = false;

function manualModeOn() {
  manualMode = true;
  $('#recenter-button').show();
  $('#next-button').prop('disabled', true);
}

function manualModeOff() {
  manualMode = false;
  $('#recenter-button').hide();
  $('#next-button').prop('disabled', false);
  adjustMap();
  updatePoiPane();
}

// +-----------+
// | Callbacks |
// +-----------+

let pos = null;
let poi = null;

function newPos(newPos) {
  pos = newPos;
  dbg(`pos.newPos: ${JSON.stringify(pos)}`);

  if (!manualMode) adjustMap();
}

function newPoi(newPoi) {
  poi = newPoi;
  dbg(`poi.newPoi: ${JSON.stringify(poi)}`);

  if (!manualMode) {
	adjustMap();
	updatePoiPane();
  }
}

// +----------+
// | POI Pane |
// +----------+

function shareCurrentPoi() {
  
  if (!poi) {
	alert('No POI selected');
	return;
  }
	
  navigator.share({
	title: $('#poi-title').text(),
	text: $('#poi-description').text(),
	url: 'https://google.com/search?q=' + encodeURIComponent(poi.title)
  });
}

function updatePoiPane() {

  if (!poi) return;

  dbg(`poideets.poi: ${JSON.stringify(poi)}`);
  
  $('#poi-loading').hide();
  $('.poi-ux').show();

  $('#poi-title').text(poi.title);

  $('#poi-type').text(poi.type);
  $('#poi-description').text((poi.type ? '(' + poi.type + ') ' : '') + poi.description);

  if (poi.image) {
	$('#poi-image').show();
	$('#poi-image-img').attr('src', '');
	$('#poi-image-img').attr('src', poi.image);
  }
  else {
	$('#poi-image').hide();
  }
}

// +----------+
// | Map Pane |
// +----------+

let map = null;
let posMarker = null;
let poiMarker = null;

function adjustMap() {

  const zoom = calculateZoom();
  
  // map sure we have a map
  if (!map) {
	map = L.map('map-container');

	// Add tile layer
	L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
	  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
	}).addTo(map);

	// events to start manual mode
	map.on('click', () => { manualModeOn() });

	$('#map-loading').hide();
	$('#map-container').show();
  }

  map.setView([pos.lat, pos.lng], zoom);
  
  // pos
  if (posMarker) posMarker.setLatLng([pos.lat, pos.lng]);
  else posMarker = L.marker([pos.lat, pos.lng]).addTo(map);

  // poi
  if (poi) {
	if (poiMarker) {
	  poiMarker.setLatLng([poi.location.lat, poi.location.lng]);
	}
	else {
	  const poiIcon = L.icon({
		iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-red.png',
		iconRetinaUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png',
		shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
		iconSize: [25, 41],
		iconAnchor: [12, 41],
		popupAnchor: [1, -34],
		shadowSize: [41, 41]
	  });

	  poiMarker = L.marker([poi.location.lat, poi.location.lng], {icon: poiIcon}).addTo(map);
	  console.log(`poiMarker created at lat=${poi.location.lat} lng=${poi.location.lng}`);
	}
  }
}

function calculateZoom() {

  // if no poi to include, just a basic zoom for travelling
  if (!poi) return(cfg('MAP_ZOOM_DEFAULT'));

  // Always center on current location
  const currentLatLng = L.latLng(pos.lat, pos.lng)

  const poiLatLng = L.latLng(poi.location.lat, poi.location.lng);
  const distance = currentLatLng.distanceTo(poiLatLng); // meters

  // Calculate zoom for both dimensions and use the smaller (more zoomed out)
  // to ensure POI is visible regardless of direction
  const mapSize = map.getSize();
  const latMetersPerDegree = 111320; // meters per degree latitude
  const lngMetersPerDegree = 111320 * Math.cos(pos.lat * Math.PI / 180); // meters per degree longitude at this latitude

  const latDiff = Math.abs(poi.location.lat - pos.lat) * latMetersPerDegree;
  const lngDiff = Math.abs(poi.location.lng - pos.lng) * lngMetersPerDegree;

  // Calculate required zoom for each dimension
  const desiredMetersPerPixelY = (latDiff * 2.8) / mapSize.y; // 2.4 = 2 * 1.2 padding
  const desiredMetersPerPixelX = (lngDiff * 2.8) / mapSize.x;

  // Use the larger metersPerPixel (more zoomed out) to ensure both dimensions fit
  const desiredMetersPerPixel = Math.max(desiredMetersPerPixelX, desiredMetersPerPixelY);

  let zoom = Math.log2(156543.03392 * Math.cos(pos.lat * Math.PI / 180) / desiredMetersPerPixel);

  // Clamp zoom between reasonable values
  zoom = Math.max(8, Math.min(15, zoom));

  return(zoom);
}
