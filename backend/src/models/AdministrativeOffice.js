import mongoose from "mongoose";

const administrativeOfficeSchema = new mongoose.Schema(
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
      uppercase: true,
    },

    officeType: {
      type: String,
      enum: ["WARD_OFFICE", "REGIONAL_OFFICE", "OTHER"],
      default: "OTHER",
    },

    corporation: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "MunicipalCorporation",
      required: true,
    },

    zone: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Zone",
      default: null,
    },

    address: {
      type: String,
      default: "",
    },

    // Verified administrative-office GeoJSON boundary.
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

administrativeOfficeSchema.index(
  { corporation: 1, code: 1 },
  { unique: true }
);

administrativeOfficeSchema.index({
  boundary: "2dsphere",
});

export default mongoose.model(
  "AdministrativeOffice",
  administrativeOfficeSchema
);