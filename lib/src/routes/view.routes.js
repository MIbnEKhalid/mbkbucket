import express from "express";
import { sessRole } from "mbkauthe";
import { mbkbucketVar } from "../config/index.js";
import { requireBucketView } from "../middleware/bucket-resolver.js";
import { pviewRateLimit } from "../middleware/rate-limiter.js";
import { pviewSecurity } from "../middleware/security.js";
import { viewFile, playerPage, publicView } from "../controllers/view.controller.js";

export function createViewRoutes({ authorization = sessRole('superadmin') } = {}) {
  const viewRouter = express.Router();

  viewRouter.use(requireBucketView);
  viewRouter.get('/player/*key', authorization, playerPage);
  viewRouter.get('/view/*key', authorization, viewFile);

  if (mbkbucketVar?.publiView_enabled) {
    viewRouter.get('/p_view/*key', pviewRateLimit, pviewSecurity, publicView);
  }

  return viewRouter;
}

const router = createViewRoutes();

export default router;
