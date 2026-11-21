import dotenv from "dotenv";
import mongoose from "mongoose";
import User from "./src/models/User.js";
import Complaint from "./src/models/Complaint.js";

dotenv.config();

const run = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);

    const officer = await User.findOne({
      email: "water.test@civicai.local",
      role: "OFFICER",
      isActive: true,
    });

    const complaint = await Complaint.findOne({
      complaintNumber: "CIV-1795115367804-O1OUSN",
    });

    const admin = await User.findOne({
      role: "ADMIN",
      isActive: true,
    });

    if (!officer || !complaint || !admin) {
      throw new Error("Officer, complaint, or admin account not found.");
    }

    if (
      String(officer.corporation) !== String(complaint.corporation) ||
      String(officer.department) !== String(complaint.department)
    ) {
      throw new Error("Officer and complaint corporation/department do not match.");
    }

    if (
      complaint.administrativeOffice &&
      String(officer.administrativeOffice) !== String(complaint.administrativeOffice)
    ) {
      throw new Error("Officer and complaint administrative offices do not match.");
    }

    if (["RESOLVED", "REJECTED"].includes(complaint.status)) {
      throw new Error("Cannot reassign a resolved or rejected complaint.");
    }

    complaint.assignedOfficer = officer._id;
    complaint.administrativeOffice = officer.administrativeOffice;
    complaint.status = "ASSIGNED";

    complaint.statusHistory.push({
      status: "ASSIGNED",
      changedBy: admin._id,
      note: "Reassigned to Test Water Officer for workflow testing.",
      changedAt: new Date(),
    });

    await complaint.save();

    console.log("SUCCESS: Complaint reassigned.");
    console.log("Complaint:", complaint.complaintNumber);
    console.log("Officer:", officer.name);
    console.log("Status:", complaint.status);
  } catch (error) {
    console.error("FAILED:", error.message);
  } finally {
    await mongoose.disconnect();
  }
};

run();
