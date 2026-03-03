import { chromium } from "playwright";
import { join, basename } from "path";
import { fileURLToPath } from "url";
import { BOCA_FORM_URL, BOCA_TOP_FILES_COUNT, DOWNLOAD_DIR } from "../config.js";
import { ensureDir, downloadFile } from "../utils/downloader.js";

/**
@param {{ headless?: boolean }} options
@returns {Promise<{ links: string[], savedPaths: string[] }>}
*/
export async function scrapeBocaBusinessFiles(options = {}) {
  const { headless = true } = options;
  const browser = await chromium.launch({
    headless,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  try {
    const page = await browser.newPage();
    await page.setViewportSize({ width: 1280, height: 800 });

    await page.goto(BOCA_FORM_URL, { waitUntil: "networkidle", timeout: 30000 });

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

    const toDownload = links.slice(0, BOCA_TOP_FILES_COUNT);
    if (toDownload.length === 0) {
      throw new Error("No file links found in #pnlFilesList");
    }

    await ensureDir(DOWNLOAD_DIR);
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

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  scrapeBocaBusinessFiles({ headless: true })
    .then((result) => {
      console.log("Done:", result);
    })
    .catch((err) => {
      console.error("Scrape failed:", err);
      process.exit(1);
    });
}
