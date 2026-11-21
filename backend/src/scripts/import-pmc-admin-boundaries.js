import dotenv from "dotenv";
import mongoose from "mongoose";
import fs from "node:fs/promises";
import path from "node:path";

import MunicipalCorporation from "../models/MunicipalCorporation.js";
import AdministrativeOffice from "../models/AdministrativeOffice.js";

dotenv.config({
  path: path.resolve(process.cwd(), "backend/.env"),
});

const GEOJSON_PATH = path.resolve(
  process.cwd(),
  "backend/src/data/pmc-admin-wards-2025.geojson"
);

const EXPECTED_FEATURE_COUNT = 15;

const ADMIN_OFFICE_MAPPING = {
  "1": "YERAWADA_VADGAONSHERI",
  "2": "DHOLE_PATIL_ROAD",
  "3": "NAGAR_ROAD_WAGHOLI",
  "4": "KOTHRUD_BAWDHAN",
  "5": "AUNDH_BANER",
  "6": "SHIVAJINAGAR_GHOLE_ROAD",
  "7": "DHANKAWADI_KATRAJ_AMBEGAON",
  "8": "WARJE_KARVENAGAR",
  "9": "SINHAGAD_ROAD",
  "10": "HADAPSAR_MANJARI",
  "11": "WANAWADI",
  "12": "KONDHWA_UNDRI",
  "13": "BIBWEWADI",
  "14": "VISHRAMBAGWADA",
  "15": "KASABA_PETH",
};

const validateRing = (ring, featureNumber) => {
  if (!Array.isArray(ring) || ring.length < 4) {
    throw new Error(
      `Feature ${featureNumber}: polygon ring must contain at least four coordinates.`
    );
  }

  const first = ring[0];
  const last = ring[ring.length - 1];

  if (
    !Array.isArray(first) ||
    !Array.isArray(last) ||
    first[0] !== last[0] ||
    first[1] !== last[1]
  ) {
    throw new Error(
      `Feature ${featureNumber}: polygon ring is not closed.`
    );
  }

  for (const point of ring) {
    if (
      !Array.isArray(point) ||
      point.length < 2 ||
      !Number.isFinite(point[0]) ||
      !Number.isFinite(point[1]) ||
      point[0] < -180 ||
      point[0] > 180 ||
      point[1] < -90 ||
      point[1] > 90
    ) {
      throw new Error(
        `Feature ${featureNumber}: invalid coordinate detected.`
      );
    }
  }
};

const validateGeometry = (geometry, featureNumber) => {
  if (
    !geometry ||
    geometry.type !== "MultiPolygon" ||
    !Array.isArray(geometry.coordinates) ||
    geometry.coordinates.length === 0
  ) {
    throw new Error(
      `Feature ${featureNumber}: expected a non-empty MultiPolygon.`
    );
  }

  for (const polygon of geometry.coordinates) {
    if (!Array.isArray(polygon) || polygon.length === 0) {
      throw new Error(
        `Feature ${featureNumber}: invalid polygon structure.`
      );
    }

    for (const ring of polygon) {
      validateRing(ring, featureNumber);
    }
  }
};

const validateFeatureCollection = (geojson) => {
  if (
    !geojson ||
    geojson.type !== "FeatureCollection" ||
    !Array.isArray(geojson.features)
  ) {
    throw new Error("Invalid GeoJSON FeatureCollection.");
  }

  if (geojson.features.length !== EXPECTED_FEATURE_COUNT) {
    throw new Error(
      `Expected ${EXPECTED_FEATURE_COUNT} features but received ${geojson.features.length}.`
    );
  }

  const seenAdminNumbers = new Set();
  const prepared = [];

  for (const [index, feature] of geojson.features.entries()) {
    const featureNumber = index + 1;
    const adminNo = String(feature?.properties?.AdminNo || "").trim();

    if (!ADMIN_OFFICE_MAPPING[adminNo]) {
      throw new Error(
        `Feature ${featureNumber}: unknown AdminNo "${adminNo}".`
      );
    }

    if (seenAdminNumbers.has(adminNo)) {
      throw new Error(
        `Duplicate AdminNo "${adminNo}" detected.`
      );
    }

    seenAdminNumbers.add(adminNo);

    validateGeometry(feature.geometry, featureNumber);

    prepared.push({
      adminNo,
      officeCode: ADMIN_OFFICE_MAPPING[adminNo],
      geometry: feature.geometry,
      sourceName: feature.properties.Field || "",
    });
  }

  if (seenAdminNumbers.size !== EXPECTED_FEATURE_COUNT) {
    throw new Error("Not all 15 administrative office numbers are present.");
  }

  return prepared;
};

async function importAdministrativeBoundaries() {
  if (!process.env.MONGO_URI) {
    throw new Error("MONGO_URI is missing from your environment.");
  }

  await mongoose.connect(process.env.MONGO_URI);
  console.log("Connected to MongoDB.");

  const geojsonText = await fs.readFile(GEOJSON_PATH, "utf8");
  const geojson = JSON.parse(geojsonText);

  // Validate the entire dataset before modifying the database.
  const preparedFeatures = validateFeatureCollection(geojson);

  console.log(
    `Validated ${preparedFeatures.length} administrative boundaries.`
  );

  const pmc = await MunicipalCorporation.findOne({
    code: "PMC",
    isActive: true,
  }).select("_id name code");

  if (!pmc) {
    throw new Error("Active PMC corporation record not found.");
  }

  const existingOffices = await AdministrativeOffice.find({
    corporation: pmc._id,
    code: {
      $in: Object.values(ADMIN_OFFICE_MAPPING),
    },
  })
    .select("_id code")
    .lean();

  const officeCodes = new Set(
    existingOffices.map((office) => office.code)
  );

  const missingCodes = Object.values(ADMIN_OFFICE_MAPPING).filter(
    (code) => !officeCodes.has(code)
  );

  if (missingCodes.length > 0) {
    throw new Error(
      `Missing existing office records: ${missingCodes.join(", ")}. Run the geography seed first.`
    );
  }

  if (existingOffices.length !== EXPECTED_FEATURE_COUNT) {
    throw new Error(
      `Expected 15 existing office records but found ${existingOffices.length}.`
    );
  }

  const operations = preparedFeatures.map((feature) => ({
    updateOne: {
      filter: {
        corporation: pmc._id,
        code: feature.officeCode,
      },
      update: {
        $set: {
          boundary: feature.geometry,
        },
      },
    },
  }));

  const result = await AdministrativeOffice.bulkWrite(
    operations,
    { ordered: true }
  );

  // Ensure MongoDB has the required spatial index.
  await AdministrativeOffice.collection.createIndex({
    boundary: "2dsphere",
  });

  const importedCount = await AdministrativeOffice.countDocuments({
    corporation: pmc._id,
    isActive: true,
    "boundary.type": "MultiPolygon",
  });

  if (importedCount !== EXPECTED_FEATURE_COUNT) {
    throw new Error(
      `Import verification failed. Expected 15 offices with MultiPolygon boundaries, found ${importedCount}.`
    );
  }

  console.log("\nADMINISTRATIVE BOUNDARY IMPORT COMPLETED");
  console.log("Matched existing offices:", existingOffices.length);
  console.log("Modified offices:", result.modifiedCount);
  console.log("Matched offices:", result.matchedCount);
  console.log("Offices with imported boundaries:", importedCount);
  console.log("Spatial index: created/verified");
}

importAdministrativeBoundaries()
  .catch((error) => {
    console.error("\nBOUNDARY IMPORT FAILED");
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });