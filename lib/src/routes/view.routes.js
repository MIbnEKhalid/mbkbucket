import express from "express";
import { sessRole } from "mbkauthe";
import { mbkbucketVar } from "../config/index.js";
import { requireBucketView } from "../middleware/bucket-resolver.js";
import { pviewRateLimit } from "../middleware/rate-limiter.js";
import { pviewSecurity } from "../middleware/security.js";
import { viewFile, playerPage, publicView } from "../controllers/view.controller.js";

const router = express.Router();
const adminAuth = sessRole('SuperAdmin');

router.use(requireBucketView);
router.get('/player/*key', adminAuth, playerPage);
router.get('/view/*key', adminAuth, viewFile);

if (mbkbucketVar?.publiView_enabled) {
  router.get('/p_view/*key', pviewRateLimit, pviewSecurity, publicView);
}

export default router;
