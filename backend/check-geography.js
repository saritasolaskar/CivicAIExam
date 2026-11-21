
import dotenv from "dotenv";
import mongoose from "mongoose";

import Corporation from "./src/models/MunicipalCorporation.js";
import Zone from "./src/models/Zone.js";
import Office from "./src/models/AdministrativeOffice.js";
import Prabhag from "./src/models/Prabhag.js";

dotenv.config();

async function auditGeography() {
  try {
    await mongoose.connect(process.env.MONGO_URI);

    const pmc = await Corporation.findOne({ code: "PMC" });

    if (pmc === null) {
      throw new Error("PMC corporation not found");
    }

    const id = pmc._id;

    console.log("\n========== PMC GEOGRAPHY AUDIT ==========");

    console.log("Zones:", await Zone.countDocuments({ corporation: id }));
    console.log(
      "Administrative Offices:",
      await Office.countDocuments({ corporation: id })
    );
    console.log("Prabhags:", await Prabhag.countDocuments({ corporation: id }));

    console.log("\nExisting Zones:");
    console.log(await Zone.find({ corporation: id }).lean());

    console.log("\nExisting Offices:");
    console.log(await Office.find({ corporation: id }).lean());

    console.log("\nExisting Prabhags:");
    console.log(await Prabhag.find({ corporation: id }).lean());

    console.log("=========================================");
  } catch (error) {
    console.error("Geography audit failed:", error.message);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
}

auditGeography();
