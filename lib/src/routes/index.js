import express from "express";
import { sessRole } from "mbkauthe";
import { bucketResolver } from "../middleware/bucket-resolver.js";
import { renderBucketDashboard } from "../controllers/dashboard.controller.js";
import infoRoutes from "./info.routes.js";
import viewRoutes from "./view.routes.js";
import apiRoutes from "./api.routes.js";

const router = express.Router();

router.get('/mbkbucket', sessRole('SuperAdmin'), renderBucketDashboard);
router.use('/mbkbucket', bucketResolver, infoRoutes, viewRoutes, apiRoutes);

export default router;
