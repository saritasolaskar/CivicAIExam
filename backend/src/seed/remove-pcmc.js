
import dotenv from "dotenv";
import mongoose from "mongoose";

import MunicipalCorporation from "../models/MunicipalCorporation.js";
import Department from "../models/Department.js";
import ComplaintCategory from "../models/ComplaintCategory.js";
import Zone from "../models/Zone.js";
import AdministrativeOffice from "../models/AdministrativeOffice.js";
import Prabhag from "../models/Prabhag.js";
import User from "../models/User.js";
import Complaint from "../models/Complaint.js";

dotenv.config();

async function removePCMC() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log("Connected to MongoDB");

  const pcmc = await MunicipalCorporation.findOne({ code: "PCMC" });

  if (!pcmc) {
    console.log("PCMC record does not exist. Nothing to clean.");
    return;
  }

  // Protect existing users and complaints from broken references.
  const userCount = await User.countDocuments({
    corporation: pcmc._id
  });

  const complaintCount = await Complaint.countDocuments({
    corporation: pcmc._id
  });

  console.log("PCMC users:", userCount);
  console.log("PCMC complaints:", complaintCount);

  if (userCount > 0 || complaintCount > 0) {
    throw new Error(
      "Cleanup stopped: PCMC has users or complaints. Review these records before deleting PCMC."
    );
  }

  // Remove PCMC-dependent master data.
  const categories = await ComplaintCategory.deleteMany({
    corporation: pcmc._id
  });

  const departments = await Department.deleteMany({
    corporation: pcmc._id
  });

  const prabhags = await Prabhag.deleteMany({
    corporation: pcmc._id
  });

  const offices = await AdministrativeOffice.deleteMany({
    corporation: pcmc._id
  });

  const zones = await Zone.deleteMany({
    corporation: pcmc._id
  });

  await MunicipalCorporation.deleteOne({
    _id: pcmc._id
  });

  console.log("\nPCMC cleanup completed:");
  console.log("Categories removed:", categories.deletedCount);
  console.log("Departments removed:", departments.deletedCount);
  console.log("Prabhags removed:", prabhags.deletedCount);
  console.log("Administrative offices removed:", offices.deletedCount);
  console.log("Zones removed:", zones.deletedCount);
  console.log("PCMC corporation removed: 1");
}

removePCMC()
  .catch((error) => {
    console.error("\nPCMC cleanup failed:", error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
