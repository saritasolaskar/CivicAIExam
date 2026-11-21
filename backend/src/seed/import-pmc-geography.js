import dotenv from "dotenv";
import mongoose from "mongoose";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

import MunicipalCorporation from "../models/MunicipalCorporation.js";
import AdministrativeOffice from "../models/AdministrativeOffice.js";
import Zone from "../models/Zone.js";
import Prabhag from "../models/Prabhag.js";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = path.resolve(__dirname, "../../data/geography");

const FILES = {
  wards: path.join(DATA_DIR, "pmc-admin-wards-2025.geojson"),
  zones: path.join(DATA_DIR, "pmc-zones-2025.geojson"),
  prabhags: path.join(DATA_DIR, "pmc-prabhags-candidate.geojson"),
};

// Strong match thresholds.
const STRONG_COVERAGE = 0.85;
const STRONG_MARGIN = 0.65;

// Lower thresholds for reasonable approximate matches.
const APPROX_COVERAGE = 0.50;
const APPROX_MARGIN = 0.15;

const MIN_ZONE_COVERAGE = 0.85;
const GRID_SIZE = 20;

const APPLY_CHANGES = process.argv.includes("--apply");

function normalize(value = "") {
  return String(value)
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/chhatrapati/g, "")
    .replace(/[^a-z0-9]/g, "");
}

const OFFICE_ALIASES = {
  kothrudbavdhan: "kothrudbawdhan",
  sinhgadroad: "sinhagadroad",
  chshivajinagargholeroad: "shivajinagargholeroad",

  // The candidate Prabhag dataset uses this newer name.
  hadapsarmundhawa: "hadapsarmanjari",
  hadapsarmundhwa: "hadapsarmanjari",
};

function canonicalOfficeName(value) {
  const key = normalize(value);
  return OFFICE_ALIASES[key] || key;
}

function readGeoJSON(filePath, label) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`${label} file not found: ${filePath}`);
  }

  const data = JSON.parse(fs.readFileSync(filePath, "utf8"));

  if (
    data.type !== "FeatureCollection" ||
    !Array.isArray(data.features) ||
    data.features.length === 0
  ) {
    throw new Error(
      `${label} is not a valid non-empty FeatureCollection.`
    );
  }

  return data.features;
}

function validatePosition(position) {
  return (
    Array.isArray(position) &&
    position.length >= 2 &&
    Number.isFinite(Number(position[0])) &&
    Number.isFinite(Number(position[1])) &&
    Number(position[0]) >= -180 &&
    Number(position[0]) <= 180 &&
    Number(position[1]) >= -90 &&
    Number(position[1]) <= 90
  );
}

function collectPositions(value, output = []) {
  if (!Array.isArray(value)) return output;

  if (validatePosition(value)) {
    output.push([
      Number(value[0]),
      Number(value[1]),
    ]);
    return output;
  }

  for (const item of value) {
    collectPositions(item, output);
  }

  return output;
}

function validateGeometry(geometry, label) {
  if (
    !geometry ||
    !["Polygon", "MultiPolygon"].includes(geometry.type) ||
    !Array.isArray(geometry.coordinates)
  ) {
    throw new Error(`${label}: unsupported or missing geometry.`);
  }

  if (collectPositions(geometry.coordinates).length < 4) {
    throw new Error(`${label}: geometry has too few coordinates.`);
  }

  return geometry;
}

function pointInRing(point, ring) {
  const [x, y] = point;
  let inside = false;

  for (
    let i = 0, j = ring.length - 1;
    i < ring.length;
    j = i++
  ) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];

    const intersects =
      yi > y !== yj > y &&
      x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;

    if (intersects) inside = !inside;
  }

  return inside;
}

function pointInPolygon(point, polygonCoordinates) {
  const outerRing = polygonCoordinates[0];

  if (!outerRing || !pointInRing(point, outerRing)) {
    return false;
  }

  // Exclude polygon holes.
  for (let i = 1; i < polygonCoordinates.length; i++) {
    if (pointInRing(point, polygonCoordinates[i])) {
      return false;
    }
  }

  return true;
}

function pointInGeometry(point, geometry) {
  if (geometry.type === "Polygon") {
    return pointInPolygon(point, geometry.coordinates);
  }

  return geometry.coordinates.some((polygon) =>
    pointInPolygon(point, polygon)
  );
}

function geometryBounds(geometry) {
  const positions = collectPositions(geometry.coordinates);

  return positions.reduce(
    (bounds, [longitude, latitude]) => ({
      minX: Math.min(bounds.minX, longitude),
      minY: Math.min(bounds.minY, latitude),
      maxX: Math.max(bounds.maxX, longitude),
      maxY: Math.max(bounds.maxY, latitude),
    }),
    {
      minX: Infinity,
      minY: Infinity,
      maxX: -Infinity,
      maxY: -Infinity,
    }
  );
}

