import MunicipalCorporation from "../models/MunicipalCorporation.js";
import AdministrativeOffice from "../models/AdministrativeOffice.js";
import Prabhag from "../models/Prabhag.js";
import Zone from "../models/Zone.js";

const BOUNDARY_SOURCE =
  "PMC candidate administrative ward, Prabhag and Zone datasets (2025)";

const getPMC = async () => {
  const pmc = await MunicipalCorporation.findOne({
    code: "PMC",
    isActive: true,
  }).select("_id name code");

  if (!pmc) {
    const error = new Error("PMC corporation record not found.");
    error.statusCode = 404;
    throw error;
  }

  return pmc;
};

const createPoint = (longitude, latitude) => ({
  type: "Point",
  coordinates: [longitude, latitude],
});

const getId = (document) =>
  document?._id?.toString() || null;

export const findPMCGeographyByCoordinates = async (
  longitude,
  latitude
) => {
  if (
    !Number.isFinite(longitude) ||
    !Number.isFinite(latitude) ||
    longitude < -180 ||
    longitude > 180 ||
    latitude < -90 ||
    latitude > 90
  ) {
    const error = new Error("Invalid geographic coordinates.");
    error.statusCode = 400;
    throw error;
  }

  const pmc = await getPMC();
  const point = createPoint(longitude, latitude);

  // 1. Independently match administrative-office boundaries.
  const officeMatches = await AdministrativeOffice.find({
    corporation: pmc._id,
    isActive: true,
    boundary: {
      $geoIntersects: {
        $geometry: point,
      },
    },
  })
    .select("name code officeType address zone")
    .populate("zone", "name code")
    .limit(2)
    .lean();

  const officeAmbiguous = officeMatches.length > 1;

  const exactOffice = officeAmbiguous
    ? null
    : officeMatches[0] || null;

  // 2. Independently match Prabhag boundaries.
  const prabhagMatches = await Prabhag.find({
    corporation: pmc._id,
    isActive: true,
    boundary: {
      $geoIntersects: {
        $geometry: point,
      },
    },
  })
    .select("name number sourcePrabhagId administrativeOffice")
    .populate({
      path: "administrativeOffice",
      select: "name code officeType address zone",
      populate: {
        path: "zone",
        select: "name code",
      },
    })
    .limit(2)
    .lean();

  const prabhagAmbiguous = prabhagMatches.length > 1;

  const matchedPrabhag = prabhagAmbiguous
    ? null
    : prabhagMatches[0] || null;

  const prabhagOffice =
    matchedPrabhag?.administrativeOffice || null;

  // 3. Check whether the Prabhag and exact office agree.
  const prabhagOfficeConflict = Boolean(
    exactOffice &&
      prabhagOffice &&
      getId(exactOffice) !== getId(prabhagOffice)
  );

  // A conflicting Prabhag must not be used for assignment.
  const verifiedPrabhag =
    prabhagOfficeConflict ? null : matchedPrabhag;

  // Exact office match takes priority.
  // Otherwise, a matched Prabhag may suggest its linked office.
  // This is explicitly a fallback, not an office-boundary match.
  const office = exactOffice ||
    (!officeAmbiguous && !prabhagOfficeConflict
      ? prabhagOffice
      : null);

  const officeMatchMethod = exactOffice
    ? "OFFICE_BOUNDARY"
    : office
      ? "PRABHAG_BOUNDARY_RELATIONSHIP"
      : null;

  const officeApproximate =
    officeMatchMethod === "PRABHAG_BOUNDARY_RELATIONSHIP";

  // 4. Independently match Zone boundaries.
  const zoneMatches = await Zone.find({
    corporation: pmc._id,
    isActive: true,
    boundary: {
      $geoIntersects: {
        $geometry: point,
      },
    },
  })
    .select("name code")
    .limit(2)
    .lean();

  const zoneAmbiguous = zoneMatches.length > 1;

  const boundaryZone = zoneAmbiguous
    ? null
    : zoneMatches[0] || null;

  // 5. Compare the independently matched Zone with the office link.
  const officeLinkedZone = office?.zone || null;

  const zoneOfficeConflict = Boolean(
    boundaryZone &&
      officeLinkedZone &&
      getId(boundaryZone) !== getId(officeLinkedZone)
  );

  // A direct geographic Zone match takes priority.
  // Office relationship is only a fallback when no Zone boundary matches.
  const zone = boundaryZone ||
    (!zoneAmbiguous ? officeLinkedZone : null);

  const zoneMatchMethod = boundaryZone
    ? "ZONE_BOUNDARY"
    : zone
      ? "ADMINISTRATIVE_OFFICE_RELATIONSHIP"
      : null;

  // 6. Collect reasons that require administrative review.
  const reviewReasons = [];

  if (officeAmbiguous) {
    reviewReasons.push(
      "Multiple administrative-office boundaries match these coordinates."
    );
  } else if (exactOffice) {
    // Exact office polygon match.
  } else if (officeApproximate) {
    reviewReasons.push(
      "The administrative office was suggested through the matched Prabhag, not an independent office-boundary match."
    );
  } else {
    reviewReasons.push(
      "No administrative-office boundary or usable Prabhag-based office suggestion matches these coordinates."
    );
  }

  if (prabhagAmbiguous) {
    reviewReasons.push(
      "Multiple Prabhag boundaries match these coordinates."
    );
  } else if (!matchedPrabhag) {
    reviewReasons.push(
      "No Prabhag boundary matches these coordinates."
    );
  }

  if (prabhagOfficeConflict) {
    reviewReasons.push(
      "The matched Prabhag is linked to a different administrative office than the independently matched office."
    );
  }

  if (zoneAmbiguous) {
    reviewReasons.push(
      "Multiple Zone boundaries match these coordinates."
    );
  } else if (!boundaryZone && zone) {
    reviewReasons.push(
      "The Zone was obtained through the administrative-office relationship, not a direct Zone-boundary match."
    );
  } else if (!zone) {
    reviewReasons.push(
      "No Zone boundary or administrative-office Zone relationship could identify a Zone."
    );
  }

  if (zoneOfficeConflict) {
    reviewReasons.push(
      "The directly matched Zone differs from the Zone linked to the suggested administrative office."
    );
  }

  const reviewRequired = reviewReasons.length > 0;

  return {
    found: Boolean(office),

    // True only when an administrative-office polygon matched directly.
    officeFound: Boolean(exactOffice),
    officeAmbiguous,
    administrativeOffice: office,
    officeMatchMethod,
    officeApproximate,

    // True when a Zone was identified, including relationship fallback.
    zoneFound: Boolean(zone),
    zoneBoundaryFound: Boolean(boundaryZone),
    zoneAmbiguous,
    zone,
    zoneMatchMethod,
    zoneOfficeConflict,

    // Only a usable, non-conflicting Prabhag is returned.
    prabhagFound: Boolean(verifiedPrabhag),
    prabhagAmbiguous,
    prabhag: verifiedPrabhag,
    prabhagOfficeConflict,

    reviewRequired,
    reviewReasons,

    message: reviewRequired
      ? reviewReasons.join(" ")
      : "Administrative office, Prabhag and Zone boundaries matched successfully.",

    boundarySource: BOUNDARY_SOURCE,
  };
};
