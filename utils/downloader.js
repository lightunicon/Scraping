import { createWriteStream } from "fs";
import { mkdir } from "fs/promises";

/**
 * @param {string} dir
 */
export async function ensureDir(dir) {
  await mkdir(dir, { recursive: true });
}

/**
 * @param {string} url      
 * @param {string} destPath 
 */
export async function downloadFile(url, destPath) {
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