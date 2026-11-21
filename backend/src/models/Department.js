
import mongoose from "mongoose";

const departmentSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true
    },
    code: {
      type: String,
      required: true,
      trim: true,
      uppercase: true
    },
    corporation: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "MunicipalCorporation",
      required: true
    },
    description: {
      type: String,
      default: ""
    },
    isActive: {
      type: Boolean,
      default: true
    }
  },
  { timestamps: true }
);

departmentSchema.index(
  { corporation: 1, code: 1 },
  { unique: true }
);

export default mongoose.model("Department", departmentSchema);
