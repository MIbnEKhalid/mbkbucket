import express from "express";
import infoRoutes from "./info.js";
import viewRoutes from "./view.js";
import apiRoutes from "./api.js";
import { validateSessionAndRole, renderPage, mbkautheVar } from "mbkauthe";

const router = express.Router();

router.get('/mbkbucket', validateSessionAndRole('SuperAdmin'), async (req, res) => {
  renderPage(req, res, "bucket.handlebars", false, { page: "Admin Bucket", bucketvar: mbkautheVar?.bucket, APP_NAME: mbkautheVar?.APP_NAME, message: req.query.message, error: req.query.error });
});

router.use("/mbkbucket", infoRoutes);
router.use("/mbkbucket", viewRoutes);
router.use("/mbkbucket", apiRoutes);

export default router;