import Complaint from "../models/Complaint.js";

const SEARCH_RADIUS_METERS = 150;
const LOOKBACK_DAYS = 30;
const MIN_TEXT_SIMILARITY = 0.15;
const MIN_MATCH_SCORE = 0.45;

const STOP_WORDS = new Set([
  "the", "is", "at", "in", "on", "of", "and", "or",
  "a", "an", "to", "for", "near", "with", "from",
  "this", "that", "there", "here", "has", "have",
  "was", "are", "were", "been", "being", "it"
]);

function tokenize(text) {
  return new Set(
    String(text || "")
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter(word => word.length > 1 && !STOP_WORDS.has(word))
  );
}

function calculateTextSimilarity(textA, textB) {
  const wordsA = tokenize(textA);
  const wordsB = tokenize(textB);

  if (!wordsA.size || !wordsB.size) return 0;

  const intersection = [...wordsA].filter(word => wordsB.has(word));
  const union = new Set([...wordsA, ...wordsB]);

  return intersection.length / union.size;
}

function calculateDistanceMeters(lon1, lat1, lon2, lat2) {
  const toRadians = degrees => degrees * Math.PI / 180;
  const earthRadius = 6371000;

  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(lat1)) *
    Math.cos(toRadians(lat2)) *
    Math.sin(dLon / 2) ** 2;

  return 2 * earthRadius *
    Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export const detectPossibleDuplicate = async ({
  corporationId,
  categoryId,
  title,
  description,
  longitude,
  latitude
}) => {
  const cutoffDate = new Date(
    Date.now() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000
  );

  const candidates = await Complaint.find({
    corporation: corporationId,
    category: categoryId,

    createdAt: { $gte: cutoffDate },

    status: {
      $nin: ["REJECTED", "RESOLVED"]
    },

    location: {
      $near: {
        $geometry: {
          type: "Point",
          coordinates: [longitude, latitude]
        },
        $maxDistance: SEARCH_RADIUS_METERS
      }
    }
  })
    .select("_id complaintNumber title description location createdAt status")
    .limit(10)
    .lean();

  if (!candidates.length) return null;

  const submittedText = `${title} ${description}`;

  let bestMatch = null;

  for (const candidate of candidates) {
    const [candidateLongitude, candidateLatitude] =
      candidate.location.coordinates;

    const distanceMeters = calculateDistanceMeters(
      longitude,
      latitude,
      candidateLongitude,
      candidateLatitude
    );

    const textSimilarity = calculateTextSimilarity(
      submittedText,
      `${candidate.title} ${candidate.description}`
    );

    const locationScore = Math.max(
      0,
      1 - distanceMeters / SEARCH_RADIUS_METERS
    );

    const matchScore =
      0.55 * textSimilarity +
      0.45 * locationScore;

    if (
      textSimilarity < MIN_TEXT_SIMILARITY ||
      matchScore < MIN_MATCH_SCORE
    ) {
      continue;
    }

    if (!bestMatch || matchScore > bestMatch.similarityScore) {
      bestMatch = {
        complaint: candidate,
        similarityScore: Number(matchScore.toFixed(4)),
        textSimilarity: Number(textSimilarity.toFixed(4)),
        distanceMeters: Math.round(distanceMeters)
      };
    }
  }

  return bestMatch;
};
