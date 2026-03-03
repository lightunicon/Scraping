/**
 * Step 2 – Enrichment Orchestrator
 *
 * Accepts a single permit record (from Step 1 scraper output) and returns a
 * fully enriched record with identity signals, contact details, and priority.
 *
 * Enrichers run in parallel where possible; failures are caught individually
 * so one broken enricher never blocks the others.
 */

import { SERPAPI_KEY, GOOGLE_SEARCH_BACKEND, GOOGLE_PLACES_API_KEY } from "../config.js";
import { googleSearch as googleSearchSerpApi }   from "./google-search-serpapi.js";
import { googleSearch as googleSearchPlaywright } from "./google-search-playwright.js";
import { getPlaceDetails }    from "./google-places.js";
import { checkLinkedInHiring } from "./linkedin.js";
import { scrapeLoopNet }       from "./loopnet.js";
import { calculatePriority }   from "./priority-scorer.js";

/**
 * Select the Google Search enricher based on config / available keys.
 * @returns {(record: object) => Promise<object>}
 */
function selectGoogleSearchEnricher() {
  if (GOOGLE_SEARCH_BACKEND === "serpapi" && SERPAPI_KEY) return googleSearchSerpApi;
  return googleSearchPlaywright;
}

/**
 * Safely call an async enricher; on error return a fallback object and log a warning.
 * @template T
 * @param {string} name
 * @param {() => Promise<T>} fn
 * @param {T} fallback
 * @returns {Promise<T>}
 */
async function safeCall(name, fn, fallback) {
  try {
    return await fn();
  } catch (err) {
    console.warn(`[enrich] ${name} failed: ${err.message}`);
    return fallback;
  }
}

/**
 * @typedef {object} PermitRecord
 * @property {string} address
 * @property {string} [businessName]
 * @property {string} [plazaName]
 * @property {string} [email]
 * @property {string} [permitType]
 * @property {string} [filingDate]
 * @property {string} [city]
 */

/**
 * @typedef {object} EnrichedRecord
 * @property {string}   businessName
 * @property {string}   address
 * @property {string}   phone
 * @property {string}   email
 * @property {string}   website
 * @property {string}   instagram
 * @property {string}   facebook
 * @property {string}   linkedin
 * @property {string}   permitType
 * @property {string}   filingDate
 * @property {string}   openingStatus
 * @property {number}   rating
 * @property {string}   priority
 * @property {number}   score
 * @property {string[]} reasons
 * @property {string}   notes
 */

/**
 * Enrich a single permit record with identity signals and a priority score.
 *
 * @param {PermitRecord} record
 * @returns {Promise<EnrichedRecord>}
 */
export async function enrichRecord(record) {
  const googleSearch = selectGoogleSearchEnricher();

  const googleFallback  = { businessName: "", website: "", instagram: "", facebook: "", linkedin: "", signals: [] };
  const placeFallback   = { businessName: "", phone: "", website: "", openingStatus: "UNKNOWN", rating: null, signals: [] };
  const linkedinFallback = { hiringSignalFound: false, linkedinUrl: "", signals: [] };
  const loopnetFallback  = { tenantName: "", leaseDate: "", businessType: "", loopnetUrl: "", signals: [] };

  // Phase 1 — run independent enrichers in parallel
  // LinkedIn depends on a resolved business name so it runs in Phase 2.
  const [googleResult, placeResult, loopnetResult] = await Promise.all([
    safeCall("GoogleSearch", () => googleSearch(record),                                                                     googleFallback),
    safeCall("GooglePlaces", () => GOOGLE_PLACES_API_KEY ? getPlaceDetails(record) : Promise.resolve(placeFallback),         placeFallback),
    safeCall("LoopNet",      () => scrapeLoopNet(record),                                                                    loopnetFallback),
  ]);

  // Phase 2 — LinkedIn needs best available business name from Phase 1
  const resolvedName = record.businessName || placeResult.businessName || googleResult.businessName || loopnetResult.tenantName || "";
  const linkedinResult = await safeCall(
    "LinkedIn",
    () => checkLinkedInHiring({ businessName: resolvedName, city: record.city }),
    linkedinFallback
  );

  // Resolve best business name across enrichers (prefer Places > Google > LoopNet > original)
  const businessName =
    placeResult.businessName  ||
    googleResult.businessName ||
    loopnetResult.tenantName  ||
    record.businessName       ||
    "";

  // Resolve best website
  const website = placeResult.website || googleResult.website || "";

  // Resolve LinkedIn URL (Places doesn't return one; merge from Google + dedicated check)
  const linkedin = linkedinResult.linkedinUrl || googleResult.linkedin || "";

  // Collect all signals for priority scoring
  const { score, priority, reasons } = calculatePriority({
    googleSignals:  googleResult.signals,
    placesSignals:  placeResult.signals,
    hiringSignal:   linkedinResult.hiringSignalFound,
    loopnetSignals: loopnetResult.signals,
    permitType:     record.permitType ?? "",
  });

  // Build raw notes string for reference
  const allSignals = [
    ...googleResult.signals,
    ...placeResult.signals,
    ...linkedinResult.signals,
    ...loopnetResult.signals,
  ];
  const notes = allSignals.length ? allSignals.join("; ") : "No signals detected";

  return {
    // Identity
    businessName,
    address:       record.address      ?? "",
    phone:         placeResult.phone   ?? "",
    email:         record.email        ?? "",
    website,
    // Social
    instagram:     googleResult.instagram ?? "",
    facebook:      googleResult.facebook  ?? "",
    linkedin,
    // Permit fields from Step 1
    permitType:    record.permitType   ?? "",
    filingDate:    record.filingDate   ?? "",
    // Places metadata
    openingStatus: placeResult.openingStatus ?? "UNKNOWN",
    rating:        placeResult.rating        ?? null,
    // Priority
    priority,
    score,
    reasons,
    notes,
  };
}

