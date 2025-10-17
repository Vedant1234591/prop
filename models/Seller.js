const mongoose = require('mongoose');

const CloudinaryFileSchema = new mongoose.Schema({
  public_id: { type: String, required: true },
  secure_url: { type: String, required: true },
  format: { type: String },
  resource_type: { type: String, default: 'image' },
  bytes: { type: Number },
  created_at: { type: Date, default: Date.now },
  verified: { type: Boolean, default: false }
}, { _id: false });



const OfficeLocationSchema = new mongoose.Schema({



  officeName: { type: String, required: true, trim: true },
  address: { type: String, required: true, trim: true },
  gstin: {
    type: String,
    required: true,
    uppercase: true,
    trim: true,
    validate: {
      validator: function (v) {
        return /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/.test(v);
      },
      message: 'Invalid GSTIN format'
    }
  },
  primary: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now }
}, { _id: false });




const TaxAssessmentSchema = new mongoose.Schema({
  pan: {
    type: String,
    required: true,
    uppercase: true,
    trim: true,
    validate: {
      validator: v => /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/.test(v),
      message: 'Invalid PAN format'
    }
  },
  itrType: {
    type: String,
    required: true,
    enum: ['ITR-1', 'ITR-2', 'ITR-3', 'ITR-4', 'ITR-5', 'ITR-6', 'ITR-7', 'Other']
  },
  assessmentYear: {
    type: String,
    required: true,
    trim: true,
    validate: {
      validator: v => /^\d{4}-\d{2}$/.test(v),
      message: 'assessmentYear must be in YYYY-YY format, e.g., 2023-24'
    }
  },
  ackNumber: { type: String, trim: true },
  profitGainFromBusiness: { type: Number, required: true, min: 0 },
  grossReceipts: { type: Number, required: true, min: 0 },
  documents: {
    type: [CloudinaryFileSchema],
    default: []
  }
}, { _id: false });





const sellerSchema = new mongoose.Schema({
     userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  BusinessType: { type: String, required: true },
  adminVerified: { type: Boolean, default: false },

  PersonalDetails: {
    type: [String],
    required: true,
    validate: {
      validator: arr => Array.isArray(arr) && arr.length > 0,
      message: 'PersonalDetails must be a non-empty array of strings'
    }
  },

  BusinessDetails: {
    type: [String],
    required: true,
    validate: {
      validator: arr => Array.isArray(arr) && arr.length > 0,
      message: 'BusinessDetails must be a non-empty array of strings'
    }
  },

  BusinessName: { type: String, required: true, trim: true },

  Aadhaar: { type: CloudinaryFileSchema, required: true },
  Pancard: { type: CloudinaryFileSchema, required: true },

  officeLocations: {
    type: [OfficeLocationSchema],
    required: true,
    validate: {
      validator: arr => Array.isArray(arr) && arr.length > 0,
      message: 'At least one office location is required'
    }
  },

  taxAssessments: {
    type: [TaxAssessmentSchema],
    required: true,
    validate: {
      validator: arr => Array.isArray(arr) && arr.length > 0,
      message: 'At least one tax assessment is required'
    }
  }

}, { timestamps: true });

/* Optional: ensure only one primary office on save */
sellerSchema.pre('save', function (next) {
  if (!this.officeLocations || this.officeLocations.length === 0) return next();
  const primaries = this.officeLocations.filter(o => o.primary);
  if (primaries.length > 1) {
    // set the first primary true and others false
    let seen = false;
    this.officeLocations = this.officeLocations.map(o => {
      if (o.primary && !seen) { seen = true; return o; }
      return { ...o.toObject(), primary: false };
    });
  } else if (primaries.length === 0) {
    this.officeLocations[0].primary = true;
  }
  next();
});

/* Suggested index if you query PANs often inside taxAssessments */
// sellerSchema.index({ 'taxAssessments.pan': 1 });

module.exports = mongoose.model('Seller', sellerSchema);