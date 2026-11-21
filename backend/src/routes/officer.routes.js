
import express from "express";

import { protect, authorize } from "../middleware/auth.middleware.js";

import {
  createOfficer,
  getOfficers,
  updateOfficerAssignment,
  updateOfficerStatus,
} from "../controllers/officer.controller.js";

const router = express.Router();

router.use(protect, authorize("ADMIN"));

router.post("/", createOfficer);
router.get("/", getOfficers);
router.patch("/:id", updateOfficerAssignment);
router.patch("/:id/status", updateOfficerStatus);

export default router;
