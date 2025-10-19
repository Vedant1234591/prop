const mongoose = require('mongoose');

const projectSchema = new mongoose.Schema({
  // Admin Verification Fields
  adminStatus: {
    type: String,
    enum: ['pending', 'approved', 'rejected', 'defected'],
    default: 'pending'
  },
  adminRemarks: String,
  adminVerifiedAt: Date,
  adminVerifiedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },

  // Bidding Round Fields - FIXED: Added round3 and corrected currentRound enum
  biddingRounds: {
    round1: {
      startDate: Date,
      endDate: Date,
      status: {
        type: String,
        enum: ['pending', 'active', 'completed'],
        default: 'pending'
      },
      selectedBids: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Bid'
      }]
    },
    round2: {
      startDate: Date,
      endDate: Date,
      status: {
        type: String,
        enum: ['pending', 'active', 'completed'],
        default: 'pending'
      },
      selectedBids: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Bid'
      }]
    },
    round3: {
      winningBid: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Bid'
      },
      completedAt: Date,
      status: {
        type: String,
        enum: ['pending', 'completed'],
        default: 'pending'
      }
    },
    currentRound: {
      type: Number,
      enum: [1, 1.5, 2, 3], // FIXED: Added 1.5 for selection phase
      default: 1
    },
    round1Completed: { type: Boolean, default: false },
    round2Completed: { type: Boolean, default: false }
  },

  // Selection Timeline
  selectionDeadline: Date,

  // EXISTING FIELDS
  title: {
    type: String,
    required: [true, 'Project title is required'],
    trim: true,
    maxlength: [200, 'Title cannot exceed 200 characters']
  },
  description: {
    type: String,
    required: [true, 'Project description is required'],
    trim: true
  },
  category: {
    type: String,
    enum: ['electrification', 'architecture', 'interior-design', 'general-construction'],
    required: [true, 'Project category is required']
  },
  customer: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  location: {
    address: { type: String, required: [true, 'Address is required'] },
    city: { type: String, required: [true, 'City is required'] },
    state: { type: String, required: [true, 'State is required'] },
    zipCode: { type: String, required: [true, 'ZIP code is required'] },
    coordinates: {
      lat: Number,
      lng: Number
    }
  },
  contact: {
    phone: { type: String, required: [true, 'Contact phone is required'] },
    email: String
  },
  timeline: {
    startDate: { type: Date, required: [true, 'Start date is required'] },
    endDate: { 
      type: Date, 
      required: [true, 'End date is required']
    },
    duration: Number
  },
  requirements: {
    type: String,
    required: [true, 'Project requirements are required']
  },
  specifications: {
    type: Map,
    of: String,
    default: new Map()
  },
  images: [{
    public_id: { type: String, required: true },
    url: { type: String, required: true },
    filename: String,
    format: String,
    bytes: Number,
    width: Number,
    height: Number,
    createdAt: { type: Date, default: Date.now }
  }],
  documents: [{
    public_id: { type: String, required: true },
    url: { type: String, required: true },
    filename: String,
    format: String,
    bytes: Number,
    originalName: String,
    uploadedAt: { type: Date, default: Date.now }
  }],
  // FIXED: Added 'awarded' to status enum
  status: {
    type: String,
    enum: ['awarded','active','drafted', 'submitted', 'approved', 'rejected','failed', 'defected', 'completed', 'cancelled','pending','in-progress'],
    default: 'drafted'
  },
  adminStatus: {
    type: String,
    enum: ['pending', 'approved', 'rejected', 'defected','active'],
    default: 'pending'
  },
  bidSettings: {
    startingBid: { 
      type: Number, 
      required: [true, 'Starting bid amount is required'],
      min: [0, 'Starting bid must be positive']
    },
    bidEndDate: { 
      type: Date, 
      required: [true, 'Bid end date is required']
    },
    isActive: { type: Boolean, default: false },
    autoSelectWinner: { type: Boolean, default: true }
  },
  bids: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Bid'
  }],
  selectedBid: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Bid'
  },
  featuredImage: {
    public_id: String,
    url: String
  },
  isPublic: {
    type: Boolean,
    default: false
  },
  viewCount: { type: Number, default: 0 },
  biddingCompleted: { type: Boolean, default: false },
  winnerSelectedAt: Date,
  contractGenerated: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
  completedAt: Date,
  isArchived: { type: Boolean, default: false },
  archivedAt: Date
});

// Pre-save middleware
projectSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  
  // Calculate duration in days
  if (this.timeline.startDate && this.timeline.endDate) {
    const durationMs = this.timeline.endDate - this.timeline.startDate;
    this.timeline.duration = Math.ceil(durationMs / (1000 * 60 * 60 * 24));
  }
  
  // Set featured image if not set and images exist
  if (!this.featuredImage?.url && this.images.length > 0) {
    this.featuredImage = {
      public_id: this.images[0].public_id,
      url: this.images[0].url
    };
  }
  
  // Handle admin status changes
  if (this.adminStatus === 'approved' && this.status === 'pending') {
    this.status = 'active';
    this.bidSettings.isActive = true;
    this.isPublic = true;
    
    // Start Round 1 bidding
    if (!this.biddingRounds.round1.startDate) {
      this.biddingRounds.round1.startDate = new Date();
      this.biddingRounds.round1.endDate = this.bidSettings.bidEndDate;
      this.biddingRounds.round1.status = 'active';
      this.biddingRounds.currentRound = 1;
    }
  }
  
  // Handle rejected/defected status
  if (this.adminStatus === 'rejected') {
    this.status = 'defected';
    this.bidSettings.isActive = false;
    this.isPublic = false;
  }
  
  next();
});

