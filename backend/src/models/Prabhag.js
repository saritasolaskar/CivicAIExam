
import mongoose from "mongoose";

const prabhagSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      trim: true,
      default: "",
    },
    number: {
      type: String,
      required: true,
      trim: true,
    },
    // Original ID from the downloaded dataset.
    // This may repeat across multiple geographic features.
    sourcePrabhagId: {
      type: String,
      trim: true,
      default: "",
    },
    corporation: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "MunicipalCorporation",
      required: true,
    },
    administrativeOffice: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "AdministrativeOffice",
      required: true,
    },
    boundary: {
      type: {
        type: String,
        enum: ["Polygon", "MultiPolygon"],
      },
      coordinates: {
        type: Array,
        default: undefined,
      },
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

prabhagSchema.index(
  { corporation: 1, number: 1 },
  { unique: true }
);

prabhagSchema.index({ boundary: "2dsphere" });

export default mongoose.model("Prabhag", prabhagSchema);
