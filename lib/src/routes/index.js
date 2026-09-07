/**
 * MBKBucket
 * Copyright (c) 2026 Muhammad Bin Khalid, MBKTech.org and contributors
 * Licensed under the MIT License.
 * Source: https://github.com/MIbnEKhalid/mbkbucket
 */

import express from "express";
import { sessRole } from "mbkauthe";
import { bucketResolver } from "../middleware/bucket-resolver.js";
import { renderBucketDashboard } from "../controllers/dashboard.controller.js";
import infoRoutes from "./info.routes.js";
import viewRoutes from "./view.routes.js";
import apiRoutes from "./api.routes.js";

const router = express.Router();

router.get('/mbkbucket', sessRole('superadmin'), renderBucketDashboard);
router.use('/mbkbucket', bucketResolver, infoRoutes, viewRoutes, apiRoutes);

export default router;
