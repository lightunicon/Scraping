/*
 * Example call from n8n HTTP Request node:
 *   Method:  POST
 *   URL:     http://127.0.0.1:3000/api/boca/new-business-files
 *   Response: JSON with { links, savedPaths }
 */
import http from "http";
import { PORT } from "./config.js";
import { handleNewBusinessFiles, handleHealthCheck } from "./routes/boca.js";

function sendJson(res, statusCode, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(body),
  });
  res.end(body);
}

const routes = [
  { method: "POST", url: "/api/boca/new-business-files", handler: handleNewBusinessFiles },
  { method: "GET",  url: "/",                            handler: handleHealthCheck },
];

const server = http.createServer((req, res) => {
  const route = routes.find((r) => r.method === req.method && r.url === req.url);
  if (route) return route.handler(req, res, sendJson);

  res.statusCode = 404;
  res.end("Not found");
});

server.listen(PORT, () => {
  console.log(`Boca scraper API listening on http://localhost:${PORT}`);
});

