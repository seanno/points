//
// ORCHESTRATOR.JS
//
// Instantiate one of these at the top of the component tree and pass it around.
// It keeps track of location and fetches and hands out POIs on request. Key public
// interfaces are: popNextPOI, getCurrentPosition, getCurrentBearing
//

import { cfg, dbg } from './config.js';
import { calculateDistanceMiles, calculateBearingDegrees, angleDifferenceDegrees, calculateDestinationPoint } from './geo.js';
import { fetchPoints } from './wikidata.js';
import { createMockGeolocation } from './mockGeolocation.js';

export class Orchestrator
{
  // +-------+
  // | Setup |
  // +-------+

  #newPosCallback;
  #newPoiCallback;
  #currentlySpeaking;

  #positions;
  #watchId;
  #geolocation;

  #poiQueue;
  #poiHistory;
  #poiFetchInProgress;
  #poiLastPosition;
  #poiLastPop;
  #intervalId;

  constructor(newPosCallback, newPoiCallback, currentlySpeaking) {
	dbg('orch.constructor');
	
	this.#newPosCallback = newPosCallback;
	this.#newPoiCallback = newPoiCallback;
	this.#currentlySpeaking = currentlySpeaking;
	
    this.#initPositions();
    this.#initPOIs();
	
	this.startTimers();
  }

