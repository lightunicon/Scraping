import "dotenv/config";
import { join } from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export const PORT = process.env.PORT ? Number(process.env.PORT) : 3000;

export const BOCA_FORM_URL = "https://apps.ci.boca-raton.fl.us/publicdata/";
export const BOCA_TOP_FILES_COUNT = 3;
export const DOWNLOAD_DIR = join(__dirname, "Downloads");

// Step 2 – Enrichment API keys
export const SERPAPI_KEY          = process.env.SERPAPI_KEY          ?? "";
export const GOOGLE_PLACES_API_KEY = process.env.GOOGLE_PLACES_API_KEY ?? "";

// Which Google-search backend to use when SerpAPI key is absent
// Values: "serpapi" | "playwright"
export const GOOGLE_SEARCH_BACKEND = process.env.GOOGLE_SEARCH_BACKEND ?? "serpapi";