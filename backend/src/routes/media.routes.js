import express from "express";

import { protect } from "../middleware/auth.middleware.js";
import { getComplaintMedia } from "../controllers/media.controller.js";

const router = express.Router();

router.get(
  "/:complaintId/:kind/:filename",
  protect,
  getComplaintMedia
);

export default router;
