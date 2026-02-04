import express from "express";
import path from "path";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import mbkauthe from "mbkauthe";
import { engine } from "express-handlebars";
import compression from "compression";
import rateLimit from 'express-rate-limit';
import bucket from "./lib/bucket.js";
import { checkVersion } from "./lib/config/index.js";
import { appVersion } from "./lib/config/index.js";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const assetVersion = appVersion;

const server = express();
server.set('trust proxy', 1);

server.use(compression());
server.use((req, res, next) => {
  res.locals.assetVersion = assetVersion;
  next();
});

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

server.use(express.json());
server.use(express.urlencoded({ extended: true }));

// Serve only specific static assets (limit exposure): CSS and JS used by the dashboard
// This replaces serving the entire /public directory.
const staticMaxAgeSeconds = 90 * 24 * 60 * 60; // 90 days
server.get('/mbkbucket/bucketadmin.css', (req, res) => {
  res.set('Cache-Control', `public, max-age=${staticMaxAgeSeconds}, immutable`);
  res.sendFile(path.join(__dirname, 'public', 'bucketadmin.css'), (err) => {
    if (err) res.status(err.status || 404).end();
  });
});
server.get('/mbkbucket/bucketadmin.js', (req, res) => {
  res.set('Cache-Control', `public, max-age=${staticMaxAgeSeconds}, immutable`);
  res.sendFile(path.join(__dirname, 'public', 'bucketadmin.js'), (err) => {
    if (err) res.status(err.status || 404).end();
  });
});

// Configure Handlebars (single setup)
server.engine("handlebars", engine({
  extname: ".handlebars",
  defaultLayout: "main",
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
    formatDate: (date) => {
      return new Date(date).toLocaleString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: true
      });
    },
    in: function (value, list) {
      if (!list || !Array.isArray(list)) return false;
      return list.includes(parseInt(value) || value);
    },
    trim: function (str) {
      return str ? str.trim() : '';
    },
    eq: function (a, b) {
      return a === b;
    },
    encodeURIComponent: function (str) {
      return encodeURIComponent(str);
    },
    formatTimestamp: function (timestamp) {
      return new Date(timestamp).toLocaleString();
    },
    jsonStringify: function (context) {
      return JSON.stringify(context);
    },
    truncate: (str, len) => {
      if (!str) return '';
      if (str.length > len) {
        return str.substring(0, len) + '...';
      }
      return str;
    },
    section: function (name, options) {
      if (!this._sections) this._sections = {};
      this._sections[name] = options.fn(this);
      return null;
    },
    getCanonicalUrl: function (req, path) {
      const protocol = req.protocol || 'https';
      const host = req.get('host') || 'blog.mbktechstudio.com';
      return `${protocol}://${host}${path}`;
    },
    index: function (array, idx) {
      return array ? array[idx] : null;
    },
    add: function (a, b) {
      return Number(a) + Number(b);
    },
    subtract: function (a, b) {
      return Number(a) - Number(b);
    },
    gt: function (a, b) {
      return Number(a) > Number(b);
    },
    gte: function (a, b) {
      return Number(a) >= Number(b);
    },
    lte: function (a, b) {
      return Number(a) <= Number(b);
    },
    and: function () {
      return Array.prototype.slice.call(arguments, 0, -1).every(Boolean);
    },
    or: function () {
      return Array.prototype.slice.call(arguments, 0, -1).some(Boolean);
    },
    range: function (start, end) {
      const result = [];
      for (let i = start; i < end; i++) {
        result.push(i);
      }
      return result;
    }
  }
}));

server.set("view engine", "handlebars");
server.set("views", [
  path.join(__dirname, "views"),
  path.join(__dirname, "node_modules/mbkauthe/views"),
  path.join(__dirname, "../mbkauthe/views")
]);

server.use(mbkauthe);
server.use(generalLimiter);
server.use(bucket);

if (process.env.mbkbucket_test === "dev") {

  console.log("[mbkbucket] Dev mode is enabled. Starting server in dev mode.");


  // Request timing middleware: logs method, url, status and elapsed ms
  server.use((req, res, next) => {
    const start = process.hrtime();
    res.on('finish', () => {
      const diff = process.hrtime(start);
      const ms = diff[0] * 1000 + diff[1] / 1e6;
      console.log(`[mbkbucket] [${new Date().toISOString()}] ${req.method} ${req.originalUrl} ${res.statusCode} - ${ms.toFixed(3)} ms`);
    });
    next();
  });

  server.get("/", async (req, res) => {
    res.redirect("/mbkbucket");
  });

  // 404 handler
  server.use((req, res) => {
    console.log(`[mbkbucket] Path not found: ${req.method} ${req.url}`);
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
  server.listen(port, async () => {
    console.log(`[mbkbucket] Server running on http://localhost:${port}`);
  });

}

await checkVersion();


export * from "./lib/index.js";
export default server;