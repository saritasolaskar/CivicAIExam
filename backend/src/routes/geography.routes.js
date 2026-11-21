import express from "express";

import {
  getAdministrativeOffices,
  getZones,
  getPrabhags,
  locateComplaintArea
} from "../controllers/geography.controller.js";


const router = express.Router();

router.get("/offices", getAdministrativeOffices);
router.get("/zones", getZones);
router.get("/prabhags", getPrabhags);
router.get("/locate", locateComplaintArea);
export default router;