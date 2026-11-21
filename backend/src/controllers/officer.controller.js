
import mongoose from "mongoose";

import User from "../models/User.js";
import MunicipalCorporation from "../models/MunicipalCorporation.js";
import Department from "../models/Department.js";
import AdministrativeOffice from "../models/AdministrativeOffice.js";

const getPMC = async () => {
  const pmc = await MunicipalCorporation.findOne({
    code: "PMC",
    isActive: true,
  }).select("_id name code");

  if (!pmc) {
    const error = new Error("PMC corporation not found.");
    error.statusCode = 404;
    throw error;
  }

  return pmc;
};

const validateOfficerAssignment = async (
  pmcId,
  departmentId,
  officeId
) => {
  if (
    !mongoose.isValidObjectId(departmentId) ||
    !mongoose.isValidObjectId(officeId)
  ) {
    const error = new Error(
      "Valid departmentId and officeId are required."
    );
    error.statusCode = 400;
    throw error;
  }

  const [department, office] = await Promise.all([
    Department.findOne({
      _id: departmentId,
      corporation: pmcId,
      isActive: true,
    }),
    AdministrativeOffice.findOne({
      _id: officeId,
      corporation: pmcId,
      isActive: true,
    }),
  ]);

  if (!department) {
    const error = new Error("Active PMC department not found.");
    error.statusCode = 400;
    throw error;
  }

  if (!office) {
    const error = new Error(
      "Active PMC administrative office not found."
    );
    error.statusCode = 400;
    throw error;
  }

  return { department, office };
};

// POST /api/v1/admin/officers
export const createOfficer = async (req, res, next) => {
  try {
    const {
      name,
      email,
      phone = "",
      password,
      departmentId,
      officeId,
    } = req.body;

    // Validate input types and required fields
    if (
      typeof name !== "string" ||
      !name.trim() ||
      typeof email !== "string" ||
      !email.trim() ||
      typeof password !== "string" ||
      !departmentId ||
      !officeId
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Valid name, email, password, departmentId and officeId are required.",
      });
    }

    if (name.trim().length < 2) {
      return res.status(400).json({
        success: false,
        message: "Name must contain at least 2 characters.",
      });
    }

    const normalizedEmail = email.trim().toLowerCase();

    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!emailPattern.test(normalizedEmail)) {
      return res.status(400).json({
        success: false,
        message: "Enter a valid email address.",
      });
    }

    if (password.length < 8) {
      return res.status(400).json({
        success: false,
        message: "Password must contain at least 8 characters.",
      });
    }

    if (typeof phone !== "string") {
      return res.status(400).json({
        success: false,
        message: "Phone must be a string.",
      });
    }

    const existingUser = await User.findOne({
      email: normalizedEmail,
    });

    if (existingUser) {
      return res.status(409).json({
        success: false,
        message: "An account with this email already exists.",
      });
    }

    const pmc = await getPMC();

    const { department, office } =
      await validateOfficerAssignment(
        pmc._id,
        departmentId,
        officeId
      );

    const officer = await User.create({
      name: name.trim(),
      email: normalizedEmail,
      phone: phone.trim(),
      password,
      role: "OFFICER",
      corporation: pmc._id,
      department: department._id,
      administrativeOffice: office._id,
      isActive: true,
    });

    const officerData = officer.toObject();
    delete officerData.password;

    return res.status(201).json({
      success: true,
      message: "Officer account created successfully.",
      officer: officerData,
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        message: "An account with this email already exists.",
      });
    }

    next(error);
  }
};

// GET /api/v1/admin/officers
export const getOfficers = async (req, res, next) => {
  try {
    const pmc = await getPMC();

    const filter = {
      role: "OFFICER",
      corporation: pmc._id,
    };

    if (req.query.departmentId) {
      if (!mongoose.isValidObjectId(req.query.departmentId)) {
        return res.status(400).json({
          success: false,
          message: "Invalid departmentId.",
        });
      }

      filter.department = req.query.departmentId;
    }

    if (req.query.officeId) {
      if (!mongoose.isValidObjectId(req.query.officeId)) {
        return res.status(400).json({
          success: false,
          message: "Invalid officeId.",
        });
      }

      filter.administrativeOffice = req.query.officeId;
    }

    if (req.query.isActive !== undefined) {
      if (!["true", "false"].includes(req.query.isActive)) {
        return res.status(400).json({
          success: false,
          message: "isActive must be true or false.",
        });
      }

      filter.isActive = req.query.isActive === "true";
    }

    const officers = await User.find(filter)
      .select("-password")
      .populate("department", "name code")
      .populate(
        "administrativeOffice",
        "name code officeType"
      )
      .populate("corporation", "name code")
      .sort({ createdAt: -1 })
      .lean();

    return res.status(200).json({
      success: true,
      count: officers.length,
      officers,
    });
  } catch (error) {
    next(error);
  }
};

// PATCH /api/v1/admin/officers/:id
export const updateOfficerAssignment = async (
  req,
  res,
  next
) => {
  try {
    const { departmentId, officeId } = req.body;

    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid officer ID.",
      });
    }

    if (!departmentId || !officeId) {
      return res.status(400).json({
        success: false,
        message: "departmentId and officeId are required.",
      });
    }

    const pmc = await getPMC();

    const officer = await User.findOne({
      _id: req.params.id,
      role: "OFFICER",
      corporation: pmc._id,
    });

    if (!officer) {
      return res.status(404).json({
        success: false,
        message: "PMC officer not found.",
      });
    }

    const { department, office } =
      await validateOfficerAssignment(
        pmc._id,
        departmentId,
        officeId
      );

    officer.department = department._id;
    officer.administrativeOffice = office._id;

    await officer.save();

    const updatedOfficer = await User.findById(officer._id)
      .select("-password")
      .populate("department", "name code")
      .populate(
        "administrativeOffice",
        "name code officeType"
      )
      .populate("corporation", "name code");

    return res.status(200).json({
      success: true,
      message: "Officer assignment updated successfully.",
      officer: updatedOfficer,
    });
  } catch (error) {
    next(error);
  }
};

// PATCH /api/v1/admin/officers/:id/status
export const updateOfficerStatus = async (
  req,
  res,
  next
) => {
  try {
    const { isActive } = req.body;

    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid officer ID.",
      });
    }

    if (typeof isActive !== "boolean") {
      return res.status(400).json({
        success: false,
        message: "isActive must be a boolean value.",
      });
    }

    const pmc = await getPMC();

    const officer = await User.findOneAndUpdate(
      {
        _id: req.params.id,
        role: "OFFICER",
        corporation: pmc._id,
      },
      { $set: { isActive } },
      { new: true, runValidators: true }
    )
      .select("-password")
      .populate("department", "name code")
      .populate(
        "administrativeOffice",
        "name code officeType"
      )
      .populate("corporation", "name code");

    if (!officer) {
      return res.status(404).json({
        success: false,
        message: "PMC officer not found.",
      });
    }

    return res.status(200).json({
      success: true,
      message: `Officer ${
        isActive ? "activated" : "deactivated"
      } successfully.`,
      officer,
    });
  } catch (error) {
    next(error);
  }
};
