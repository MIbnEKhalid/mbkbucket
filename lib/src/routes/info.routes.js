import express from "express";
import { infoPage, infoJson } from "../controllers/info.controller.js";

const router = express.Router();

router.get(['/info', '/i'], infoPage);
router.get(['/info.json', '/i.json'], infoJson);

export default router;
