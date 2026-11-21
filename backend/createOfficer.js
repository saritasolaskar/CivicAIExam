import dotenv from "dotenv";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import User from "./src/models/User.js";

dotenv.config();

const createOfficer = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);

    const email = "water.test@civicai.local";
    const password = "Officer@12345";

    const existingOfficer = await User.findOne({ email });

    if (existingOfficer) {
      console.log("Officer with this email already exists.");
      return;
    }

    const corporation = await mongoose.connection
      .collection("municipalcorporations")
      .findOne({ code: "PMC", isActive: true });

    const department = await mongoose.connection
      .collection("departments")
      .findOne({ code: "WATER", corporation: corporation?._id, isActive: true });

    const office = await mongoose.connection
      .collection("administrativeoffices")
      .findOne({
        code: "YERAWADA_VADGAONSHERI",
        corporation: corporation?._id,
        isActive: true,
      });

    if (!corporation || !department || !office) {
      throw new Error("PMC, WATER department, or administrative office not found.");
    }

    const officer = await User.create({
      name: "Test Water Officer",
      email,
      password,
      role: "OFFICER",
      corporation: corporation._id,
      department: department._id,
      administrativeOffice: office._id,
      isActive: true,
    });

    console.log("\nOFFICER REGISTERED SUCCESSFULLY");
    console.log("Name:", officer.name);
    console.log("Email:", email);
    console.log("Password:", password);
    console.log("Role:", officer.role);
    console.log("Department: WATER");
    console.log("Office: Yerawada Vadgaonsheri");
  } catch (error) {
    console.error("Registration failed:", error.message);
  } finally {
    await mongoose.disconnect();
  }
};

createOfficer();
