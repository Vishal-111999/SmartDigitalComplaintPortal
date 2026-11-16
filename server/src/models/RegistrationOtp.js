const mongoose = require("mongoose");

const registrationOtpSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 100 },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      maxlength: 254,
      match: /^\S+@\S+\.\S+$/,
    },
    mobile: { type: String, required: true, match: /^\d{10}$/ },
    address: { type: String, trim: true, maxlength: 500, default: "" },
    passwordHash: { type: String, required: true, select: false },
    otpHash: { type: String, required: true, select: false },
    otpExpiresAt: { type: Date, required: true },
    cleanupAt: { type: Date, required: true },
    attempts: { type: Number, default: 0, min: 0, max: 5 },
  },
  { timestamps: true },
);

registrationOtpSchema.index({ cleanupAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model("RegistrationOtp", registrationOtpSchema);
