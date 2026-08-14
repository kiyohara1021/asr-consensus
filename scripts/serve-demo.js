#!/usr/bin/env node
"use strict";

const fs = require("fs");
const http = require("http");
const path = require("path");

const root = path.resolve(__dirname, "..");
const port = Number(process.env.PORT || 4173);
const routes = new Map([
  ["/", "demo/index.html"],
  ["/index.html", "demo/index.html"],
  ["/app.js", "demo/app.js"],
  ["/style.css", "demo/style.css"],
  ["/src/core.js", "src/core.js"],
  ["/fixtures/primary.json", "fixtures/primary.json"],
  ["/fixtures/comparison-a.json", "fixtures/comparison-a.json"],
  ["/fixtures/comparison-b.json", "fixtures/comparison-b.json"],
]);
const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
};

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  console.error("PORT must be an integer between 1 and 65535");
  process.exit(2);
}

const server = http.createServer((request, response) => {
  const pathname = new URL(request.url, "http://localhost").pathname;
  const route = routes.get(pathname);
  if (!route || (request.method !== "GET" && request.method !== "HEAD")) {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Not found\n");
    return;
  }
  const file = path.join(root, route);
  response.writeHead(200, {
    "Content-Type": types[path.extname(file)] || "application/octet-stream",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": "default-src 'self'; style-src 'self'; script-src 'self'; object-src 'none'; base-uri 'none'",
  });
  if (request.method === "HEAD") response.end();
  else fs.createReadStream(file).pipe(response);
});

server.listen(port, "127.0.0.1", () => {
  console.log(`asr-consensus demo: http://127.0.0.1:${port}`);
  console.log("Press Ctrl+C to stop.");
});
