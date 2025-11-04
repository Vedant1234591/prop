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
    enum: ['submitted', 'selected-round1', 'selected-round2', 'won', 'lost', 'defected', 'waiting-queue'],
    default: 'submitted'
  },
  isActiveInRound: {
    type: Boolean,
    default: true
  },
  
  // Resubmission deadline for defected bids
  resubmissionDeadline: Date,
  
  // Bid revision tracking
  revisions: [{
    round: Number,
    amount: Number,
    proposal: String,
    agreementResponses: [{
      clauseId: mongoose.Schema.Types.ObjectId,
      agreed: Boolean,
      remarks: String
    }],
    revisedAt: {
      type: Date,
      default: Date.now
    },
    revisionType: {
      type: String,
      enum: ['initial', 'resubmission', 'round2-update'],
      default: 'initial'
    }
  }],

  // Agreement Responses
  agreementResponses: {
    submitted: {
      type: Boolean,
      default: false
    },
    responses: [{
      clauseId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Agreement'
      },
      agreed: {
        type: Boolean,
        required: true
      },
      supportingDocs: [{
        public_id: String,
        url: String,
        filename: String,
        bytes: Number,
        uploadedAt: {
          type: Date,
          default: Date.now
        }
      }],
      remarks: String,
      submittedAt: {
        type: Date,
        default: Date.now
      }
    }],
    submittedAt: Date,
    status: {
      type: String,
      enum: ['pending', 'approved', 'defected', 'resubmitted'],
      default: 'pending'
    },
    adminRemarks: String,
    defectCount: {
      type: Number,
      default: 0
    },
    maxDefectCount: {
      type: Number,
      default: 3
    },
    defectHistory: [{
      remarks: String,
      defectedAt: Date,
      resubmittedAt: Date,
      adminId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      }
    }]
  },

  // Round 2 bid (if selected)
  round2Bid: {
    amount: {
      type: Number,
      min: [0, 'Bid amount must be positive']
    },
    proposal: String,
    submittedAt: Date,
    revisionCount: {
      type: Number,
      default: 0
    },
    lastUpdatedAt: Date
  },

  // Selection tracking
  queuePosition: Number,
  isInWaitingQueue: {
    type: Boolean,
    default: false
  },

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
  status: {
    type: String,
    enum: ['submitted', 'won', 'lost', 'in-progress', 'completed', 'cancelled', 'selected', 'awarded', 'defected'],
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

// ============ ENHANCED BID MANAGEMENT METHODS ============

// Method to submit initial Round 1 bid
bidSchema.methods.submitRound1Bid = function(amount, proposal, agreementResponses) {
  this.amount = amount;
  this.proposal = proposal;
  this.round = 1;
  this.selectionStatus = 'submitted';
  this.status = 'submitted';
  this.isActiveInRound = true;
  
  // Set agreement responses
  this.agreementResponses.responses = agreementResponses;
  this.agreementResponses.submitted = true;
  this.agreementResponses.submittedAt = new Date();
  this.agreementResponses.status = 'pending';
  
  // Add to revision history
  this.revisions.push({
    round: 1,
    amount: amount,
    proposal: proposal,
    agreementResponses: agreementResponses,
    revisedAt: new Date(),
    revisionType: 'initial'
  });
  
  this.revisionCount += 1;
  this.lastRevisedAt = new Date();
  
  return this.save();
};

// Method to handle defect with 24-hour resubmission deadline
bidSchema.methods.handleDefectWithDeadline = function(remarks, adminId = null) {
  this.agreementResponses.status = 'defected';
  this.agreementResponses.adminRemarks = remarks;
  this.agreementResponses.defectCount += 1;
  this.selectionStatus = 'defected';
  this.status = 'defected';
  this.isActiveInRound = false;
  
  // Set resubmission deadline (24 hours)
  this.resubmissionDeadline = new Date(Date.now() + 24 * 60 * 60 * 1000);
  
  // Add to defect history
  this.agreementResponses.defectHistory.push({
    remarks: remarks,
    defectedAt: new Date(),
    adminId: adminId
  });
  
  return this.save();
};

// Method to resubmit after defect
bidSchema.methods.resubmitAfterDefect = async function(amount, proposal, agreementResponses) {
  try {
    // Check if deadline has passed
    if (this.isResubmissionDeadlinePassed()) {
      throw new Error('Resubmission deadline has passed');
    }

    // Check max defect count
    if (this.agreementResponses.defectCount >= this.agreementResponses.maxDefectCount) {
      throw new Error('Maximum resubmission attempts reached');
    }

    // Update bid details
    this.amount = amount;
    this.proposal = proposal;
    this.agreementResponses.responses = agreementResponses;
    this.agreementResponses.status = 'resubmitted';
    this.agreementResponses.submittedAt = new Date();
    this.selectionStatus = 'selected-round1';
    this.status = 'selected';
    this.isActiveInRound = true;
    this.resubmissionDeadline = null;
    
    // Update defect history
    const lastDefect = this.agreementResponses.defectHistory[this.agreementResponses.defectHistory.length - 1];
    if (lastDefect) {
      lastDefect.resubmittedAt = new Date();
    }
    
    // Add revision
    this.revisions.push({
      round: this.round,
      amount: amount,
      proposal: proposal,
      agreementResponses: agreementResponses,
      revisedAt: new Date(),
      revisionType: 'resubmission'
    });
    
    this.revisionCount += 1;
    this.lastRevisedAt = new Date();

    return this.save();
  } catch (error) {
    console.error('Resubmit after defect error:', error);
    throw error;
  }
};

// Method to update bid for Round 2
bidSchema.methods.updateForRound2 = async function(amount, proposal) {
  try {
    // Validate that bid is in Round 2 and active
    if (this.round !== 2 || !this.isActiveInRound || this.selectionStatus !== 'selected-round2') {
      throw new Error('Cannot update bid in this round');
    }

    // Update bid using the round2Bid field
    if (!this.round2Bid) {
      this.round2Bid = {
        amount: amount,
        proposal: proposal,
        submittedAt: new Date(),
        revisionCount: 1,
        lastUpdatedAt: new Date()
      };
    } else {
      this.round2Bid.amount = amount;
      this.round2Bid.proposal = proposal;
      this.round2Bid.revisionCount += 1;
      this.round2Bid.lastUpdatedAt = new Date();
    }

    // Add to revision history
    this.revisions.push({
      round: 2,
      amount: amount,
      proposal: proposal,
      revisedAt: new Date(),
      revisionType: 'round2-update'
    });
    
    this.revisionCount += 1;
    this.lastRevisedAt = new Date();

    return this.save();
  } catch (error) {
    console.error('Update for Round 2 error:', error);
    throw error;
  }
};

// Method to check if resubmission deadline has passed
bidSchema.methods.isResubmissionDeadlinePassed = function() {
  if (!this.resubmissionDeadline) return false;
  return new Date() > this.resubmissionDeadline;
};

// Method to get remaining resubmission time
bidSchema.methods.getRemainingResubmissionTime = function() {
  if (!this.resubmissionDeadline) return null;
  
  const now = new Date();
  const timeLeft = this.resubmissionDeadline - now;
  
  if (timeLeft <= 0) return 'Expired';
  
  const hours = Math.floor(timeLeft / (1000 * 60 * 60));
  const minutes = Math.floor((timeLeft % (1000 * 60 * 60)) / (1000 * 60));
  
  return `${hours}h ${minutes}m`;
};

// Method to automatically mark as lost if resubmission deadline passed
bidSchema.methods.autoMarkAsLostIfExpired = async function() {
  if (this.isResubmissionDeadlinePassed() && this.selectionStatus === 'defected') {
    this.selectionStatus = 'lost';
    this.status = 'lost';
    this.isActiveInRound = false;
    await this.save();
    return true;
  }
  return false;
};

// Method to mark as selected in round 1 (top 3)
bidSchema.methods.markAsSelectedRound1 = function() {
  this.selectionStatus = 'selected-round1';
  this.status = 'selected';
  this.isSelected = true;
  this.isActiveInRound = true;
  this.isInWaitingQueue = false;
  this.queuePosition = null;
  return this.save();
};

// Method to mark as selected in round 2 (top 3)
bidSchema.methods.markAsSelectedRound2 = function() {
  this.selectionStatus = 'selected-round2';
  this.status = 'selected';
  this.isActiveInRound = true;
  this.round = 2;
  
  // Initialize round2Bid if not exists
  if (!this.round2Bid) {
    this.round2Bid = {
      amount: this.amount,
      proposal: this.proposal,
      submittedAt: new Date(),
      revisionCount: 0,
      lastUpdatedAt: new Date()
    };
  }
  
  return this.save();
};

// Method to mark as won
bidSchema.methods.markAsWon = function() {
  this.selectionStatus = 'won';
  this.status = 'won';
  this.isSelected = true;
  this.isActiveInRound = false;
  return this.save();
};

// Method to mark as lost
bidSchema.methods.markAsLost = function() {
  this.selectionStatus = 'lost';
  this.status = 'lost';
  this.isActiveInRound = false;
  this.isSelected = false;
  this.isInWaitingQueue = false;
  this.queuePosition = null;
  return this.save();
};

// Method to add to waiting queue
bidSchema.methods.addToWaitingQueue = function(position) {
  this.selectionStatus = 'waiting-queue';
  this.isInWaitingQueue = true;
  this.queuePosition = position;
  this.isActiveInRound = true;
  return this.save();
};

// Method to remove from waiting queue
bidSchema.methods.removeFromWaitingQueue = function() {
  this.isInWaitingQueue = false;
  this.queuePosition = null;
  return this.save();
};

// Method to check if bid can be updated in current round
bidSchema.methods.canUpdateInCurrentRound = async function() {
  const Project = mongoose.model('Project');
  const project = await Project.findById(this.project);
  if (!project) return false;
  
  // Check if bid is active in current round
  if (!this.isActiveInRound || this.selectionStatus === 'defected') {
    return false;
  }
  
  // Check round deadlines
  const now = new Date();
  if (this.round === 1) {
    return project.biddingRounds.round1.status === 'active' && 
           now < project.biddingRounds.round1.endDate;
  } else if (this.round === 2) {
    return project.biddingRounds.round2.status === 'active' && 
           now < project.biddingRounds.round2.endDate;
  }
  
  return false;
};

// Static method to get top bids for a project and round
bidSchema.statics.getTopBidsByAmount = function(projectId, round, limit = 10) {
  return this.find({
    project: projectId,
    round: round,
    selectionStatus: 'submitted',
    'agreementResponses.submitted': true
  })
  .sort({ amount: 1 }) // Lowest amount first
  .limit(limit)
  .populate('seller');
};

// Static method to get bids by selection status
bidSchema.statics.getBidsBySelectionStatus = function(projectId, selectionStatus) {
  return this.find({
    project: projectId,
    selectionStatus: selectionStatus
  }).populate('seller');
};

// Static method to get waiting queue bids
bidSchema.statics.getWaitingQueueBids = function(projectId) {
  return this.find({
    project: projectId,
    selectionStatus: 'waiting-queue'
  })
  .sort({ queuePosition: 1 })
  .populate('seller');
};

// Static method to find expired defected bids
bidSchema.statics.findExpiredDefectedBids = function() {
  return this.find({
    selectionStatus: 'defected',
    resubmissionDeadline: { $lte: new Date() }
  }).populate('project');
};

// Static method to get defected bids with active resubmission time
bidSchema.statics.getActiveDefectedBids = function(sellerId = null) {
  const query = {
    selectionStatus: 'defected',
    resubmissionDeadline: { $gt: new Date() },
    'agreementResponses.defectCount': { $lt: 3 } // Max defect count
  };
  
  if (sellerId) {
    query.seller = sellerId;
  }
  
  return this.find(query)
    .populate('project')
    .sort({ resubmissionDeadline: 1 });
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
bidSchema.index({ isInWaitingQueue: 1, queuePosition: 1 });
bidSchema.index({ resubmissionDeadline: 1 });
bidSchema.index({ selectionStatus: 1, resubmissionDeadline: 1 });
bidSchema.index({ seller: 1, selectionStatus: 1, resubmissionDeadline: 1 });
bidSchema.index({ seller: 1, selectionStatus: 1, updatedAt: -1 });

module.exports = mongoose.model('Bid', bidSchema);