function getInteriorSamples(geometry) {
  const bounds = geometryBounds(geometry);
  const samples = [];

  if (
    !Number.isFinite(bounds.minX) ||
    !Number.isFinite(bounds.minY) ||
    !Number.isFinite(bounds.maxX) ||
    !Number.isFinite(bounds.maxY)
  ) {
    return samples;
  }

  for (let x = 0; x <= GRID_SIZE; x++) {
    for (let y = 0; y <= GRID_SIZE; y++) {
      const point = [
        bounds.minX +
          ((bounds.maxX - bounds.minX) * x) / GRID_SIZE,
        bounds.minY +
          ((bounds.maxY - bounds.minY) * y) / GRID_SIZE,
      ];

      if (pointInGeometry(point, geometry)) {
        samples.push(point);
      }
    }
  }

  return samples;
}

function getOfficeZoneMatch(officeGeometry, zoneFeatures) {
  const samples = getInteriorSamples(officeGeometry);
  const counts = new Map();

  if (!samples.length) {
    return { zoneId: null, coverage: 0 };
  }

  for (const point of samples) {
    const matches = zoneFeatures.filter((feature) =>
      pointInGeometry(point, feature.geometry)
    );

    if (matches.length !== 1) continue;

    const zoneId = String(
      matches[0].properties?.zone_id ??
      matches[0].properties?.id ??
      ""
    ).trim();

    if (!zoneId) continue;

    counts.set(zoneId, (counts.get(zoneId) || 0) + 1);
  }

  const sorted = [...counts.entries()].sort(
    (a, b) => b[1] - a[1]
  );

  if (!sorted.length) {
    return { zoneId: null, coverage: 0 };
  }

  const [zoneId, count] = sorted[0];
  const coverage = count / samples.length;

  return coverage >= MIN_ZONE_COVERAGE
    ? { zoneId, coverage }
    : { zoneId: null, coverage };
}

function getPrabhagOfficeMatch(prabhagGeometry, offices) {
  const samples = getInteriorSamples(prabhagGeometry);
  const counts = new Map();

  if (!samples.length) {
    return {
      office: null,
      coverage: 0,
      margin: 0,
      confidence: "NONE",
      reason: "No interior samples",
    };
  }

  for (const point of samples) {
    const matches = offices.filter((office) =>
      office.boundary &&
      pointInGeometry(point, office.boundary)
    );

    // Count only unambiguous spatial matches.
    if (matches.length !== 1) continue;

    const officeId = matches[0]._id.toString();

    counts.set(
      officeId,
      (counts.get(officeId) || 0) + 1
    );
  }

  const sorted = [...counts.entries()].sort(
    (a, b) => b[1] - a[1]
  );

  if (!sorted.length) {
    return {
      office: null,
      coverage: 0,
      margin: 0,
      confidence: "NONE",
      reason: "No office polygon overlap",
    };
  }

  const [bestOfficeId, bestCount] = sorted[0];
  const secondCount = sorted[1]?.[1] || 0;

  const coverage = bestCount / samples.length;
  const secondCoverage = secondCount / samples.length;
  const margin = coverage - secondCoverage;

  const office = offices.find(
    (item) => item._id.toString() === bestOfficeId
  );

  if (
    coverage >= STRONG_COVERAGE &&
    margin >= STRONG_MARGIN
  ) {
    return {
      office,
      coverage,
      margin,
      confidence: "STRONG",
      reason: "Strong spatial overlap",
    };
  }

  if (
    coverage >= APPROX_COVERAGE &&
    margin >= APPROX_MARGIN
  ) {
    return {
      office,
      coverage,
      margin,
      confidence: "APPROXIMATE",
      reason: "Approximate spatial overlap",
    };
  }

  return {
    office: null,
    coverage,
    margin,
    confidence: "NONE",
    reason: "Spatial overlap is too weak or ambiguous",
  };
}

function getFeatureName(feature) {
  return String(
    feature.properties?.Field ??
    feature.properties?.ward ??
    feature.properties?.name ??
    ""
  ).trim();
}

function getPrabhagFeatureId(feature) {
  const value = feature.properties?.FID;

  if (
    value === undefined ||
    value === null ||
    String(value).trim() === ""
  ) {
    throw new Error("A Prabhag feature is missing its unique FID.");
  }

  return String(value).trim();
}

function getSourcePrabhagId(feature) {
  const value = feature.properties?.prabhag_id;

  return value === undefined || value === null
    ? ""
    : String(value).trim();
}

