// Utilidades de ubicación: obtiene la posición del dispositivo y, si hay red,
// traduce las coordenadas a un nombre de lugar (geocodificación inversa).
// Si no hay conexión, se queda con las coordenadas.

export function getCurrentPosition(options = {}) {
  return new Promise((resolve, reject) => {
    if (!('geolocation' in navigator)) {
      reject(new Error('Este dispositivo no permite ubicación.'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy }),
      (err) => reject(err),
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000, ...options }
    );
  });
}

// Geocodificación inversa con OpenStreetMap (Nominatim). Gratuito, sin clave.
export async function reverseGeocode(lat, lng) {
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&zoom=14&accept-language=es`;
    const res = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!res.ok) throw new Error('sin respuesta');
    const data = await res.json();
    const a = data.address || {};
    const place = a.city || a.town || a.village || a.municipality || a.county || a.state || '';
    const country = a.country || '';
    const label = [place, country].filter(Boolean).join(', ');
    return label || data.display_name || null;
  } catch (_) {
    return null; // Sin red: devolvemos null y mostramos las coordenadas.
  }
}

export function formatCoords(lat, lng) {
  return `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
}

export function mapLink(lat, lng) {
  return `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=15/${lat}/${lng}`;
}
