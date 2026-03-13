//
// ORCHESTRATOR.JS
//
// Instantiate one of these at the top of the component tree and pass it around.
// It keeps track of location and fetches and hands out POIs on request. Key public
// interfaces are: popNextPOI, getCurrentPosition, getCurrentBearing
//

import { cfg, dbg } from './config.js';
import { calculateDistanceMiles, calculateBearingDegrees, angleDifferenceDegrees } from './geo.js';
import { fetchPoints } from './wikidata.js';

export class Orchestrator
{
  // +-------+
  // | Setup |
  // +-------+

  #newPosCallback;
  #newPoiCallback;
  
  #positions;
  #watchId;
  
  #poiQueue;
  #poiHistory;
  #poiFetchInProgress;
  #poiLastPosition;
  #poiLastPop;
  #intervalId;

  constructor(newPosCallback, newPoiCallback) {
	dbg('orch.constructor');
	
	this.#newPosCallback = newPosCallback;
	this.#newPoiCallback = newPoiCallback;
	
    this.#initPositions();
    this.#initPOIs();
	
	this.startTimers();
  }

  startTimers() {
	dbg('orch.startTimers');

	if (!this.#watchId) {
	  
	  if (!navigator.geolocation) {
		console.error('geolocation not supported');
		return;
	  }

	  const watchOptions = {
        enableHighAccuracy: false,
        maximumAge: 0,
        timeout: 10000,
	  };

	  this.#watchId = navigator.geolocation.watchPosition(
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
		  dbg(`poi.timeout hit: last=${this.#poiLastPop} now=${now}`);
		  this.popNextPOI();
		}
	  }, cfg('HEARTBEAT_INTERVAL_MS'));
	}
  }

  clearTimers() {
	dbg('orch.clearTimers');
	
	if (this.#watchId) {
	  navigator.geolocation.clearWatch(this.#watchId);
	  this.#watchId = undefined;
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
	if (this.#poiQueue.length === 0) { dbg('poi.no-pois'); return(null); }

	const nextPoi = this.#poiQueue.pop();
	this.#poiHistory[nextPoi.id] = true;
	this.#poiLastPop = new Date();

	dbg(`poi.popped ${nextPoi.id}; queue length is now ${this.#poiQueue.length}`);
	
	if (this.#poiQueue.length < 2) { dbg('poi.trigger-fetch'); this.#fetchPOIs(); }
	this.#newPoiCallback(nextPoi);
  }
  
  #scorePOI(poi, pos, dir) {
  
	const distance = calculateDistanceMiles(pos, poi.location)

	// no direction yet; just use distance
	if (!dir) return(distance); 

	// figure out angle offset (how far off our direction) the poi is
	const bearing = calculateBearingDegrees(pos, poi.location)
	const angleDiff = angleDifferenceDegrees(dir, bearing)

	// Weight: prefer POIs ahead of us and nearby
	// Increase effective distance for POIs behind us
	const dirWeight = angleDiff > 90 ? 2 : 1

	return(distance * dirWeight);
  }

  async #innerFetchPOIs() {
	
	const pos = this.getCurrentPosition();
	
	if (!pos) {
	  console.log('nopos');
	  this.#poiQueue = [];
	  this.#poiLastPosition = null;
	  return;
	}
	
    try {

	  // get points of interest
      const fetchedPois = await fetchPoints(pos.lat, pos.lng, cfg('POI_FETCH_RADIUS_MILES'));

	  // filter out ones we've shown this session
      let pois = fetchedPois.filter(poi => !this.#poiHistory[poi.id]);
	  dbg(`poi.fetched count = ${fetchedPois.length}, filtered = ${pois.length}`);

	  // if we've seen them all, just use what we found again. But if there is even
	  // one new one, take it! We'll search again soon but that's OK.
	  if (pois.length === 0) pois = fetchedPois; 
		
	  // score and sort
      const dir = this.getCurrentBearing();
      pois.forEach(poi => { poi.score = this.#scorePOI(poi, pos, dir); });
      pois.sort((a, b) => b.score - a.score); // closest at END for us to pop from
	  this.#poiQueue = pois;
	  
    } catch (error) {
	  
      console.error('Error fetching POIs:', error)
	  this.#poiQueue = [];
    }
	finally {
	  this.#poiLastPosition = pos;
	}
  }
  
  async #fetchPOIs() {
	try {
	  if (this.#poiFetchInProgress) return;
	  this.#poiFetchInProgress = true;
	  await this.#innerFetchPOIs();
	}
	finally {
	  this.#poiFetchInProgress = false;
	}
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
	return(calculateBearingDegrees(this.#positions[0], this.#positions[1]));
  }

  #updatePosition(watchPos) {
	const pos = { lat: watchPos.coords.latitude, lng: watchPos.coords.longitude };
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
