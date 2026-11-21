
import express from "express";
import { protect, authorize } from "../middleware/auth.middleware.js";
import {
  getAdminDashboardOverview,
} from "../controllers/adminDashboard.controller.js";

const router = express.Router();

router.use(protect, authorize("ADMIN"));

router.get("/overview", getAdminDashboardOverview);

export default router;
