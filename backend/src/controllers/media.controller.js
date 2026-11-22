import mongoose from "mongoose";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import Complaint from "../models/Complaint.js";
import MunicipalCorporation from "../models/MunicipalCorporation.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const uploadsDirectory = path.resolve(__dirname, "../../uploads");

const getStoredFilename = (url) => {
  if (typeof url !== "string" || !url.trim()) {
    return "";
  }

  try {
    const pathname = url.startsWith("http")
      ? new URL(url).pathname
      : url.split("?")[0];

    return path.basename(decodeURIComponent(pathname));
  } catch {
    return "";
  }
};

export const getComplaintMedia = async (req, res, next) => {
  try {
    const { complaintId, kind, filename } = req.params;

    if (!mongoose.isValidObjectId(complaintId)) {
      return res.status(404).json({
        success: false,
        message: "Media not found.",
      });
    }

    if (!["complaint", "resolution"].includes(kind)) {
      return res.status(404).json({
        success: false,
        message: "Media not found.",
      });
    }

    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp)$/i.test(filename)
    ) {
      return res.status(404).json({
        success: false,
        message: "Media not found.",
      });
    }

    const complaint = await Complaint.findById(complaintId)
      .select("citizen assignedOfficer corporation media resolution.evidence")
      .lean();

    if (!complaint) {
      return res.status(404).json({
        success: false,
        message: "Media not found.",
      });
    }

    let authorized = false;

    if (req.user.role === "CITIZEN") {
      authorized =
        String(complaint.citizen) === String(req.user._id);
    } else if (req.user.role === "OFFICER") {
      authorized =
        String(complaint.assignedOfficer) === String(req.user._id) &&
        String(complaint.corporation) === String(req.user.corporation);
    } else if (req.user.role === "ADMIN") {
      const pmc = await MunicipalCorporation.findOne({
        code: "PMC",
        isActive: true,
      }).select("_id").lean();

      authorized =
        Boolean(pmc) &&
        String(complaint.corporation) === String(pmc._id);
    }

    if (!authorized) {
      return res.status(404).json({
        success: false,
        message: "Media not found.",
      });
    }

    const mediaItems =
      kind === "complaint"
        ? complaint.media || []
        : complaint.resolution?.evidence || [];

    const belongsToComplaint = mediaItems.some(
      (item) =>
        item.mediaType === "IMAGE" &&
        getStoredFilename(item.url) === filename
    );

    if (!belongsToComplaint) {
      return res.status(404).json({
        success: false,
        message: "Media not found.",
      });
    }

    const folder =
      kind === "complaint" ? "complaints" : "resolutions";

    const filePath = path.resolve(
      uploadsDirectory,
      folder,
      filename
    );

    const expectedDirectory = path.resolve(
      uploadsDirectory,
      folder
    );

    if (path.dirname(filePath) !== expectedDirectory) {
      return res.status(404).json({
        success: false,
        message: "Media not found.",
      });
    }

    const contentTypes = {
      jpg: "image/jpeg",
      png: "image/png",
      webp: "image/webp",
    };

    const extension = path.extname(filename).slice(1).toLowerCase();

    if (!contentTypes[extension]) {
      return res.status(404).json({
        success: false,
        message: "Media not found.",
      });
    }

    const fileStream = fs.createReadStream(filePath);

    fileStream.on("error", (error) => {
      if (error.code === "ENOENT") {
        if (!res.headersSent) {
          return res.status(404).json({
            success: false,
            message: "Media file not found.",
          });
        }
      }

      if (!res.headersSent) {
        next(error);
      } else {
        res.destroy(error);
      }
    });

    res.set({
      "Content-Type": contentTypes[extension],
      "Content-Disposition": "inline",
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    });

    return fileStream.pipe(res);
  } catch (error) {
    next(error);
  }
};
