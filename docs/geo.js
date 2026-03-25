//
// GEO.JS
//

// incoming parameters are position objects with "lat" and "lng" fields

// +------------------------+
// | calculateDistanceMiles |
// +------------------------+

export function calculateDistanceMiles(point1, point2) {
  
  const lat1 = toRadians(point1.lat);
  const lat2 = toRadians(point2.lat);
  
  const deltaLat = toRadians(point2.lat - point1.lat);
  const deltaLng = toRadians(point2.lng - point1.lng);

  const a = Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
        Math.cos(lat1) * Math.cos(lat2) *
        Math.sin(deltaLng / 2) * Math.sin(deltaLng / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return(3959 * c); // 3959 === Earth radius in miles
}

// +-------------------------+
// | calculateBearingDegrees |
// +-------------------------+

export function calculateBearingDegrees(point1, point2) {
  
  const lat1 = toRadians(point1.lat);
  const lat2 = toRadians(point2.lat);
  const deltaLng = toRadians(point2.lng - point1.lng);

  const y = Math.sin(deltaLng) * Math.cos(lat2);
  
  const x = Math.cos(lat1) * Math.sin(lat2) -
        Math.sin(lat1) * Math.cos(lat2) * Math.cos(deltaLng);

  const bearing = toDegrees(Math.atan2(y, x));

  return((bearing + 360) % 360);
}

// +------------------------+
// | angleDifferenceDegrees |
// +------------------------+

export function angleDifferenceDegrees(bearing1, bearing2) {
  const diff = Math.abs(bearing1 - bearing2);
  return(diff > 180 ? 360 - diff : diff);
}

// +--------------------------+
// | calculateDestinationPoint |
// +--------------------------+

export function calculateDestinationPoint(lat, lng, bearingDegrees, distanceMiles) {

  const lat1 = toRadians(lat);
  const lng1 = toRadians(lng);
  const bearing = toRadians(bearingDegrees);
  const angularDistance = distanceMiles / 3959; // Earth radius in miles

  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(angularDistance) +
    Math.cos(lat1) * Math.sin(angularDistance) * Math.cos(bearing)
  );

  const lng2 = lng1 + Math.atan2(
    Math.sin(bearing) * Math.sin(angularDistance) * Math.cos(lat1),
    Math.cos(angularDistance) - Math.sin(lat1) * Math.sin(lat2)
  );

  return {
    lat: toDegrees(lat2),
    lng: toDegrees(lng2)
  };
}

// +---------+
// | Helpers |
// +---------+

function toRadians(degrees) { return degrees * (Math.PI / 180) }
function toDegrees(radians) { return radians * (180 / Math.PI) }

