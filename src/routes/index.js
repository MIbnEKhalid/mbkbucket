import express from "express";
import { sessRole } from "mbkauthe";
import { bucketResolver } from "../middleware/bucket-resolver.js";
import { renderBucketDashboard } from "../controllers/dashboard.controller.js";
import infoRoutes from "./info.routes.js";
import viewRoutes from "./view.routes.js";
import apiRoutes from "./api.routes.js";

const router = express.Router();

// Dashboard home
router.get('/mbkbucket', sessRole('SuperAdmin'), renderBucketDashboard);

// Central bucket resolution for all /mbkbucket subroutes
router.use('/mbkbucket', bucketResolver);

// Mount sub-routers
router.use("/mbkbucket", infoRoutes);
router.use("/mbkbucket", viewRoutes);
router.use("/mbkbucket", apiRoutes);

export default router;
