
import mongoose from "mongoose";
import bcrypt from "bcryptjs";

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      minlength: 2
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true
    },
    phone: {
      type: String,
      trim: true,
      default: ""
    },
    password: {
      type: String,
      required: true,
      minlength: 8,
      select: false
    },
    role: {
      type: String,
      enum: ["CITIZEN", "OFFICER", "ADMIN"],
      default: "CITIZEN"
    },
    corporation: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "MunicipalCorporation",
      default: null
    },
    department: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Department",
      default: null
    },
    administrativeOffice: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "AdministrativeOffice",
      default: null
    },
    isActive: {
      type: Boolean,
      default: true
    }
  },
  { timestamps: true }
);

userSchema.pre("validate", function () {
  if (this.role === "OFFICER" && (!this.corporation || !this.department)) {
    this.invalidate(
      "department",
      "Officers must be linked to a corporation and department"
    );
  }
});

userSchema.pre("save", async function () {
  if (this.isModified("password")) {
    this.password = await bcrypt.hash(this.password, 12);
  }
});

export default mongoose.model("User", userSchema);
