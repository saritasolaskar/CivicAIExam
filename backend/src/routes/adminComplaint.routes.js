import express from "express";
import { protect, authorize } from "../middleware/auth.middleware.js";

import {
  getAdminComplaints,
  getAdminDepartments,
  assignComplaint,
  getPossibleDuplicates,
  reviewDuplicateComplaint,
} from "../controllers/adminComplaint.controller.js";

const router = express.Router();

router.use(protect, authorize("ADMIN"));

router.get("/departments", getAdminDepartments);

router.get("/possible-duplicates", getPossibleDuplicates);

router.get("/", getAdminComplaints);

router.patch("/:id/assign", assignComplaint);

router.patch("/:id/duplicate-review", reviewDuplicateComplaint);

export default router;