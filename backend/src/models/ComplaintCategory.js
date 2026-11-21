
import mongoose from "mongoose";

const complaintCategorySchema = new mongoose.Schema(
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
    description: {
      type: String,
      default: ""
    },
    corporation: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "MunicipalCorporation",
      required: true
    },
    department: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Department",
      required: true
    },
    parentCategory: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ComplaintCategory",
      default: null
    },
    keywords: {
      type: [String],
      default: []
    },
    defaultSeverity: {
      type: String,
      enum: ["LOW", "MEDIUM", "HIGH", "CRITICAL"],
      default: "MEDIUM"
    },
    isActive: {
      type: Boolean,
      default: true
    }
  },
  { timestamps: true }
);

complaintCategorySchema.index(
  { corporation: 1, code: 1 },
  { unique: true }
);

export default mongoose.model(
  "ComplaintCategory",
  complaintCategorySchema
);
