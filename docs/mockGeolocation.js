//
// MOCKGEOLOCATION.JS
//
// Simulates navigator.geolocation for testing with a mock route
//

import { calculateDistanceMiles, calculateBearingDegrees, calculateDestinationPoint } from './geo.js';
import { dbg } from './config.js';

export function createMockGeolocation(mockConfig) {

  let watchId = 0;
  let intervalId = null;
  let currentPosition = null;
  let totalDistance = 0;
  let distanceTraveled = 0;
  let bearing = 0;

  // Calculate route parameters
  const start = mockConfig.start;
  const end = mockConfig.end;
  const speedMph = mockConfig.speedMph;
  const intervalMs = mockConfig.intervalMs;

  totalDistance = calculateDistanceMiles(start, end);
  bearing = calculateBearingDegrees(start, end);
  const distancePerStep = speedMph * (intervalMs / (1000 * 60 * 60)); // miles per interval

  dbg(`mock.route: ${totalDistance.toFixed(1)} miles at ${speedMph} mph, bearing ${bearing.toFixed(0)}°`);
  dbg(`mock.step: ${distancePerStep.toFixed(3)} miles every ${intervalMs}ms`);

  currentPosition = { ...start };

  function watchPosition(successCallback, errorCallback, options) {

    watchId++;
    const thisWatchId = watchId;

    // Emit first position asynchronously (like real geolocation API)
    setTimeout(() => emitPosition(successCallback), 0);

    // Then emit at intervals
    intervalId = setInterval(() => {
      if (distanceTraveled >= totalDistance) {
        dbg('mock.reached end of route');
        clearInterval(intervalId);
        return;
      }

      // Move to next position
      distanceTraveled += distancePerStep;
      if (distanceTraveled > totalDistance) {
        distanceTraveled = totalDistance;
      }

      currentPosition = calculateDestinationPoint(start.lat, start.lng, bearing, distanceTraveled);
      emitPosition(successCallback);

    }, intervalMs);

    return thisWatchId;
  }

  function emitPosition(callback) {
    const mockWatchPosition = {
      coords: {
        latitude: currentPosition.lat,
        longitude: currentPosition.lng,
        accuracy: 10,
        altitude: null,
        altitudeAccuracy: null,
        heading: bearing,
        speed: speedMph * 0.44704 // convert mph to m/s
      },
      timestamp: Date.now()
    };

    dbg(`mock.position: ${currentPosition.lat.toFixed(4)}, ${currentPosition.lng.toFixed(4)} (${distanceTraveled.toFixed(1)}/${totalDistance.toFixed(1)} mi)`);
    callback(mockWatchPosition);
  }

  function clearWatch(id) {
    if (intervalId) {
      clearInterval(intervalId);
      intervalId = null;
    }
    dbg('mock.clearWatch');
  }

  return {
    watchPosition,
    clearWatch
  };
}
