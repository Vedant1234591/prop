const mongoose = require("mongoose");

// ✅ Reusable sub-schema for uploaded Cloudinary files
const CloudinaryFileSchema = new mongoose.Schema(
  {
    public_id: { type: String, required: true },
    secure_url: { type: String, required: true },
    format: { type: String },
    resource_type: { type: String, default: "image" },
    bytes: { type: Number },
    created_at: { type: Date, default: Date.now },
    verified: { type: Boolean, default: false },
  },
  { _id: false }
);

// ✅ Office location (relaxed validation)
const OfficeLocationSchema = new mongoose.Schema(
  {
    officeName: { type: String, trim: true },
    address: {
      state: { type: String, trim: true },
      district: { type: String, trim: true },
      city: { type: String, trim: true },
      pinCode: { type: String, trim: true },
      fullAddress: { type: String, trim: true },
    },
    gstin: { type: String, trim: true, uppercase: true },
    primary: { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

// ✅ Tax assessment (no regex)
const TaxAssessmentSchema = new mongoose.Schema(
  {
    pan: { type: String, trim: true, uppercase: true },
    itrType: { type: String, trim: true },
    assessmentYear: { type: String, trim: true },
    ackNumber: { type: String, trim: true },
    profitGainFromBusiness: { type: Number, default: 0 },
    grossReceipts: { type: Number, default: 0 },
    documents: { type: [CloudinaryFileSchema], default: [] },
  },
  { _id: false }
);

// ✅ Main Seller Schema
const sellerSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    BusinessType: { type: String, required: true, trim: true },
    adminVerified: { type: Boolean, default: false },

    PersonalDetails: {
      type: [String],
      default: [],
      validate: {
        validator: (arr) => Array.isArray(arr),
        message: "PersonalDetails must be an array of strings",
      },
    },

    BusinessDetails: {
      type: [String],
      default: [],
      validate: {
        validator: (arr) => Array.isArray(arr),
        message: "BusinessDetails must be an array of strings",
      },
    },

    BusinessName: { type: String, required: true, trim: true },

    Aadhaar: { type: CloudinaryFileSchema, required: true },
    Pancard: { type: CloudinaryFileSchema, required: true },

    officeLocations: { type: [OfficeLocationSchema], default: [] },
    taxAssessments: { type: [TaxAssessmentSchema], default: [] },
  },
  { timestamps: true }
);

// ✅ Ensure only one primary office
sellerSchema.pre("save", function (next) {
  if (!this.officeLocations || this.officeLocations.length === 0) return next();

  const primaries = this.officeLocations.filter((o) => o.primary);
  if (primaries.length > 1) {
    let seen = false;
    this.officeLocations = this.officeLocations.map((o) => {
      if (o.primary && !seen) {
        seen = true;
        return o;
      }
      return { ...o.toObject(), primary: false };
    });
  } else if (primaries.length === 0) {
    this.officeLocations[0].primary = true;
  }
  next();
});

module.exports = mongoose.model("Seller", sellerSchema);