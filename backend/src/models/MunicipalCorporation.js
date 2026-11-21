
import mongoose from "mongoose";

const municipalCorporationSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true
    },
    code: {
      type: String,
      required: true,
      uppercase: true,
      trim: true
    },
    city: {
      type: String,
      required: true,
      trim: true
    },
    state: {
      type: String,
      default: "Maharashtra"
    },
    isActive: {
      type: Boolean,
      default: true
    }
  },
  { timestamps: true }
);

municipalCorporationSchema.index({ code: 1 }, { unique: true });

export default mongoose.model(
  "MunicipalCorporation",
  municipalCorporationSchema
);
