import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";
import { handleLineWebhookEvent, verifyLineSignature } from "../routers/line";

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
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
  // Configure body parser with larger size limit for file uploads
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
  // OAuth callback under /api/oauth/callback
  registerOAuthRoutes(app);
  // LINE Webhook
  app.post("/api/line/webhook", express.raw({ type: "application/json" }), async (req, res) => {
    try {
      const rawBody = req.body.toString();
      const signature = req.headers["x-line-signature"] as string;

      if (!verifyLineSignature(rawBody, signature)) {
        console.warn("[LINE] Invalid signature");
        res.status(401).json({ error: "Invalid signature" });
        return;
      }

      const body = JSON.parse(rawBody);
      const events = body.events ?? [];

      // 非同期で処理（LINEは素早くレスポンスを返す必要がある）
      Promise.all(events.map((event: any) => handleLineWebhookEvent(event))).catch(
        (err) => console.error("[LINE] Webhook processing error:", err)
      );

      res.status(200).json({ status: "ok" });
    } catch (err) {
      console.error("[LINE] Webhook error:", err);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // tRPC API
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );
  // development mode uses Vite, production mode uses static files
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }

  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
  });
}

startServer().catch(console.error);
