
import dotenv from "dotenv";
import mongoose from "mongoose";

import MunicipalCorporation from "../models/MunicipalCorporation.js";
import Department from "../models/Department.js";
import ComplaintCategory from "../models/ComplaintCategory.js";
import User from "../models/User.js";

dotenv.config();

const departments = [
  {
    name: "Water Supply Department",
    code: "WATER",
    description: "Water supply, leakage, shortages and water quality complaints."
  },
  {
    name: "Drainage Department",
    code: "DRAINAGE",
    description: "Drainage systems, sewerage and blocked drains."
  },
  {
    name: "Solid Waste Management Department",
    code: "WASTE",
    description: "Garbage collection, waste accumulation and illegal dumping."
  },
  {
    name: "Road Department",
    code: "ROADS",
    description: "Road maintenance, potholes and damaged footpaths."
  },
  {
    name: "Electrical Department",
    code: "ELECTRICAL",
    description: "Streetlights and municipal electrical infrastructure."
  },
  {
    name: "Garden Department",
    code: "GARDEN",
    description: "Public gardens, trees and related civic issues."
  },
  {
    name: "Public Health Department",
    code: "HEALTH",
    description: "Mosquito breeding and public health-related civic issues."
  }
];

const categories = [
  {
    name: "Water Leakage",
    code: "WATER_LEAKAGE",
    departmentCode: "WATER",
    defaultSeverity: "MEDIUM",
    keywords: ["water leakage", "pipe leakage", "burst pipe"]
  },
  {
    name: "Water Shortage",
    code: "WATER_SHORTAGE",
    departmentCode: "WATER",
    defaultSeverity: "MEDIUM",
    keywords: ["no water", "water shortage", "low water supply"]
  },
  {
    name: "Contaminated Water",
    code: "CONTAMINATED_WATER",
    departmentCode: "WATER",
    defaultSeverity: "HIGH",
    keywords: ["dirty water", "contaminated water", "unsafe water"]
  },
  {
    name: "Sewage Overflow",
    code: "SEWAGE_OVERFLOW",
    departmentCode: "DRAINAGE",
    defaultSeverity: "HIGH",
    keywords: ["sewage overflow", "sewer overflow", "sewage leakage"]
  },
  {
    name: "Blocked Drain",
    code: "BLOCKED_DRAIN",
    departmentCode: "DRAINAGE",
    defaultSeverity: "MEDIUM",
    keywords: ["blocked drain", "drain blockage", "waterlogging"]
  },
  {
    name: "Garbage Accumulation",
    code: "GARBAGE_ACCUMULATION",
    departmentCode: "WASTE",
    defaultSeverity: "MEDIUM",
    keywords: ["garbage", "waste accumulation", "uncollected waste"]
  },
  {
    name: "Illegal Dumping",
    code: "ILLEGAL_DUMPING",
    departmentCode: "WASTE",
    defaultSeverity: "MEDIUM",
    keywords: ["illegal dumping", "waste dumping", "rubbish dumping"]
  },
  {
    name: "Pothole",
    code: "POTHOLE",
    departmentCode: "ROADS",
    defaultSeverity: "MEDIUM",
    keywords: ["pothole", "road damage", "broken road"]
  },
  {
    name: "Damaged Footpath",
    code: "DAMAGED_FOOTPATH",
    departmentCode: "ROADS",
    defaultSeverity: "LOW",
    keywords: ["damaged footpath", "broken pavement", "unsafe footpath"]
  },
  {
    name: "Streetlight Failure",
    code: "STREETLIGHT_FAILURE",
    departmentCode: "ELECTRICAL",
    defaultSeverity: "MEDIUM",
    keywords: ["streetlight not working", "dark street", "light failure"]
  },
  {
    name: "Fallen Tree",
    code: "FALLEN_TREE",
    departmentCode: "GARDEN",
    defaultSeverity: "HIGH",
    keywords: ["fallen tree", "tree fallen", "broken tree"]
  },
  {
    name: "Mosquito Breeding",
    code: "MOSQUITO_BREEDING",
    departmentCode: "HEALTH",
    defaultSeverity: "MEDIUM",
    keywords: ["mosquito breeding", "mosquito larvae", "stagnant water"]
  }
];

async function seedPMC() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log("Connected to MongoDB");

  // Create or update PMC.
  const pmc = await MunicipalCorporation.findOneAndUpdate(
    { code: "PMC" },
    {
      $set: {
        name: "Pune Municipal Corporation",
        code: "PMC",
        city: "Pune",
        state: "Maharashtra",
        isActive: true
      }
    },
    { upsert: true, new: true, runValidators: true }
  );

  console.log("PMC master record ready");

  // Seed departments.
  const departmentMap = {};

  for (const department of departments) {
    const savedDepartment = await Department.findOneAndUpdate(
      { corporation: pmc._id, code: department.code },
      {
        $set: {
          ...department,
          corporation: pmc._id,
          isActive: true
        }
      },
      { upsert: true, new: true, runValidators: true }
    );

    departmentMap[department.code] = savedDepartment;
  }

  console.log(`${departments.length} PMC departments ready`);

  // Seed complaint categories and link them to departments.
  for (const category of categories) {
    const department = departmentMap[category.departmentCode];

    if (!department) {
      throw new Error(
        `Department not found: ${category.departmentCode}`
      );
    }

    await ComplaintCategory.findOneAndUpdate(
      { corporation: pmc._id, code: category.code },
      {
        $set: {
          name: category.name,
          code: category.code,
          corporation: pmc._id,
          department: department._id,
          defaultSeverity: category.defaultSeverity,
          keywords: category.keywords,
          isActive: true
        }
      },
      { upsert: true, new: true, runValidators: true }
    );
  }

  console.log(`${categories.length} PMC complaint categories ready`);

  // Create the initial administrator if credentials are configured.
  if (process.env.ADMIN_EMAIL && process.env.ADMIN_PASSWORD) {
    const existingAdmin = await User.findOne({
      email: process.env.ADMIN_EMAIL.toLowerCase()
    });

    if (!existingAdmin) {
      await User.create({
        name: process.env.ADMIN_NAME || "CivicAI Administrator",
        email: process.env.ADMIN_EMAIL.toLowerCase(),
        password: process.env.ADMIN_PASSWORD,
        role: "ADMIN",
        corporation: pmc._id,
        isActive: true
      });

      console.log("Initial administrator created");
    } else {
      console.log("Administrator already exists; password unchanged");
    }
  } else {
    console.log("Admin credentials missing; administrator not created");
  }

  console.log("\nPMC seeding completed successfully");
  console.log("Corporation: Pune Municipal Corporation");
  console.log(`Departments: ${departments.length}`);
  console.log(`Categories: ${categories.length}`);
}

seedPMC()
  .catch((error) => {
    console.error("PMC seeding failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
