
import dotenv from "dotenv";
import mongoose from "mongoose";
import Corporation from "./src/models/MunicipalCorporation.js";

dotenv.config();

async function checkDatabase() {
  try {
    await mongoose.connect(process.env.MONGO_URI);

    console.log("\nDATABASE CONNECTION");
    console.log("Database:", mongoose.connection.name);
    console.log("Host:", mongoose.connection.host);

    const corporations = await Corporation.find({}).lean();

    console.log("\nALL CORPORATIONS:");
    console.log(JSON.stringify(corporations, null, 2));

    console.log("\nTotal corporations:", corporations.length);
  } catch (error) {
    console.error(error);
  } finally {
    await mongoose.disconnect();
  }
}

checkDatabase();
