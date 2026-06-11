import express from "express";
import path from "path";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import mbkautheRoutes from "mbkauthe";
import { engine } from "express-handlebars";
import compression from "compression";
import rateLimit from 'express-rate-limit';
import bucketRoutes from "./lib/routes/index.js";
import { checkVersion } from "./lib/config/index.js";
import { packageJson } from "./lib/config/index.js";
import { createLogger } from "./lib/debug.js";

dotenv.config();
const debugServer = createLogger('server');

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const isDevMode = process.env.NODE_ENV === "dev";

const server = express();
server.set('trust proxy', 1);

server.use(compression());

// Rate limiting: general limiter for typical browsing/API usage and a stricter
// limiter for dashboard (admin) routes.
const generalLimiter = rateLimit({
  windowMs: 2 * 60 * 1000, // 2 minutes
  max: 150, // limit each IP to 150 requests per windowMs
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
  handler: (req, res) => {
    res.status(429).render('error.handlebars', { message: 'Too many requests from your IP. Try again later.', code: 429 });
  }
});

// Increase body size limits to support larger form submissions (e.g., multipart upload init/complete payloads).
// Multipart/form-data uploads themselves are handled separately via multer in the upload endpoints.
server.use(express.json({ limit: '10mb' }));
server.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Serve only specific static assets (limit exposure): CSS and JS used by the dashboard.
// Avoid immutable long cache here because dashboard routes change frequently and stale JS
// can keep writing old URLs in browser history.
const dashboardAssetCacheControl = 'public, max-age=300, must-revalidate';
server.get('/mbkbucket/bucketadmin.css', (req, res) => {
  res.set('Cache-Control', dashboardAssetCacheControl);
  res.sendFile(path.join(__dirname, 'public', 'bucketadmin.css'), (err) => {
    if (err) res.status(err.status || 404).end();
  });
});

server.get('/mbkbucket/bucketadmin.js', (req, res) => {
  res.set('Cache-Control', dashboardAssetCacheControl);
  res.sendFile(path.join(__dirname, 'public', 'bucketadmin.js'), (err) => {
    if (err) res.status(err.status || 404).end();
  });
});

// Configure Handlebars (single setup)
server.engine("handlebars", engine({
  extname: ".handlebars",
  defaultLayout: "main",
  layoutsDir: path.join(__dirname, "../../views/layouts"),
  partialsDir: [
    path.join(__dirname, "views/templates"),
    path.join(__dirname, "views/templates/notice"),
    path.join(__dirname, "views"),
    path.join(__dirname, "views/partial"),
    path.join(__dirname, "node_modules/mbkauthe/views"),
    path.join(__dirname, "../mbkauthe/views")
  ],
  cache: process.env.NODE_ENV === "production",
  helpers: {
    eq: function (a, b) {
      return a === b;
    },
    mbkbucket_cachebuster: function () {
      return "?v=" + packageJson.version;
    }
  }
}));

server.set("view engine", "handlebars");
server.set("views", [
  path.join(__dirname, "views"),
  path.join(__dirname, "node_modules/mbkauthe/views"),
  path.join(__dirname, "../mbkauthe/views")
]);

server.use(mbkautheRoutes);
server.use(generalLimiter);
server.use(bucketRoutes);
if (isDevMode) {
  debugServer("Dev mode is enabled. Starting server in dev mode.");

  // Request timing middleware: logs method, url, status and elapsed ms
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

  // 404 handler
  server.use((req, res) => {
    debugServer("Path not found: %s %s", req.method, req.url);
    return res.status(404).render("Error/dError.handlebars", {
      layout: false,
      code: 404,
      error: "Not Found",
      message: "The requested page was not found.",
      pagename: "Home",
      page: "/",
    });
  });

  // Error handler
  server.use((err, req, res, next) => {
    console.error(`[mbkbucket] ${err.stack}`);
    return res.status(500).render("Error/dError.handlebars", {
      layout: false,
      code: 500,
      error: "Internal app Error",
      message: "An unexpected error occurred on the app.",
      details: err.message,
      pagename: "Home",
      page: "/",
    });
  });

  const port = process.env.PORT || 3004;
  server.listen(port, async() => {
    debugServer("Server running on http://localhost:%s", port);
  });

}

await checkVersion();


export * from "./lib/index.js";
export default server;