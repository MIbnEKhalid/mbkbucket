import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { engine } from "express-handlebars";
import compression from "compression";
import mbkautheRoutes from "mbkauthe";
import { generalLimiter } from "./middleware/rate-limiter.js";
import { notFoundHandler, globalErrorHandler } from "./middleware/error-handler.js";
import bucketRoutes from "./routes/index.js";
import { packageJson } from "./config/index.js";
import { createLogger } from "./utils/logger.js";
import { commonHandlebarsHelpers } from "./utils/helpers.js";

const debugServer = createLogger('server');

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const isDevMode = process.env.NODE_ENV === "dev";

/**
 * Creates and configures the Express application.
 * @returns {express.Application}
 */
export function createApp() {
  const server = express();
  server.set('trust proxy', 1);

  // Compression
  server.use(compression());

  // Body parsing
  server.use(express.json({ limit: '10mb' }));
  server.use(express.urlencoded({ extended: true, limit: '10mb' }));

  // Static assets (CSS/JS for dashboard)
  const dashboardAssetCacheControl = 'public, max-age=300, must-revalidate';
  const serveAsset = (filename) => (req, res) => {
    res.set('Cache-Control', dashboardAssetCacheControl);
    res.sendFile(path.join(__dirname, '..', 'public', filename), (err) => {
      if (err) res.status(err.status || 404).end();
    });
  };

  server.get('/mbkbucket/bucketadmin.css', serveAsset('bucketadmin.css'));
  server.get('/mbkbucket/bucketadmin.js', serveAsset('bucketadmin.js'));

  // Frontend helper utilities (drop-in for any HTML page)
  server.get('/mbkbucket/mbkbucket-helper.css', serveAsset('mbkbucket-helper.css'));
  server.get('/mbkbucket/mbkbucket-helper.js', serveAsset('mbkbucket-helper.js'));

  // Helper component demo page (no auth — purely static HTML)
  server.get('/mbkbucket/helper-demo', serveAsset('mbkbucket-helper-demo.html'));

  // Handlebars configuration
  server.engine("handlebars", engine({
    extname: ".handlebars",
    defaultLayout: false,
    partialsDir: [
      path.join(__dirname, "..", "views", "templates"),
      path.join(__dirname, "..", "views", "templates", "notice"),
      path.join(__dirname, "..", "views"),
      path.join(__dirname, "..", "views", "partial"),
      path.join(__dirname, "..", "node_modules", "mbkauthe", "views"),
      path.join(__dirname, "..", "..", "mbkauthe", "views")
    ],
    cache: process.env.NODE_ENV === "production",
    helpers: {
      ...commonHandlebarsHelpers,
      mbkbucket_cachebuster: function () {
        return "?v=" + packageJson.version;
      }
    }
  }));

  server.set("view engine", "handlebars");
  server.set("views", [
    path.join(__dirname, "..", "views"),
    path.join(__dirname, "..", "node_modules", "mbkauthe", "views"),
    path.join(__dirname, "..", "..", "mbkauthe", "views")
  ]);

  // Auth routes
  server.use(mbkautheRoutes);

  // Rate limiting
  server.use(generalLimiter);

  // Bucket routes
  server.use(bucketRoutes);

  // Dev-mode request timing
  if (isDevMode) {
    debugServer("Dev mode is enabled. Starting server in dev mode.");

    server.use((req, res, next) => {
      const start = process.hrtime();
      res.on('finish', () => {
        const diff = process.hrtime(start);
        const ms = diff[0] * 1000 + diff[1] / 1e6;
        debugServer("[%s] %s %s %s - %s ms", new Date().toISOString(), req.method, req.originalUrl, res.statusCode, ms.toFixed(3));
      });
      next();
    });

    server.get("/", async (req, res) => {
      res.redirect("/mbkbucket");
    });
  }

  // Error handlers
  server.use(notFoundHandler);
  server.use(globalErrorHandler);

  return server;
}
