// server.js
const express = require("express");
const next = require("next");
const { createProxyMiddleware } = require("http-proxy-middleware");

const dev = process.env.NODE_ENV !== "production";
const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOSTNAME || "0.0.0.0";

// Optional internal proxy (usually OFF when Nginx is in front)
const ENABLE_PROXY =
  String(process.env.PROXY_API || "false").toLowerCase() === "true";
const API_BASE =
  process.env.SERVER_API_BASE || "http://prostatecancer-backend:8000"; // docker DNS

const app = express();
const nextApp = next({ dev });
const handle = nextApp.getRequestHandler();

// Basic hardening / best practices
app.disable("x-powered-by");
app.set("trust proxy", true); // respect X-Forwarded-*

// Minimal health endpoint (for container/self-check)
app.get("/healthz", (_req, res) => res.status(200).send("ok"));

// Optional: internal /api proxy (ONLY if you are not using Nginx to proxy /api)
if (ENABLE_PROXY) {
  app.use(
    "/api",
    createProxyMiddleware({
      target: API_BASE,
      changeOrigin: true,
      xfwd: true,
      onProxyRes: (proxyRes) => {
        delete proxyRes.headers["x-powered-by"];
        delete proxyRes.headers["x-version"];
      },
    })
  );
}

nextApp
  .prepare()
  .then(() => {
    // Default catch-all handler to allow Next.js to handle all other routes
    app.use((req, res) => handle(req, res));
    // Or: app.all("(.*)", (req, res) => handle(req, res));

    const server = app.listen(PORT, HOST, () => {
      console.log(`[webapp] listening on http://${HOST}:${PORT} (dev=${dev})`);
      if (ENABLE_PROXY) {
        console.log(`[webapp] internal API proxy enabled: /api -> ${API_BASE}`);
      } else {
        console.log(
          `[webapp] internal API proxy disabled (Nginx should proxy /api)`
        );
      }
    });

    // Graceful shutdown
    const shutdown = (sig) => () => {
      console.log(`[webapp] received ${sig}, shutting down...`);
      server.close(() => process.exit(0));
      setTimeout(() => process.exit(1), 5000).unref();
    };
    process.on("SIGTERM", shutdown("SIGTERM"));
    process.on("SIGINT", shutdown("SIGINT"));
  })
  .catch((err) => {
    console.error("[webapp] Failed to prepare Next.js app:", err);
    process.exit(1);
  });
