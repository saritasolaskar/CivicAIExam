import mongoose from "mongoose";

import MunicipalCorporation from "../models/MunicipalCorporation.js";
import AdministrativeOffice from "../models/AdministrativeOffice.js";
import Zone from "../models/Zone.js";
import Prabhag from "../models/Prabhag.js";

import {
  findPMCGeographyByCoordinates,
} from "../services/geography.service.js";

const getPMC = async () => {
  const pmc = await MunicipalCorporation.findOne({
    code: "PMC",
    isActive: true,
  }).select("_id name code");

  if (!pmc) {
    const error = new Error("PMC corporation record not found.");
    error.statusCode = 404;
    throw error;
  }

  return pmc;
};

// GET /api/v1/geography/offices
export const getAdministrativeOffices = async (req, res, next) => {
  try {
    const pmc = await getPMC();

    const offices = await AdministrativeOffice.find({
      corporation: pmc._id,
      isActive: true,
    })
      .select("name code officeType address zone boundary")
      .populate("zone", "name code")
      .sort({ name: 1 })
      .lean();

    return res.status(200).json({
      success: true,
      corporation: pmc,
      count: offices.length,
      data: offices,
    });
  } catch (error) {
    next(error);
  }
};

// GET /api/v1/geography/zones
export const getZones = async (req, res, next) => {
  try {
    const pmc = await getPMC();

    const zones = await Zone.find({
      corporation: pmc._id,
      isActive: true,
    })
      .select("name code")
      .sort({ name: 1 })
      .lean();

    return res.status(200).json({
      success: true,
      corporation: pmc,
      count: zones.length,
      data: zones,
    });
  } catch (error) {
    next(error);
  }
};

// GET /api/v1/geography/prabhags
export const getPrabhags = async (req, res, next) => {
  try {
    const pmc = await getPMC();

    const filter = {
      corporation: pmc._id,
      isActive: true,
    };

    if (req.query.officeId) {
      if (!mongoose.isValidObjectId(req.query.officeId)) {
        return res.status(400).json({
          success: false,
          message: "Invalid officeId.",
        });
      }

      filter.administrativeOffice = req.query.officeId;
    }

    const prabhags = await Prabhag.find(filter)
      .select("name number administrativeOffice boundary")
      .populate("administrativeOffice", "name code")
      .sort({ number: 1 })
      .lean();

    return res.status(200).json({
      success: true,
      corporation: pmc,
      count: prabhags.length,
      data: prabhags,
    });
  } catch (error) {
    next(error);
  }
};

// GET /api/v1/geography/locate?latitude=18.5204&longitude=73.8567
export const locateComplaintArea = async (req, res, next) => {
  try {
    if (
      req.query.latitude === undefined ||
      req.query.longitude === undefined ||
      req.query.latitude === "" ||
      req.query.longitude === ""
    ) {
      return res.status(400).json({
        success: false,
        message: "Provide both latitude and longitude.",
      });
    }

    const latitude = Number(req.query.latitude);
    const longitude = Number(req.query.longitude);

    if (
      !Number.isFinite(latitude) ||
      !Number.isFinite(longitude) ||
      latitude < -90 ||
      latitude > 90 ||
      longitude < -180 ||
      longitude > 180
    ) {
      return res.status(400).json({
        success: false,
        message: "Provide valid latitude and longitude values.",
      });
    }

    const result = await findPMCGeographyByCoordinates(
      longitude,
      latitude
    );

    return res.status(200).json({
      success: true,

      coordinates: {
        latitude,
        longitude,
      },

      ...result,
    });
  } catch (error) {
    next(error);
  }
};