/*
 * Example call from n8n HTTP Request node:
 *   Method:  POST
 *   URL:     http://127.0.0.1:3000/api/boca/new-business-files
 *   Response: JSON with { links, savedPaths }
 */
import http from "http";
import { scrapeBocaBusinessFiles } from "./scrapers/boca-scraper.js";

const PORT = process.env.PORT ? Number(process.env.PORT) : 3000;

function sendJson(res, statusCode, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(body),
  });
  res.end(body);
}

const server = http.createServer(async (req, res) => {
  if (req.method === "POST" && req.url === "/api/boca/new-business-files") {
    try {
      const result = await scrapeBocaBusinessFiles({ headless: true });
      return sendJson(res, 200, {
        success: true,
        links: result.links,
        savedPaths: result.savedPaths,
      });
    } catch (err) {
      console.error("Boca scrape failed:", err);
      return sendJson(res, 500, {
        success: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  if (req.method === "GET" && req.url === "/") {
    return sendJson(res, 200, {
      ok: true,
      message: "Boca scraper API is running",
    });
  }

  res.statusCode = 404;
  res.end("Not found");
});

server.listen(PORT, () => {
  console.log(`Boca scraper API listening on http://localhost:${PORT}`);
});

