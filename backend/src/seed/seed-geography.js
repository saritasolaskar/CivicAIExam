
import dotenv from "dotenv";
import mongoose from "mongoose";

import Corporation from "../models/MunicipalCorporation.js";
import AdministrativeOffice from "../models/AdministrativeOffice.js";

dotenv.config();

const offices = [
  { code: "YERAWADA_VADGAONSHERI", name: "Yerawada Vadgaonsheri" },
  { code: "DHOLE_PATIL_ROAD", name: "Dhole Patil Road" },
  { code: "NAGAR_ROAD_WAGHOLI", name: "Nagar Road Wagholi" },
  { code: "KOTHRUD_BAWDHAN", name: "Kothrud Bawdhan" },
  { code: "AUNDH_BANER", name: "Aundh Baner" },
  { code: "SHIVAJINAGAR_GHOLE_ROAD", name: "Chhatrapati Shivajinagar Ghole Road" },
  { code: "DHANKAWADI_KATRAJ_AMBEGAON", name: "Dhankawadi Katraj Ambegaon" },
  { code: "WARJE_KARVENAGAR", name: "Warje Karvenagar" },
  { code: "SINHAGAD_ROAD", name: "Sinhagad Road" },
  { code: "HADAPSAR_MANJARI", name: "Hadapsar Manjari" },
  { code: "WANAWADI", name: "Wanawadi" },
  { code: "KONDHWA_UNDRI", name: "Kondhwa Undri" },
  { code: "BIBWEWADI", name: "Bibwewadi" },
  { code: "VISHRAMBAGWADA", name: "Vishrambagwada" },
  { code: "KASABA_PETH", name: "Kasaba Peth" }
];

async function seedGeography() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log("Connected to MongoDB");

    const pmc = await Corporation.findOne({ code: "PMC" });

    if (pmc === null) {
      throw new Error("PMC corporation not found. Run the main seed first.");
    }

    for (const office of offices) {
      await AdministrativeOffice.findOneAndUpdate(
        {
          corporation: pmc._id,
          code: office.code
        },
        {
          $set: {
            name: office.name,
            code: office.code,
            officeType: "WARD_OFFICE",
            corporation: pmc._id,
            isActive: true
          }
        },
        {
          upsert: true,
          new: true,
          runValidators: true
        }
      );
    }

    const total = await AdministrativeOffice.countDocuments({
      corporation: pmc._id
    });

    console.log("\nPMC GEOGRAPHY SEED COMPLETED");
    console.log("Administrative offices inserted/updated:", offices.length);
    console.log("Total PMC administrative offices:", total);
  } catch (error) {
    console.error("Geography seeding failed:", error);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
}

seedGeography();
