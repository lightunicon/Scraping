import { GOOGLE_PLACES_API_KEY } from "../config.js";

const PLACES_BASE = "https://maps.googleapis.com/maps/api/place";

/**
 * Find a place by text query and return its place_id.
 * @param {string} query
 * @returns {Promise<string|null>}
 */
async function findPlaceId(query) {
  const url = new URL(`${PLACES_BASE}/findplacefromtext/json`);
  url.searchParams.set("input",      query);
  url.searchParams.set("inputtype",  "textquery");
  url.searchParams.set("fields",     "place_id,name");
  url.searchParams.set("key",        GOOGLE_PLACES_API_KEY);

  const res  = await fetch(url.toString());
  if (!res.ok) throw new Error(`Places findplace HTTP ${res.status}`);
  const data = await res.json();

  if (data.status !== "OK" || !data.candidates?.length) return null;
  return data.candidates[0].place_id;
}

/**
 * Fetch full place details for a given place_id.
 * @param {string} placeId
 * @returns {Promise<object>}
 */
async function fetchPlaceDetails(placeId) {
  const url = new URL(`${PLACES_BASE}/details/json`);
  url.searchParams.set(
    "fields",
    "name,formatted_phone_number,website,business_status,rating,opening_hours"
  );
  url.searchParams.set("place_id", placeId);
  url.searchParams.set("key",      GOOGLE_PLACES_API_KEY);

  const res  = await fetch(url.toString());
  if (!res.ok) throw new Error(`Places details HTTP ${res.status}`);
  const data = await res.json();

  if (data.status !== "OK") throw new Error(`Places details status: ${data.status}`);
  return data.result;
}

/**
 * Normalise the business_status field into our expected values.
 * Google returns: OPERATIONAL | CLOSED_TEMPORARILY | CLOSED_PERMANENTLY
 * We also inject "coming_soon" when the place is found but not yet operational
 * and opening_hours suggests it is not open yet.
 *
 * @param {object} place  Raw Google place details object
 * @returns {string}
 */
function resolveStatus(place) {
  const status = (place.business_status ?? "").toUpperCase();
  if (status === "CLOSED_TEMPORARILY") return "CLOSED_TEMPORARILY";
  if (status === "CLOSED_PERMANENTLY") return "CLOSED_PERMANENTLY";

  // Heuristic: if listed but no opening_hours yet, treat as coming_soon
  if (status === "OPERATIONAL" && !place.opening_hours) return "coming_soon";
  return status || "UNKNOWN";
}

/**
 * Enrich a permit record using the Google Places API.
 *
 * @param {{ address: string, businessName?: string }} record
 * @returns {Promise<{
 *   businessName: string,
 *   phone: string,
 *   website: string,
 *   openingStatus: string,
 *   rating: number|null,
 *   signals: string[]
 * }>}
 */
export async function getPlaceDetails(record) {
  if (!GOOGLE_PLACES_API_KEY) throw new Error("GOOGLE_PLACES_API_KEY is not set in environment");

  const { address, businessName } = record;
  // Prefer searching with business name for precision, fall back to address only
  const query = businessName ? `${businessName} ${address}` : address;

  const placeId = await findPlaceId(query);
  if (!placeId) {
    return { businessName: "", phone: "", website: "", openingStatus: "NOT_FOUND", rating: null, signals: [] };
  }

  const place        = await fetchPlaceDetails(placeId);
  const openingStatus = resolveStatus(place);

  const signals = [];
  if (openingStatus === "coming_soon")       signals.push("coming soon");
  if (openingStatus === "CLOSED_TEMPORARILY") signals.push("closed temporarily");

  return {
    businessName:  place.name                     ?? "",
    phone:         place.formatted_phone_number   ?? "",
    website:       place.website                  ?? "",
    openingStatus,
    rating:        place.rating                   ?? null,
    signals,
  };
}

