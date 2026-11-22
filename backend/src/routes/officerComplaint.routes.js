
import express from "express";

import {
  protect,
  authorize,
} from "../middleware/auth.middleware.js";

import {
  uploadComplaintImages,
} from "../middleware/upload.middleware.js";

import {
  getAssignedComplaints,
  getAssignedComplaintById,
  updateAssignedComplaintStatus,
} from "../controllers/officerComplaint.controller.js";

const router = express.Router();

router.use(protect, authorize("OFFICER"));

router.get("/complaints", getAssignedComplaints);

router.get("/complaints/:id", getAssignedComplaintById);

router.patch(
  "/complaints/:id/status",
  uploadComplaintImages,
  updateAssignedComplaintStatus
);

export default router;
