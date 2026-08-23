import express from "express";
import { sessRole } from "mbkauthe";
import { mbkbucketVar } from "../config/index.js";
import { requireBucketView } from "../middleware/bucket-resolver.js";
import { pviewRateLimit } from "../middleware/rate-limiter.js";
import { pviewSecurity } from "../middleware/security.js";
import { viewFile, playerPage, publicView } from "../controllers/view.controller.js";

const router = express.Router();

// Bucket guard for view routes (skips p_view)
router.use(requireBucketView);

// Player page for video/audio
router.get('/player/*key', sessRole('SuperAdmin'), playerPage);

// Inline file view
router.get('/view/*key', sessRole('SuperAdmin'), viewFile);

// Public view (conditionally enabled)
if (mbkbucketVar?.publiView_enabled) {
  router.get('/p_view/*key', pviewRateLimit, pviewSecurity, publicView);
}

export default router;