function prepareZones(zoneFeatures) {
  const ids = new Set();

  return zoneFeatures.map((feature, index) => {
    const zoneId = String(
      feature.properties?.zone_id ??
      feature.properties?.id ??
      ""
    ).trim();

    const zoneName = String(
      feature.properties?.Zone_Name ??
      feature.properties?.zone ??
      ""
    ).trim();

    if (!zoneId || !zoneName) {
      throw new Error(
        `Zone feature ${index + 1} is missing its ID or name.`
      );
    }

    if (ids.has(zoneId)) {
      throw new Error(`Duplicate zone ID found: ${zoneId}`);
    }

    ids.add(zoneId);

    return {
      zoneId,
      zoneName,
      code: `PMC_ZONE_${zoneId}`,
      geometry: feature.geometry,
    };
  });
}

async function main() {
  console.log(
    APPLY_CHANGES
      ? "\n*** APPLY MODE: DATABASE CHANGES ENABLED ***\n"
      : "\n*** DRY RUN: DATABASE WILL NOT BE CHANGED ***\n"
  );

  const wardFeatures = readGeoJSON(FILES.wards, "PMC ward");
  const zoneFeatures = readGeoJSON(FILES.zones, "PMC zone");
  const prabhagFeatures = readGeoJSON(
    FILES.prabhags,
    "Prabhag candidate"
  );

  console.log("Validating downloaded geometries...");

  wardFeatures.forEach((feature, index) =>
    validateGeometry(feature.geometry, `Ward feature ${index + 1}`)
  );

  zoneFeatures.forEach((feature, index) =>
    validateGeometry(feature.geometry, `Zone feature ${index + 1}`)
  );

  prabhagFeatures.forEach((feature, index) =>
    validateGeometry(feature.geometry, `Prabhag feature ${index + 1}`)
  );

  const mongoUri =
    process.env.MONGO_URI ||
    process.env.MONGODB_URI;

  if (!mongoUri) {
    throw new Error("MONGO_URI or MONGODB_URI is missing.");
  }

  await mongoose.connect(mongoUri);
  console.log("Connected to MongoDB.");

  const corporation = await MunicipalCorporation.findOne({
    isActive: true,
    $or: [
      { name: /pune municipal corporation/i },
      { code: /PMC/i },
    ],
  });

  if (!corporation) {
    throw new Error("Active PMC corporation record not found.");
  }

  const offices = await AdministrativeOffice.find({
    corporation: corporation._id,
    isActive: true,
  });

  if (!offices.length) {
    throw new Error("No active PMC administrative offices found.");
  }

  const officeByName = new Map(
    offices.map((office) => [
      canonicalOfficeName(office.name),
      office,
    ])
  );

  const matchedWards = wardFeatures.map((feature) => {
    const sourceName = getFeatureName(feature);
    const office = officeByName.get(
      canonicalOfficeName(sourceName)
    );

    if (!office) {
      throw new Error(
        `Ward "${sourceName}" does not match an existing office. ` +
        "No database changes have been made."
      );
    }

    return { feature, office };
  });

  const preparedZones = prepareZones(zoneFeatures);

  const featureIds = prabhagFeatures.map(getPrabhagFeatureId);

  if (new Set(featureIds).size !== featureIds.length) {
    throw new Error(
      "Duplicate Prabhag FIDs found. No database changes have been made."
    );
  }

  // Use downloaded ward boundaries for the spatial comparison.
  const preparedOfficeBoundaries = matchedWards.map(
    ({ feature, office }) => ({
      office,
      geometry: feature.geometry,
    })
  );

  const spatialOffices = preparedOfficeBoundaries.map(
    ({ office, geometry }) => ({
      _id: office._id,
      name: office.name,
      boundary: geometry,
    })
  );

  const preparedPrabhags = [];
  const skippedPrabhags = [];

  for (const feature of prabhagFeatures) {
    const featureId = getPrabhagFeatureId(feature);
    const sourcePrabhagId = getSourcePrabhagId(feature);

    const sourceName = String(
      feature.properties?.prabhag ??
      feature.properties?.Name ??
      `Prabhag feature ${featureId}`
    ).trim();

    const sourceWard = String(
      feature.properties?.ward ?? ""
    ).trim();

    let match = getPrabhagOfficeMatch(
      feature.geometry,
      spatialOffices
    );

    let assignmentMethod = match.confidence;

    // If the spatial layer has a gap, try the source ward name.
    if (!match.office && sourceWard) {
      const sourceOffice = officeByName.get(
        canonicalOfficeName(sourceWard)
      );

      if (sourceOffice) {
        match = {
          office: sourceOffice,
          coverage: match.coverage,
          margin: match.margin,
          confidence: "SOURCE_WARD",
          reason: `Matched source ward: ${sourceWard}`,
        };

        assignmentMethod = "SOURCE_WARD";
      }
    }

    if (!match.office) {
      skippedPrabhags.push({
        featureId,
        name: sourceName,
        sourceWard,
        coverage: match.coverage,
        margin: match.margin,
        reason: match.reason,
      });

      continue;
    }

    preparedPrabhags.push({
      number: featureId,
      sourcePrabhagId,
      name: sourceName,
      sourceWard,
      office: match.office,
      geometry: feature.geometry,
      coverage: match.coverage,
      margin: match.margin,
      assignmentMethod,
    });
  }

  const preparedOfficeZones = preparedOfficeBoundaries.map(
    ({ office, geometry }) => {
      const match = getOfficeZoneMatch(geometry, zoneFeatures);

      return {
        office,
        geometry,
        zoneId: match.zoneId,
        coverage: match.coverage,
      };
    }
  );

  console.log("\nPRE-IMPORT VALIDATION");
  console.log("------------------------------");
  console.log(`Ward features: ${matchedWards.length}`);
  console.log(`Zone features: ${preparedZones.length}`);
  console.log(`Prabhag features: ${prabhagFeatures.length}`);
  console.log(`Prepared Prabhags: ${preparedPrabhags.length}`);
  console.log(`Skipped Prabhags: ${skippedPrabhags.length}`);

  console.log("\nPRABHAG MATCHES");

  for (const item of preparedPrabhags) {
    console.log(
      `FID ${item.number} | ${item.name} | ` +
      `${item.office.name} | ${item.assignmentMethod} | ` +
      `${(item.coverage * 100).toFixed(1)}% coverage`
    );
  }

  console.log("\nSKIPPED PRABHAGS");

  for (const item of skippedPrabhags) {
    console.warn(
      `FID ${item.featureId} | ${item.name} | ` +
      `Source ward: ${item.sourceWard || "Not available"} | ` +
      `${item.reason}`
    );
  }

  console.log("\nOFFICE-ZONE MATCHES");

  for (const item of preparedOfficeZones) {
    console.log(
      `${item.office.name} -> ` +
      `${item.zoneId || "NO CONFIDENT ZONE"} ` +
      `(${(item.coverage * 100).toFixed(1)}%)`
    );
  }

  if (!APPLY_CHANGES) {
    console.log("\nDRY RUN COMPLETED.");
    console.log("No database documents were inserted or updated.");
    console.log("Review the matches before running with --apply.");
    return;
  }

  // All database writes start below this point.
  const zoneDocuments = new Map();

  for (const zone of preparedZones) {
    const document = await Zone.findOneAndUpdate(
      {
        corporation: corporation._id,
        code: zone.code,
      },
      {
        $set: {
          name: zone.zoneName,
          boundary: zone.geometry,
          isActive: true,
        },
        $setOnInsert: {
          corporation: corporation._id,
          code: zone.code,
        },
      },
      {
        new: true,
        upsert: true,
        runValidators: true,
        setDefaultsOnInsert: true,
      }
    );

    zoneDocuments.set(zone.zoneId, document);
  }

  console.log("\nZone boundaries imported.");

  let linkedOffices = 0;
  let unlinkedOffices = 0;

  for (const item of preparedOfficeZones) {
    const zone = item.zoneId
      ? zoneDocuments.get(item.zoneId)
      : null;

    await AdministrativeOffice.updateOne(
      { _id: item.office._id },
      {
        $set: {
          boundary: item.geometry,
          zone: zone?._id || null,
        },
      },
      { runValidators: true }
    );

    if (zone) linkedOffices++;
    else unlinkedOffices++;
  }

  console.log("Administrative office boundaries imported.");

  let importedPrabhags = 0;

  for (const prabhag of preparedPrabhags) {
    await Prabhag.findOneAndUpdate(
      {
        corporation: corporation._id,
        number: prabhag.number,
      },
      {
        $set: {
          name: prabhag.name,
          sourcePrabhagId: prabhag.sourcePrabhagId,
          administrativeOffice: prabhag.office._id,
          boundary: prabhag.geometry,
          isActive: true,
        },
        $setOnInsert: {
          corporation: corporation._id,
          number: prabhag.number,
        },
      },
      {
        new: true,
        upsert: true,
        runValidators: true,
        setDefaultsOnInsert: true,
      }
    );

    importedPrabhags++;
  }

  console.log("\nIMPORT SUMMARY");
  console.log("------------------------------");
  console.log(`Offices updated: ${matchedWards.length}`);
  console.log(`Zones imported/updated: ${preparedZones.length}`);
  console.log(`Offices linked to zones: ${linkedOffices}`);
  console.log(`Offices without confident zone: ${unlinkedOffices}`);
  console.log(`Prabhags imported/updated: ${importedPrabhags}`);
  console.log(`Prabhags skipped: ${skippedPrabhags.length}`);
  console.log("------------------------------");

  console.log(
    "Geographic source files are candidate datasets; " +
    "some office assignments use approximate or source-name matching."
  );
}

main()
  .catch((error) => {
    console.error("\nGEOGRAPHY IMPORT FAILED:");
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }
  });
