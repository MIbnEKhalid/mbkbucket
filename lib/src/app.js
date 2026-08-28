import express from "express";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { engine } from "express-handlebars";
import compression from "compression";
import mbkautheRoutes from "mbkauthe";
import { generalLimiter } from "./middleware/rate-limiter.js";
import { notFoundHandler, globalErrorHandler } from "./middleware/error-handler.js";
import bucketRoutes from "./routes/index.js";
import { packageJson } from "./config/index.js";
import { createLogger } from "#logger";
import { commonHandlebarsHelpers } from "./utils/helpers.js";

const debugServer = createLogger('server');
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const isDevMode = process.env.NODE_ENV === "dev";

export function createApp() {
  const server = express();
  server.set('trust proxy', 1);

  server.use(compression());
  server.use(express.json({ limit: '10mb' }));
  server.use(express.urlencoded({ extended: true, limit: '10mb' }));

  // Static dashboard & helper assets
  const serveAsset = (filename) => (_req, res) => {
    res.set('Cache-Control', 'public, max-age=300, must-revalidate');
    res.sendFile(path.join(__dirname, '..', 'public', filename), (err) => {
      if (err) res.status(err.status || 404).end();
    });
  };

  server.get('/mbkbucket/bucketadmin.css', serveAsset('bucketadmin.css'));
  server.get('/mbkbucket/bucketadmin.js', serveAsset('bucketadmin.js'));
  server.get('/mbkbucket/mbkbucket-helper.css', serveAsset('mbkbucket-helper.css'));
  server.get('/mbkbucket/mbkbucket-helper.js', serveAsset('mbkbucket-helper.js'));
  server.get('/mbkbucket/helper-demo', serveAsset('mbkbucket-helper-demo.html'));

  const rootDir = path.resolve(__dirname, "..", "..");
  const libDir = path.resolve(__dirname, "..");
  const cwd = process.cwd();

  const viewDirs = [
    path.join(rootDir, "views"),
    path.join(libDir, "views"),
    path.join(rootDir, "node_modules", "mbkauthe", "views"),
    path.resolve(cwd, "views"),
    path.resolve(cwd, "node_modules", "mbkauthe", "views"),
  ].filter(dir => fs.existsSync(dir));

  const partialsDir = [
    path.join(rootDir, "views", "templates"),
    path.join(rootDir, "views", "templates", "notice"),
    path.join(rootDir, "views"),
    path.join(rootDir, "views", "partial"),
    path.join(libDir, "views", "templates"),
    path.join(libDir, "views", "templates", "notice"),
    path.join(libDir, "views"),
    path.join(libDir, "views", "partial"),
    path.join(rootDir, "node_modules", "mbkauthe", "views"),
    path.resolve(cwd, "node_modules", "mbkauthe", "views"),
  ].filter(dir => fs.existsSync(dir));

  // Handlebars template engine
  server.engine("handlebars", engine({
    extname: ".handlebars",
    defaultLayout: false,
    partialsDir: [...new Set(partialsDir)],
    cache: process.env.NODE_ENV === "production",
    helpers: {
      ...commonHandlebarsHelpers,
      mbkbucket_cachebuster: () => `?v=${packageJson.version}`
    }
  }));

  server.set("view engine", "handlebars");
  server.set("views", [...new Set(viewDirs)]);

  server.use(mbkautheRoutes);
  server.use(generalLimiter);
  server.use(bucketRoutes);

  if (isDevMode) {
    server.use((req, res, next) => {
      const start = Date.now();
      res.on('finish', () => {
        debugServer('%s %s %s (%sms)', req.method, req.originalUrl, res.statusCode, Date.now() - start);
      });
      next();
    });

    server.get("/", (_req, res) => res.redirect("/mbkbucket"));
  }

  server.use(notFoundHandler);
  server.use(globalErrorHandler);

  return server;
}
