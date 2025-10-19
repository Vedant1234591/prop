const mongoose = require('mongoose');

const bidSchema = new mongoose.Schema({
  // Round and Selection Status Fields
  round: {
    type: Number,
    enum: [1, 2],
    default: 1
  },
  selectionStatus: {
    type: String,
    enum: ['submitted', 'selected-round1', 'selected-round2', 'won', 'lost'],
    default: 'submitted'
  },
  isActiveInRound: {
    type: Boolean,
    default: true
  },
  
  // Bid revision tracking
  revisions: [{
    round: Number,
    amount: Number,
    proposal: String,
    revisedAt: Date
  }],

  // EXISTING FIELDS
  project: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Project',
    required: [true, 'Project reference is required']
  },
  seller: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Seller reference is required']
  },
  customer: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Customer reference is required']
  },
  amount: {
    type: Number,
    required: [true, 'Bid amount is required'],
    min: [0, 'Bid amount must be positive']
  },
  proposal: {
    type: String,
    required: [true, 'Proposal description is required'],
    trim: true,
    maxlength: [2000, 'Proposal cannot exceed 2000 characters']
  },
  timeline: {
    startDate: Date,
    endDate: Date,
    duration: Number
  },
  attachments: [{
    public_id: { type: String, required: true },
    url: { type: String, required: true },
    filename: String,
    format: String,
    bytes: Number,
    originalName: String,
    description: String,
    uploadedAt: { type: Date, default: Date.now }
  }],
// In bidSchema, update status enum:
status: {
  type: String,
  enum: ['submitted', 'won', 'lost', 'in-progress', 'completed', 'cancelled', 'selected', 'awarded'],
  default: 'submitted'
},
  isSelected: { type: Boolean, default: false },
  sellerAction: {
    type: String,
    enum: ['pending', 'contract-uploaded', 'completed'],
    default: 'pending'
  },
  customerAction: {
    type: String,
    enum: ['pending', 'contract-uploaded', 'completed'],
    default: 'pending'
  },
  adminVerified: { type: Boolean, default: false },
  certificateGenerated: { type: Boolean, default: false },
  certificateUrl: String,
  notes: { type: String, maxlength: [500, 'Notes cannot exceed 500 characters'] },
  revisionCount: { type: Number, default: 0 },
  lastRevisedAt: Date,
  bidSubmittedAt: { type: Date, default: Date.now },
  contractCreated: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

// Pre-save middleware
bidSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  
  if (this.timeline.startDate && this.timeline.endDate) {
    const durationMs = this.timeline.endDate - this.timeline.startDate;
    this.timeline.duration = Math.ceil(durationMs / (1000 * 60 * 60 * 24));
  }
  
  next();
});

// NEW: Instance method to add revision
bidSchema.methods.addRevision = function(round, amount, proposal) {
  this.revisions.push({
    round: round,
    amount: amount,
    proposal: proposal,
    revisedAt: new Date()
  });
  this.revisionCount += 1;
  this.lastRevisedAt = new Date();
  return this.save();
};

// NEW: Instance method to check if bid can be edited in current round
bidSchema.methods.canEditInRound = async function() {
  if (!this.isActiveInRound) return false;
  
  const project = await mongoose.model('Project').findById(this.project);
  if (!project) return false;
  
  let roundEndDate;
  if (this.round === 1) {
    roundEndDate = project.biddingRounds.round1.endDate;
  } else if (this.round === 2) {
    roundEndDate = project.biddingRounds.round2.endDate;
  } else {
    return false;
  }
  
  return new Date() < roundEndDate;
};

// NEW: Method to mark as selected in round 1 (top 10)
bidSchema.methods.markAsSelectedRound1 = function() {
  this.selectionStatus = 'selected-round1';
  this.status = 'selected';
  this.isSelected = true;
  return this.save();
};

// NEW: Method to mark as selected in round 2 (top 3)
bidSchema.methods.markAsSelectedRound2 = function() {
  this.selectionStatus = 'selected-round2';
  this.status = 'selected';
  this.isActiveInRound = true;
  this.round = 2;
  return this.save();
};

// NEW: Method to mark as won
bidSchema.methods.markAsWon = function() {
  this.selectionStatus = 'won';
  this.status = 'won';
  this.isSelected = true;
  this.isActiveInRound = false;
  return this.save();
};

// NEW: Method to mark as lost
bidSchema.methods.markAsLost = function() {
  this.selectionStatus = 'lost';
  this.status = 'lost';
  this.isActiveInRound = false;
  this.isSelected = false;
  return this.save();
};
// Add this method to your bidSchema:
bidSchema.methods.updateForRound2 = function(amount, proposal) {
  const oldAmount = this.amount;
  const oldProposal = this.proposal;
  
  this.amount = amount;
  this.proposal = proposal;
  this.round = 2;
  
  // Add to revisions
  this.revisions.push({
    round: 2,
    amount: amount,
    proposal: proposal,
    previousAmount: oldAmount,
    previousProposal: oldProposal,
    revisedAt: new Date()
  });
  
  this.revisionCount += 1;
  this.lastRevisedAt = new Date();
  return this.save();
};

// NEW: Static method to get top bids for a project and round
bidSchema.statics.getTopBidsByAmount = function(projectId, round, limit = 10) {
  return this.find({
    project: projectId,
    round: round,
    selectionStatus: 'submitted'
  })
  .sort({ amount: -1 })
  .limit(limit)
  .populate('seller');
};

// NEW: Static method to get bids by selection status
bidSchema.statics.getBidsBySelectionStatus = function(projectId, selectionStatus) {
  return this.find({
    project: projectId,
    selectionStatus: selectionStatus
  }).populate('seller');
};

// Indexes
bidSchema.index({ project: 1, seller: 1 });
bidSchema.index({ seller: 1, status: 1 });
bidSchema.index({ customer: 1, status: 1 });
bidSchema.index({ createdAt: -1 });
bidSchema.index({ amount: 1 });
bidSchema.index({ project: 1, status: 1, amount: -1 });
bidSchema.index({ project: 1, round: 1, selectionStatus: 1 });
bidSchema.index({ project: 1, round: 1, amount: -1 });
bidSchema.index({ selectionStatus: 1 });

module.exports = mongoose.model('Bid', bidSchema);