  startTimers() {
	dbg('orch.startTimers');

	if (!this.#watchId) {

	  // Use mock geolocation if configured, otherwise use real GPS
	  const mockConfig = cfg('MOCK_GEOLOCATION');
	  this.#geolocation = mockConfig ? createMockGeolocation(mockConfig) : navigator.geolocation;

	  if (!this.#geolocation) {
		console.error('geolocation not supported');
		return;
	  }

	  const watchOptions = {
        enableHighAccuracy: true,
        maximumAge: 0,
        timeout: 10000,
	  };

	  this.#watchId = this.#geolocation.watchPosition(
		(pos) => { this.#updatePosition(pos); },
		(error) => { console.log('watchPosition error', error); },
		watchOptions
	  );
	}

	if (!this.#intervalId) {
	  
	  this.#intervalId = setInterval(() => {

		// maybe update POI --- note the interval here is less than the POI
		// interval. We do this because of the possibility of next/manual operations
		// by the user --- we want the POI interval to be from the last change,
		// not strictly on a timer that may be out of sync with the user
		
		const now = new Date();
		if (!this.#poiLastPop || ((now - this.#poiLastPop) >= cfg('POI_INTERVAL_MS'))) {
		  if (this.#currentlySpeaking()) {
			dbg('poi.speaking; deferring timeout pop');
			return;
		  }
		  dbg(`poi.timeout hit: last=${this.#poiLastPop} now=${now}`);
		  this.popNextPOI();
		}
	  }, cfg('HEARTBEAT_INTERVAL_MS'));
	}
  }

  clearTimers() {
	dbg('orch.clearTimers');

	if (this.#watchId && this.#geolocation) {
	  this.#geolocation.clearWatch(this.#watchId);
	  this.#watchId = undefined;
	  this.#geolocation = undefined;
	}

	if (this.#intervalId) {
	  window.clearInterval(this.#intervalId);
	  this.#intervalId = undefined;
	}
  }

  // +------------+
  // | popNextPOI |
  // +------------+

  popNextPOI() {
	if (this.#poiQueue.length < 3) { dbg('poi.trigger-fetch'); this.#fetchPOIs(); }

	if (this.#poiQueue.length === 0) { dbg('poi.no-pois'); return(false); }

	// redo this score and sort every time to ensure we're looking ahead
	this.#scoreAndSortPOIs();

	const nextPoi = this.#poiQueue.pop();
	this.#poiHistory[nextPoi.id] = true;
	this.#poiLastPop = new Date();

	dbg(`poi.popped ${nextPoi.id}; queue length is now ${this.#poiQueue.length}`);

	this.#newPoiCallback(nextPoi);
	return(true);
  }

  #scoreAndSortPOIs() {
    if (this.#poiQueue.length === 1) return;
	const start = new Date();
	const pos = this.getCurrentPosition();
    const dir = this.getCurrentBearing();
    this.#poiQueue.forEach(poi => { poi.score = this.#scorePOI(poi, pos, dir); });
    this.#poiQueue.sort((a, b) => b.score - a.score); // closest at END for us to pop from
	dbg(`poi.scoreAndSort time: ${new Date() - start}ms`);
  }

  #scorePOI(poi, pos, dir) {

	const distance = calculateDistanceMiles(pos, poi.location)

	// no direction yet; just use distance
	if (!dir) return(distance);

	// figure out angle offset (how far off our direction) the poi is
	const bearing = calculateBearingDegrees(pos, poi.location)
	const angleDiff = angleDifferenceDegrees(dir, bearing)

	// Continuous penalty: strongly prefer POIs ahead
	// 0° ahead: 1.0, 60°: 2.0, 90°: 3.25, 135°: 6.25, 180° behind: 10.0
	const dirWeight = 1 + Math.pow(angleDiff / 60, 2);

	return(distance * dirWeight);
  }

  async #progressiveFetchAndFilter(searchPos) {
	const minDesiredPois = cfg('POI_MIN_DESIRED_COUNT');
	const radii = cfg('POI_PROGRESSIVE_RADII');
	let lastSuccessfulPois = null;

	for (const radius of radii) {
	  try {
		// Fetch POIs at this radius
		const fetchedPois = await fetchPoints(searchPos.lat, searchPos.lng, radius);

		// Filter out ones we've shown this session
		let pois = fetchedPois.filter(poi => !this.#poiHistory[poi.id]);
		dbg(`poi.fetched count = ${fetchedPois.length}, filtered = ${pois.length} at radius ${radius}mi`);

		// Save this result in case we need it
		lastSuccessfulPois = pois.length > 0 ? pois : fetchedPois;

		// If we have enough filtered POIs, we're done
		if (pois.length >= minDesiredPois) {
		  dbg(`poi.success at ${radius}mi with ${pois.length} filtered pois`);
		  return pois;
		}

		dbg(`poi.only ${pois.length} filtered pois at ${radius}mi, trying larger radius`);

	  } catch (error) {
		// On error at smallest radius, fail immediately
		if (radius === radii[0]) {
		  throw error;
		}
		// Otherwise try larger radius (dense areas timeout, sparse areas succeed)
		dbg(`poi.error at ${radius}mi: ${error.message}, trying larger radius`);
	  }
	}

	// Tried all radii - return last successful result or empty array
	return lastSuccessfulPois || [];
  }

  async #innerFetchPOIs() {

	const pos = this.getCurrentPosition();

	if (!pos) {
	  console.log('nopos');
	  this.#poiQueue = [];
	  this.#poiLastPosition = null;
	  return;
	}

	// Use predicted position as search center when moving at speed
	const searchPos = this.#getPredictedPosition();

    try {
	  this.#poiQueue = await this.#progressiveFetchAndFilter(searchPos);
    } catch (error) {
      console.error('Error fetching POIs:', error)
	  this.#poiQueue = [];
    }
	finally {
	  this.#poiLastPosition = pos;
	}
  }
  
  async #fetchPOIs() {
	if (this.#poiFetchInProgress) return;
	this.#poiFetchInProgress = true;
	
	try { await this.#innerFetchPOIs(); }
	finally { this.#poiFetchInProgress = false;	}
  }

  #maybeFetchPOIs() {

	if (this.#poiLastPosition !== null) {
	  const distanceMiles = calculateDistanceMiles(this.#poiLastPosition, this.getCurrentPosition());
	  if (distanceMiles < cfg('POI_FETCH_TRIGGER_MILES')) return;
	}

	this.#fetchPOIs();
  }

  #initPOIs() {
	this.#poiQueue = [];
	this.#poiHistory = {};
	this.#poiFetchInProgress = false;
	this.#poiLastPosition = null;
	this.#poiLastPop = null;
  }
  
  // +--------------------+
  // | getCurrentPosition |
  // | getCurrentBearing  |
  // +--------------------+

  getCurrentPosition() {
	return(this.#positions.length === 0 ? null : this.#positions[0]);
  }

  getCurrentBearing() {
	if (this.#positions.length < 2) return(null);
	return(calculateBearingDegrees(this.#positions[1], this.#positions[0]));
  }

  #getCurrentSpeed() {
	if (this.#positions.length < 2) return(0);

	const pos1 = this.#positions[0]; // most recent
	const pos2 = this.#positions[1]; // previous

	const distanceMiles = calculateDistanceMiles(pos1, pos2);
	const timeHours = (pos1.timestamp - pos2.timestamp) / (1000 * 60 * 60);

	if (timeHours === 0) return(0);
	return(distanceMiles / timeHours); // mph
  }

  #getPredictedPosition() {
	const currentPos = this.getCurrentPosition();
	const speed = this.#getCurrentSpeed();
	const bearing = this.getCurrentBearing();

	// If not moving fast enough or no bearing, use current position
	if (!currentPos || !bearing || speed < cfg('POI_PREDICT_MIN_SPEED_MPH')) {
	  return(currentPos);
	}

	// Predict ahead by half the fetch trigger distance
	const distanceMiles = cfg('POI_FETCH_TRIGGER_MILES') / 2;

	// Calculate predicted position based on current bearing and speed
	const predicted = calculateDestinationPoint(currentPos.lat, currentPos.lng, bearing, distanceMiles);

	dbg(`poi.predicted position: speed=${speed.toFixed(1)}mph, distance=${distanceMiles.toFixed(1)}mi, bearing=${bearing.toFixed(0)}°`);

	return(predicted);
  }

  #updatePosition(watchPos) {
	const pos = {
	  lat: watchPos.coords.latitude,
	  lng: watchPos.coords.longitude,
	  timestamp: new Date()
	};
	dbg(`pos.updated ${JSON.stringify(pos)}`);
	this.#positions.unshift(pos);
	if (this.#positions.length > 2) this.#positions.pop();
    this.#maybeFetchPOIs();
	this.#newPosCallback(pos);
  }

  #initPositions() {
	this.#positions = [];
  }

  
}
