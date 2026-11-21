
import mongoose from "mongoose";

const zoneSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    code: {
      type: String,
      required: true,
      trim: true,
    },
    corporation: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "MunicipalCorporation",
      required: true,
    },
    boundary: {
      type: {
        type: String,
        enum: ["Polygon", "MultiPolygon"],
      },
      coordinates: {
        type: mongoose.Schema.Types.Mixed,
      },
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

zoneSchema.index(
  { corporation: 1, code: 1 },
  { unique: true }
);

zoneSchema.index({ boundary: "2dsphere" });

const Zone =
  mongoose.models.Zone || mongoose.model("Zone", zoneSchema);

export default Zone;
