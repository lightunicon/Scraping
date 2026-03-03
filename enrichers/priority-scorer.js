/**
 * Priority Score Engine
 *
 * Accepts all signals collected from enrichers and the original permit record,
 * then returns a structured priority result.
 *
 * Scoring rules (additive):
 *   Sign permit in Step 1 data      → +3
 *   "Grand Opening" signal found     → +3
 *   Hiring signal found on LinkedIn  → +2
 *   "Coming Soon" signal found       → +2
 *   LoopNet new tenant found         → +1
 *   No signals                       → 0
 *
 * Priority thresholds:
 *   HIGH   → score ≥ 3  (sign permit alone is already a hot lead)
 *   MEDIUM → score 1–2
 *   LOW    → score 0
 */

/** @typedef {'HIGH'|'MEDIUM'|'LOW'} Priority */

/**
 * @typedef {object} ScorerInput
 * @property {string[]} [googleSignals]    - Signals from Google search enricher
 * @property {string[]} [placesSignals]    - Signals from Google Places enricher
 * @property {boolean}  [hiringSignal]     - True if LinkedIn hiring signal found
 * @property {string[]} [loopnetSignals]   - Signals from LoopNet enricher
 * @property {string}   [permitType]       - Permit type from Step 1 (raw string)
 */

/**
 * @typedef {object} ScorerOutput
 * @property {number}   score
 * @property {Priority} priority
 * @property {string[]} reasons
 */

/** Normalise a list of signal strings to lowercase for matching. */
function normalise(signals = []) {
  return signals.map((s) => s.toLowerCase());
}

/** Check whether any signal includes the given keyword. */
function hasKeyword(signals, keyword) {
  return signals.some((s) => s.includes(keyword));
}

/**
 * Determine whether the permit type string indicates a sign permit.
 * @param {string} permitType
 * @returns {boolean}
 */
function isSignPermit(permitType = "") {
  const lower = permitType.toLowerCase();
  return (
    lower.includes("sign") ||
    lower.includes("signage") ||
    lower.includes("monument sign") ||
    lower.includes("wall sign")
  );
}

/**
 * Calculate priority score from collected enrichment signals.
 *
 * @param {ScorerInput} input
 * @returns {ScorerOutput}
 */
export function calculatePriority(input) {
  const {
    googleSignals  = [],
    placesSignals  = [],
    hiringSignal   = false,
    loopnetSignals = [],
    permitType     = "",
  } = input;

  let score = 0;
  const reasons = [];

  const allSignals = normalise([...googleSignals, ...placesSignals, ...loopnetSignals]);

  // +3 — Sign permit (from Step 1)
  if (isSignPermit(permitType)) {
    score += 3;
    reasons.push("Sign permit found (grand opening in 2–6 weeks)");
  }

  // +3 — Grand Opening signal
  if (hasKeyword(allSignals, "grand opening") || hasKeyword(allSignals, "now open")) {
    score += 3;
    reasons.push("Grand opening announcement found online");
  }

  // +2 — LinkedIn hiring signal
  if (hiringSignal || hasKeyword(allSignals, "hiring") || hasKeyword(allSignals, "we're hiring")) {
    score += 2;
    reasons.push("Hiring ads found (business opening soon)");
  }

  // +2 — Coming Soon signal
  if (
    hasKeyword(allSignals, "coming soon") ||
    hasKeyword(allSignals, "opening soon")
  ) {
    score += 2;
    reasons.push("Coming soon signal found");
  }

  // +1 — LoopNet new tenant
  if (hasKeyword(normalise(loopnetSignals), "loopnet new tenant")) {
    score += 1;
    reasons.push("New tenant listing found on LoopNet");
  }

  /** @type {Priority} */
  const priority = score >= 3 ? "HIGH" : score >= 1 ? "MEDIUM" : "LOW";

  return { score, priority, reasons };
}

