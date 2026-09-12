/**
 * MBKBucket
 * Copyright (c) 2026 Muhammad Bin Khalid, MBKTech.org and contributors
 * Licensed under the MIT License.
 * Source: https://github.com/MIbnEKhalid/mbkbucket
 */

import express from "express";
import { sessRole } from "mbkauthe";
import path from "path";
import { fileURLToPath } from "url";
import { bucketResolver } from "../middleware/bucket-resolver.js";
import { renderBucketDashboard } from "../controllers/dashboard.controller.js";
import infoRoutes from "./info.routes.js";
import { createViewRoutes } from "./view.routes.js";
import { createApiRoutes } from "./api.routes.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicDir = path.resolve(__dirname, "..", "..", "public");

const serveAsset = (filename) => (_req, res) => {
  res.set("Cache-Control", "public, max-age=300, must-revalidate");
  res.sendFile(path.join(publicDir, filename), (err) => {
    if (err) res.status(err.status || 404).end();
  });
};

export function createBucketRouter({ authorization } = {}) {
  const router = express.Router();
  const defaultAuth = sessRole('superadmin');
  const auths = typeof authorization === 'function'
    ? { view: authorization, upload: authorization, delete: authorization }
    : authorization ?? {};
  const viewAuth = auths.view ?? defaultAuth;
  const uploadAuth = auths.upload ?? defaultAuth;
  const deleteAuth = auths.delete ?? defaultAuth;

  // Static dashboard & helper assets
  router.get('/mbkbucket/bucketadmin.css', serveAsset('bucketadmin.css'));
  router.get('/mbkbucket/bucketadmin.js', serveAsset('bucketadmin.js'));
  router.get('/mbkbucket/mbkbucket-helper.css', serveAsset('mbkbucket-helper.css'));
  router.get('/mbkbucket/mbkbucket-helper.js', serveAsset('mbkbucket-helper.js'));
  router.get('/mbkbucket/helper-demo', serveAsset('mbkbucket-helper-demo.html'));

  router.get('/mbkbucket', viewAuth, renderBucketDashboard);
  router.use(
    '/mbkbucket',
    bucketResolver,
    infoRoutes,
    createViewRoutes({ authorization: viewAuth }),
    createApiRoutes({ viewAuthorization: viewAuth, uploadAuthorization: uploadAuth, deleteAuthorization: deleteAuth })
  );

  return router;
}

const router = createBucketRouter();

export default router;