// Method to submit for admin verification
projectSchema.methods.submitForVerification = function() {
  this.adminStatus = 'pending';
  this.status = 'pending';
  return this.save();
};

// Method for admin to approve project
projectSchema.methods.approveByAdmin = function(adminId) {
  this.adminStatus = 'approved';
  this.status = 'active';
  this.adminVerifiedBy = adminId;
  this.adminVerifiedAt = new Date();
  this.bidSettings.isActive = true;
  this.isPublic = true;
  
  // Start Round 1 bidding
  this.biddingRounds.round1.startDate = new Date();
  this.biddingRounds.round1.endDate = this.bidSettings.bidEndDate;
  this.biddingRounds.round1.status = 'active';
  this.biddingRounds.currentRound = 1;
  
  return this.save();
};

// Method for admin to reject project
projectSchema.methods.rejectByAdmin = function(adminId, remarks) {
  this.adminStatus = 'rejected';
  this.status = 'defected';
  this.adminRemarks = remarks;
  this.adminVerifiedBy = adminId;
  this.adminVerifiedAt = new Date();
  this.bidSettings.isActive = false;
  this.isPublic = false;
  return this.save();
};

// Method for customer to resubmit after edits
projectSchema.methods.resubmitForVerification = function() {
  this.adminStatus = 'pending';
  this.status = 'pending';
  this.adminRemarks = undefined;
  return this.save();
};

// Method to check if project is visible to sellers
projectSchema.methods.isVisibleToSellers = function() {
  return this.status === 'active' && 
         this.bidSettings.isActive && 
         this.isPublic &&
         this.adminStatus === 'approved';
};

// FIXED: Method to complete round 1 and select top 10
projectSchema.methods.completeRound1 = function(top10Bids) {
  this.biddingRounds.round1.status = 'completed';
  this.biddingRounds.round1.selectedBids = top10Bids;
  this.biddingRounds.round1Completed = true;
  this.biddingRounds.currentRound = 1.5; // Selection phase
  this.selectionDeadline = new Date(Date.now() + 2 * 60 * 1000); // 24 hours
  return this.save();
};

// In projectSchema.methods.selectTop3 - Update the timing:
projectSchema.methods.selectTop3 = function(top3Bids) {
  this.biddingRounds.round2.selectedBids = top3Bids;
  this.biddingRounds.round2.startDate = new Date();
  this.biddingRounds.round2.endDate = new Date(Date.now() + 2 * 60 * 1000); // 24 hours
  this.biddingRounds.round2.status = 'active';
  this.biddingRounds.currentRound = 2;
  return this.save();
};
// FIXED: Method to complete round 2 and select winner
projectSchema.methods.completeRound2 = function(winningBidId) {
  this.biddingRounds.round2.status = 'completed';
  this.biddingRounds.round2Completed = true;
  this.biddingRounds.round3.winningBid = winningBidId;
  this.biddingRounds.round3.status = 'completed';
  this.biddingRounds.round3.completedAt = new Date();
  this.biddingRounds.currentRound = 3;
  this.selectedBid = winningBidId;
  this.status = 'awarded';
  this.biddingCompleted = true;
  this.winnerSelectedAt = new Date();
  return this.save();
};

// Method to mark project as failed if no selection in time
projectSchema.methods.markAsFailed = function() {
  this.status = 'failed';
  this.biddingCompleted = true;
  this.bidSettings.isActive = false;
  this.biddingRounds.currentRound = 3;
  return this.save();
};

// Instance Methods
projectSchema.methods.addImage = function(imageData) {
  this.images.push(imageData);
  return this.save();
};

projectSchema.methods.addDocument = function(documentData) {
  this.documents.push(documentData);
  return this.save();
};

projectSchema.methods.removeImage = function(publicId) {
  this.images = this.images.filter(img => img.public_id !== publicId);
  return this.save();
};

projectSchema.methods.removeDocument = function(publicId) {
  this.documents = this.documents.filter(doc => doc.public_id !== publicId);
  return this.save();
};

// Indexes
projectSchema.index({ customer: 1, status: 1 });
projectSchema.index({ category: 1, status: 1 });
projectSchema.index({ 'bidSettings.bidEndDate': 1 });
projectSchema.index({ createdAt: -1 });
projectSchema.index({ isPublic: 1 });
projectSchema.index({ adminStatus: 1 });
projectSchema.index({ 'biddingRounds.currentRound': 1 });
projectSchema.index({ status: 1, 'bidSettings.isActive': 1 });

module.exports = mongoose.model('Project', projectSchema);