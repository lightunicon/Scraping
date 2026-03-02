import { chromium } from "playwright";
import { createWriteStream } from "fs";
import { mkdir } from "fs/promises";
import { join, basename } from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const FORM_PAGE_URL = "https://apps.ci.boca-raton.fl.us/publicdata/";
const TOP_FILES_COUNT = 3;
const DOWNLOAD_DIR = join(__dirname, "..", "Downloads");

async function ensureDownloadDir() {
  await mkdir(DOWNLOAD_DIR, { recursive: true });
}

async function downloadFile(url, destPath) {
  const response = await fetch(url, { redirect: "follow" });
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${url}`);
  const buffer = Buffer.from(await response.arrayBuffer());
  const ws = createWriteStream(destPath);
  return new Promise((resolve, reject) => {
    ws.on("finish", resolve);
    ws.on("error", reject);
    ws.end(buffer);
  });
}

export async function scrapeBocaBusinessFiles(options = {}) {
  const { headless = true } = options;
  const browser = await chromium.launch({
    headless: headless ? true : false,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  try {
    const page = await browser.newPage();
    await page.setViewportSize({ width: 1280, height: 800 });

    await page.goto(FORM_PAGE_URL, { waitUntil: "networkidle", timeout: 30000 });

    await page.locator("#rdoType_0").click();
    await new Promise((r) => setTimeout(r, 800));

    await page.locator("#rdoBTFiles_3").click();
    await new Promise((r) => setTimeout(r, 500));

    await page.locator("#BtnSubmitTax").click();
    await page.locator("#pnlFilesList a[href]").first().waitFor({ state: "visible", timeout: 15000 });

    const links = await page
      .locator("#pnlFilesList ul li a[href]")
      .evaluateAll((anchors) =>
        anchors
          .map((a) => a.getAttribute("href"))
          .filter((href) => href && (href.endsWith(".csv") || href.endsWith(".xlsx")))
      );

    const toDownload = links.slice(0, TOP_FILES_COUNT);
    if (toDownload.length === 0) {
      throw new Error("No file links found in #pnlFilesList");
    }

    await ensureDownloadDir();
    const downloaded = [];

    for (let i = 0; i < toDownload.length; i++) {
      const url = toDownload[i];
      const name = basename(new URL(url).pathname) || `file_${i + 1}`;
      const destPath = join(DOWNLOAD_DIR, name);
      await downloadFile(url, destPath);
      downloaded.push(destPath);
    }

    return { links: toDownload, savedPaths: downloaded };
  } finally {
    await browser.close();
  }
}
