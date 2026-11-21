import express from "express";

import {
  createComplaint,
  getMyComplaints,
  getComplaintById
} from "../controllers/complaint.controller.js";

import {
  protect,
  authorize
} from "../middleware/auth.middleware.js";

import {
  uploadComplaintImages
} from "../middleware/upload.middleware.js";

const router = express.Router();

router.use(protect);

router.post(
  "/",
  authorize("CITIZEN"),
  uploadComplaintImages,
  createComplaint
);

router.get(
  "/my",
  authorize("CITIZEN"),
  getMyComplaints
);

router.get(
  "/:id",
  authorize("CITIZEN"),
  getComplaintById
);

export default router;
