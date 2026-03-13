//
// INDEX.JS
//

import { cfg, dbg } from './config.js';
import { Orchestrator } from './Orchestrator.js';
import { askClaude, storeClaudeToken, getClaudeToken, clearClaudeToken } from './claude.js';

// +--------------------------+
// | Setup & Window Lifecycle |
// +--------------------------+

let orchestrator = null;

window.addEventListener('load', (evt) => {
  
  orchestrator = new Orchestrator(newPos, newPoi);

  $('#more-button').click((evt) => explainPoi(evt));
  $('#next-button').click((evt) => { if (!orchestrator.popNextPOI()) alertEmptyQueue(); });
  $('#share-button').click((evt) => shareCurrentPoi());
  $('#recenter-button').click((evt) => manualModeOff());

  $('#fs-button').click((evt) => {
	if (document.fullscreenElement) document.exitFullscreen();
	else document.documentElement.requestFullscreen();
  });

  requestWakeLock();
});

document.addEventListener('visibilitychange', (evt) => {
  if (!orchestrator) return;
  if (document.hidden) orchestrator.clearTimers();
  else orchestrator.startTimers();
});

document.addEventListener('visibilitychange', (evt) => {
  if (document.visibilityState === 'visible') requestWakeLock();
});

async function requestWakeLock() {
  if (navigator.wakeLock) navigator.wakeLock.request('screen');
}

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

let synth = window.speechSynthesis;
let speaking = false;

function explainPoi(evt) {

  // when speaking, more-button cancels it
  if (cancelSpeaking()) return;
  
  if (!poi) {
	alert('No POI selected');
	return;
  }

  let currentToken = getClaudeToken();

  // shortcut to clear old token
  if (currentToken && event.shiftKey) {
	if (window.confirm('Delete saved Claude API Key?')) {
	  clearClaudeToken();
	  currentToken = null;
	  window.alert('Key cleared');
	}
  }

  // make sure we have a valid one
  if (!currentToken) {
	const newToken = window.prompt('This feature requires a Claude API Key. It will be ' +
								   'saved locally in your browser and not sent to any ' +
								   'server other than the Anthropic API.');

	if (!newToken) return;
	storeClaudeToken(newToken);
  }

  // and go!
  updateMoreButton('asking');

  askClaude(poi).then((response) => {
	const txt = (response.response || response.error);
	const html = txt.replaceAll('\n', '<br/>');

	$('#poi-description').html(html);
	updateMoreButton('ready');
	startSpeaking();
  });
}

function updatePoiPane() {

  cancelSpeaking();
  
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

function startSpeaking() {

  if (!synth) return;

  const utterance = new SpeechSynthesisUtterance($('#poi-description').text());
	  
  utterance.onend = (evt) => {
	updateMoreButton('ready');
	speaking = false;
  }
  
  updateMoreButton('speaking');
  speaking = true;
  synth.speak(utterance);
}

function cancelSpeaking() {

  if (!synth) return(false);
  if (!speaking) return(false);
  
  updateMoreButton('ready');
  speaking = false;
  synth.cancel();
  return(true);
}

function updateMoreButton(state) {

  let txt = 'More';
  let disabled = false;
  
  switch (state) {
	  
	case 'ready':
	  // all good
	  break;

	case 'asking':
	  txt = 'Asking...';
	  disabled = true;
	  break;

	case 'speaking':
	  txt = 'Speaking...';
	  disabled = false;
	  break;
  }

  $('#more-button').text(txt);
  $('#more-button').prop('disabled', disabled);
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

  // Update position marker with direction arrow
  const bearing = orchestrator.getCurrentBearing();

  if (posMarker) {
	posMarker.setLatLng([pos.lat, pos.lng]);
	// Update rotation via CSS on the SVG element, not the marker container
	if (bearing !== null) {
	  const markerElement = posMarker.getElement();
	  if (markerElement) {
		const svg = markerElement.querySelector('svg');
		if (svg) {
		  svg.style.transform = `rotate(${bearing}deg)`;
		}
	  }
	}
  } else {
	// Create arrow icon for position marker
	const arrowIcon = L.divIcon({
	  html: `<svg width="40" height="40" viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg" style="transform-origin: center; transition: transform 0.3s ease-out;">
		<g transform="translate(20,20)">
		  <circle cx="0" cy="0" r="18" fill="#3388ff" opacity="0.3" stroke="#3388ff" stroke-width="2"/>
		  <path d="M 0,-12 L 6,8 L 0,4 L -6,8 Z" fill="#3388ff" stroke="white" stroke-width="1.5"/>
		</g>
	  </svg>`,
	  className: 'direction-arrow-marker',
	  iconSize: [40, 40],
	  iconAnchor: [20, 20]
	});

	posMarker = L.marker([pos.lat, pos.lng], {
	  icon: arrowIcon
	}).addTo(map);

	// Set initial rotation
	if (bearing !== null) {
	  const markerElement = posMarker.getElement();
	  if (markerElement) {
		const svg = markerElement.querySelector('svg');
		if (svg) {
		  svg.style.transform = `rotate(${bearing}deg)`;
		}
	  }
	}
  }

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
  const desiredMetersPerPixelY = (latDiff * 2.4) / mapSize.y; // 2.4 = 2 * 1.2 padding
  const desiredMetersPerPixelX = (lngDiff * 2.4) / mapSize.x;

  // Use the larger metersPerPixel (more zoomed out) to ensure both dimensions fit
  const desiredMetersPerPixel = Math.max(desiredMetersPerPixelX, desiredMetersPerPixelY);

  const zoom = Math.log2(156543.03392 * Math.cos(pos.lat * Math.PI / 180) / desiredMetersPerPixel);

  // Clamp zoom between reasonable values
  const zoomFinal = Math.max(cfg('MAP_ZOOM_MIN'), Math.min(cfg('MAP_ZOOM_MAX'), Math.floor(zoom)));

  dbg(`zoom. dist: ${distance}m
             map: ${mapSize.x}dx, ${mapSize.y}dy
             diff: ${latDiff}lat, ${lngDiff}lng
             mpp: ${desiredMetersPerPixel}m,  (${desiredMetersPerPixelX}x, (${desiredMetersPerPixelY}y
             zoom: ${zoom}, FINAL: ${zoomFinal}`);


  return(zoomFinal);
}

// +-------------+
// | Empty Queue |
// +-------------+

let toastTimeout = null;

function alertEmptyQueue() {
  showToast('Queue Empty');
}

function showToast(message) {
  const toast = document.getElementById('toast');
  toast.textContent = message;

  // Clear any existing timeout
  if (toastTimeout) {
    clearTimeout(toastTimeout);
  }

  // Show toast
  toast.classList.add('show');

  // Hide after 1 second
  toastTimeout = setTimeout(() => {
    toast.classList.remove('show');
    toastTimeout = null;
  }, 1000);
}

