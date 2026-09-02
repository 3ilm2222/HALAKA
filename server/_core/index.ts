import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import path from "path";
import fs from "fs";
import { createProxyMiddleware } from "http-proxy-middleware";

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

async function startServer() {
  const app = express();
  const server = createServer(app);

  // Enable CORS for all routes - reflect the request origin to support credentials
  app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (origin) {
      res.header("Access-Control-Allow-Origin", origin);
    }
    res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
    res.header(
      "Access-Control-Allow-Headers",
      "Origin, X-Requested-With, Content-Type, Accept, Authorization, X-Teacher-Session",
    );
    res.header("Access-Control-Allow-Credentials", "true");

    // Handle preflight requests
    if (req.method === "OPTIONS") {
      res.sendStatus(200);
      return;
    }
    next();
  });

  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true, timestamp: Date.now() });
  });

  app.post("/api/school-api", async (req, res) => {
    try {
      const projectUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
      const publishableKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY;
      if (!projectUrl || !publishableKey) {
        return res.status(500).json({ error: "لم تكتمل إعدادات الاتصال بخدمة المدرسة السحابية على الخادم." });
      }
      const upstream = await fetch(`${projectUrl}/functions/v1/school-api`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${publishableKey}`,
          apikey: publishableKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(req.body ?? {}),
      });
      const data = await upstream.json().catch(() => ({}));
      return res.status(upstream.status).json(data);
    } catch (error) {
      return res.status(502).json({ error: error instanceof Error ? error.message : "تعذر الاتصال بخدمة المدرسة السحابية." });
    }
  });

  // Proxy web and static assets to Metro bundler on port 8081 or serve exported dist
  const isProduction = process.env.NODE_ENV === "production";
  const metroPort = process.env.EXPO_PORT || "8081";
  const distDir = path.resolve(process.cwd(), "dist");
  const hasDist = fs.existsSync(distDir);

  if (isProduction || hasDist) {
    app.use(express.static(distDir, { extensions: ["html"], index: "index.html" }));
  }

  if (isProduction) {
    app.get("*", (req, res, next) => {
      if (req.path.startsWith("/api") || req.path.startsWith("/manus-storage")) {
        return next();
      }
      const indexPath = path.join(distDir, "index.html");
      if (fs.existsSync(indexPath)) {
        return res.sendFile(indexPath);
      }
      return next();
    });
  } else {
    const metroProxy = createProxyMiddleware({
      target: `http://127.0.0.1:${metroPort}`,
      changeOrigin: true,
      ws: true,
      onProxyReq: (proxyReq) => {
        proxyReq.setHeader("origin", `http://127.0.0.1:${metroPort}`);
        proxyReq.setHeader("host", `127.0.0.1:${metroPort}`);
      },
      onProxyReqWs: (proxyReq) => {
        proxyReq.setHeader("origin", `http://127.0.0.1:${metroPort}`);
        proxyReq.setHeader("host", `127.0.0.1:${metroPort}`);
      },
      onError: (_err, _req, res) => {
        if (hasDist && !res.headersSent) {
          const indexPath = path.join(distDir, "index.html");
          if (fs.existsSync(indexPath)) {
            res.sendFile(indexPath);
            return;
          }
        }
        if (!res.headersSent) {
          res.status(503).send("Development server is starting, please refresh in a few seconds.");
        }
      },
    });

    app.use((req, res, next) => {
      if (
        req.path.startsWith("/api") ||
        req.path.startsWith("/manus-storage")
      ) {
        return next();
      }

      // If static file or route html exists in dist, serve directly
      if (hasDist) {
        const cleanPath = req.path.replace(/^\//, "");
        const directHtml = path.join(distDir, `${cleanPath}.html`);
        if (cleanPath && fs.existsSync(directHtml)) {
          return res.sendFile(directHtml);
        }
      }

      return metroProxy(req, res, next);
    });

    server.on("upgrade", (req, socket, head) => {
      if (!req.url?.startsWith("/api")) {
        metroProxy.upgrade?.(req, socket, head);
      }
    });
  }

  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }

  server.listen(port, "0.0.0.0", () => {
    console.log(`[api] server listening on http://0.0.0.0:${port}`);
  });
}

startServer().catch(console.error);
