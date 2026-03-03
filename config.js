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