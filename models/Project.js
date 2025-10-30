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

  // Bidding Round Fields - ENHANCED FOR 2-ROUND SYSTEM
  biddingRounds: {
    round1: {
      startDate: Date,
      endDate: Date,
      status: {
        type: String,
        enum: ['pending', 'active', 'completed'],
        default: 'pending'
      },
      autoSelectionCompleted: {
        type: Boolean,
        default: false
      }
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
      }],
      winnerSelected: {
        type: Boolean,
        default: false
      }
    },
    currentRound: {
      type: Number,
      enum: [1, 1.5, 2,3],
      default: 1
    },
    selectionDeadline: Date, // 24 hours for customer to select top 3
    round1Completed: { type: Boolean, default: false },
    round2Completed: { type: Boolean, default: false }
  },

  // Round 1 Selection Management - ENHANCED
  round1Selections: {
    top3: [{
      bid: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Bid'
      },
      seller: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      },
      selectedAt: {
        type: Date,
        default: Date.now
      },
      selectedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      },
      status: {
        type: String,
        enum: ['selected', 'defected', 'resubmitted', 'replaced'],
        default: 'selected'
      },
      defectRemarks: String,
      defectCount: {
        type: Number,
        default: 0
      },
      defectHistory: [{
        remarks: String,
        defectedAt: Date,
        resubmittedAt: Date
      }],
      lastDefectedAt: Date,
      resubmissionDeadline: Date
    }],
    waitingQueue: [{
      bid: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Bid'
      },
      seller: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      },
      position: Number,
      originalAmount: Number,
      addedToQueueAt: {
        type: Date,
        default: Date.now
      },
      promotedAt: Date
    }],
    maxQueueSize: {
      type: Number,
      default: 7
    },
    queuePositionCounter: {
      type: Number,
      default: 4
    }
  },

  // Final Round Winner
  finalWinner: {
    bid: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Bid'
    },
    seller: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    selectedAt: Date,
    winningAmount: Number,
    round: {
      type: Number,
      default: 2
    }
  },

  // EXISTING FIELDS (keeping all your existing fields)
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
  status: {
    type: String,
    enum: ['awarded','active','drafted', 'submitted', 'approved', 'rejected','failed', 'defected', 'completed', 'cancelled','pending','in-progress'],
    default: 'drafted'
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
    autoSelectWinner: { type: Boolean, default: true },
    maxBidsPerRound: {
      type: Number,
      default: 10
    }
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

// ============ ENHANCED METHODS FOR 2-ROUND BIDDING SYSTEM ============

// Method to complete round 1 and auto-select top 3 + waiting queue
// Method to complete round 1 and auto-select top 3 + waiting queue
// Method to complete round 1 and auto-select top 3 + waiting queue
// Method to complete round 1 and auto-select top 3 + waiting queue - FIXED VERSION
projectSchema.methods.completeRound1 = async function() {
  const Bid = mongoose.model('Bid');
  
  try {
    console.log('🔄 Starting Round 1 completion for project:', this._id);
    
    // Get all eligible bids for Round 1 - FIXED QUERY
    const eligibleBids = await Bid.find({
      project: this._id,
      $or: [
        { round: 1 },
        { round: { $exists: false } }
      ],
      status: { $in: ['submitted', 'selected'] },
      'agreementResponses.submitted': true
    })
    .sort({ amount: 1 }) // Sort by lowest amount first
    .populate('seller');
    
    console.log(`📊 Found ${eligibleBids.length} eligible bids for Round 1`);
    
    // Log bid details for debugging
    eligibleBids.forEach((bid, index) => {
      console.log(`Bid ${index + 1}:`, {
        id: bid._id,
        amount: bid.amount,
        status: bid.status,
        selectionStatus: bid.selectionStatus,
        round: bid.round,
        seller: bid.seller?.name
      });
    });

    if (eligibleBids.length === 0) {
      console.log('❌ No eligible bids found for Round 1');
      this.biddingRounds.round1.status = 'completed';
      this.biddingRounds.round1Completed = true;
      this.biddingRounds.currentRound = 1.5;
      this.status = 'failed';
      await this.save();
      console.log('✅ Project marked as failed due to no bids');
      return this;
    }
    
    // Take top 10 for selection (top 3 + waiting queue 7)
    const topBids = eligibleBids.slice(0, Math.min(10, eligibleBids.length));
    console.log(`🎯 Selected ${topBids.length} bids for Round 1 processing`);
    
    // Update project status
    this.biddingRounds.round1.status = 'completed';
    this.biddingRounds.round1Completed = true;
    this.biddingRounds.currentRound = 1.5; // Selection phase
    this.biddingRounds.selectionDeadline = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours
    
    // Clear existing selections
    this.round1Selections.top3 = [];
    this.round1Selections.waitingQueue = [];
    
    // Select top 3 for immediate customer review
    const top3Count = Math.min(3, topBids.length);
    const top3Bids = topBids.slice(0, top3Count);
    
    console.log(`🥇 Selecting ${top3Count} bids for top 3`);
    
    for (let i = 0; i < top3Bids.length; i++) {
      const bid = top3Bids[i];
      this.round1Selections.top3.push({
        bid: bid._id,
        seller: bid.seller._id,
        selectedAt: new Date(),
        selectedBy: this.customer,
        status: 'selected',
        defectCount: 0
      });
      
      // Update bid status to selected-round1
      bid.selectionStatus = 'selected-round1';
      bid.status = 'selected';
      bid.isActiveInRound = true;
      bid.round = 1;
      await bid.save();
      
      console.log(`✅ Added bid ${bid._id} to top 3`);
    }
    
    // Add next 7 bids to waiting queue (positions 4-10)
    const waitingBids = topBids.slice(top3Count);
    console.log(`⏳ Adding ${waitingBids.length} bids to waiting queue`);
    
    for (let i = 0; i < waitingBids.length; i++) {
      const bid = waitingBids[i];
      this.round1Selections.waitingQueue.push({
        bid: bid._id,
        seller: bid.seller._id,
        position: i + top3Count + 1,
        originalAmount: bid.amount,
        addedToQueueAt: new Date()
      });
      
      // Update bid status to waiting-queue
      bid.selectionStatus = 'waiting-queue';
      bid.isInWaitingQueue = true;
      bid.queuePosition = i + top3Count + 1;
      bid.round = 1;
      await bid.save();
      
      console.log(`✅ Added bid ${bid._id} to waiting queue at position ${i + top3Count + 1}`);
    }
    
    // Mark remaining bids as lost (outside top 10)
    const remainingBids = eligibleBids.slice(topBids.length);
    if (remainingBids.length > 0) {
      console.log(`❌ Marking ${remainingBids.length} bids as lost`);
      
      for (const bid of remainingBids) {
        bid.selectionStatus = 'lost';
        bid.status = 'lost';
        bid.isActiveInRound = false;
        await bid.save();
      }
    }
    
    this.round1Selections.autoSelectionCompleted = true;
    await this.save();
    
    console.log('✅ Round 1 completion successful');
    return this;
    
  } catch (error) {
    console.error('❌ Error in completeRound1:', error);
    this.status = 'failed';
    await this.save();
    throw error;
  }
};
// Method to mark a bid as defected - FIXED VERSION
projectSchema.methods.defectBid = async function(bidId, remarks, customerId) {
  const Bid = mongoose.model('Bid');
  
  // Find the bid in top3
  const selection = this.round1Selections.top3.find(s => 
    s.bid.toString() === bidId.toString()
  );
  
  if (!selection) {
    throw new Error('Bid not found in top 3 selections');
  }
  
  // Update selection status
  selection.status = 'defected';
  selection.defectRemarks = remarks;
  selection.defectCount += 1;
  selection.lastDefectedAt = new Date();
  selection.resubmissionDeadline = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours
  
  // Add to defect history
  selection.defectHistory.push({
    remarks: remarks,
    defectedAt: new Date()
  });
  
  // Update the actual bid
  const bid = await Bid.findById(bidId);
  if (bid) {
    bid.agreementResponses.status = 'defected';
    bid.agreementResponses.adminRemarks = remarks;
    bid.agreementResponses.defectCount += 1;
    bid.selectionStatus = 'defected';
    bid.status = 'defected';
    bid.isActiveInRound = false;
    bid.resubmissionDeadline = new Date(Date.now() + 24 * 60 * 60 * 1000);
    await bid.save();
  }
  
  await this.save();
  
  // Check if we need to promote from waiting queue
  await this.promoteFromWaitingQueue();
  
  return this;
};

// Method to promote from waiting queue when a spot opens
projectSchema.methods.promoteFromWaitingQueue = async function() {
  const Bid = mongoose.model('Bid');
  
  // Check if we have empty spots in top3 and bids in waiting queue
  const activeTop3Count = this.round1Selections.top3.filter(s => 
    s.status === 'selected' || s.status === 'resubmitted'
  ).length;
  
  if (activeTop3Count < 3 && this.round1Selections.waitingQueue.length > 0) {
    const nextInQueue = this.round1Selections.waitingQueue[0];
    
    // Add to top3
    this.round1Selections.top3.push({
      bid: nextInQueue.bid,
      seller: nextInQueue.seller,
      selectedAt: new Date(),
      selectedBy: this.customer,
      status: 'selected',
      defectCount: 0
    });
    
    // Remove from waiting queue
    this.round1Selections.waitingQueue.shift();
    
    // Update positions in waiting queue
    this.round1Selections.waitingQueue.forEach((item, index) => {
      item.position = index + 4;
    });
    
    // Update the promoted bid
    const promotedBid = await Bid.findById(nextInQueue.bid);
    if (promotedBid) {
      promotedBid.selectionStatus = 'selected-round1';
      promotedBid.status = 'selected';
      promotedBid.isInWaitingQueue = false;
      promotedBid.queuePosition = null;
      promotedBid.isActiveInRound = true;
      await promotedBid.save();
    }
    
    console.log(`⬆️ Promoted bid ${nextInQueue.bid} from waiting queue to top 3`);
  }
  
  return this.save();
};

// Method to handle resubmission of defected bid
projectSchema.methods.handleResubmission = async function(bidId, updatedData) {
  const Bid = mongoose.model('Bid');
  
  // Find the defected selection
  const selection = this.round1Selections.top3.find(s => 
    s.bid.toString() === bidId.toString() && s.status === 'defected'
  );
  
  if (!selection) {
    throw new Error('Defected bid not found in top 3');
  }
  
  // Update selection status
  selection.status = 'resubmitted';
  selection.resubmissionDeadline = null;
  
  // Update defect history
  const defectEntry = selection.defectHistory[selection.defectHistory.length - 1];
  if (defectEntry) {
    defectEntry.resubmittedAt = new Date();
  }
  
  // Update the bid
  const bid = await Bid.findById(bidId);
  if (bid) {
    // Update bid data
    if (updatedData.amount) bid.amount = updatedData.amount;
    if (updatedData.proposal) bid.proposal = updatedData.proposal;
    if (updatedData.agreementResponses) {
      bid.agreementResponses.responses = updatedData.agreementResponses;
      bid.agreementResponses.status = 'resubmitted';
      bid.agreementResponses.submittedAt = new Date();
    }
    
    bid.selectionStatus = 'selected-round1';
    bid.status = 'selected';
    bid.isActiveInRound = true;
    bid.resubmissionDeadline = null;
    
    await bid.save();
  }
  
  return this.save();
};

// Method to check and handle expired resubmissions
projectSchema.methods.handleExpiredResubmissions = async function() {
  const Bid = mongoose.model('Bid');
  const now = new Date();
  let updated = false;
  
  // Check defected bids with expired resubmission deadline
  for (const selection of this.round1Selections.top3) {
    if (selection.status === 'defected' && selection.resubmissionDeadline && selection.resubmissionDeadline < now) {
      // Mark as replaced
      selection.status = 'replaced';
      
      // Update bid to lost
      const bid = await Bid.findById(selection.bid);
      if (bid) {
        bid.selectionStatus = 'lost';
        bid.status = 'lost';
        bid.isActiveInRound = false;
        await bid.save();
      }
      
      updated = true;
      console.log(`⏰ Bid ${selection.bid} expired and marked as lost`);
    }
  }
  
  // If we marked any as replaced, promote from waiting queue
  if (updated) {
    await this.promoteFromWaitingQueue();
  }
  
  return this;
};

// Method to select top 3 for Round 2
// projectSchema.methods.selectTop3ForRound2 = async function(selectedBidIds) {
//   const Bid = mongoose.model('Bid');
  
//   if (!selectedBidIds || !Array.isArray(selectedBidIds) || selectedBidIds.length !== 3) {
//     throw new Error('Exactly 3 bids must be selected for Round 2');
//   }
  
//   // Validate that all selected bids are in top3
//   const validSelections = this.round1Selections.top3.filter(s =>
//     selectedBidIds.includes(s.bid.toString()) && 
//     (s.status === 'selected' || s.status === 'resubmitted')
//   );
  
//   if (validSelections.length !== 3) {
//     throw new Error('Invalid bid selection for Round 2');
//   }
  
//   console.log(`🎯 Starting Round 2 with ${selectedBidIds.length} selected bids`);
  
//   // Start Round 2
//   this.biddingRounds.round2.startDate = new Date();
//   this.biddingRounds.round2.endDate = new Date(Date.now() +  40 * 60 * 1000); // 24 hours
//   this.biddingRounds.round2.status = 'active';
//   this.biddingRounds.round2.selectedBids = selectedBidIds;
//   this.biddingRounds.currentRound = 2;
  
//   // Update selected bids for Round 2
//   for (const bidId of selectedBidIds) {
//     const bid = await Bid.findById(bidId);
//     if (bid) {
//       bid.round = 2;
//       bid.selectionStatus = 'selected-round2';
//       bid.status = 'selected';
//       bid.isActiveInRound = true;
      
//       // Initialize round2Bid with current bid data
//       if (!bid.round2Bid) {
//         bid.round2Bid = {
//           amount: bid.amount,
//           proposal: bid.proposal,
//           submittedAt: new Date(),
//           revisionCount: 0
//         };
//       }
      
//       await bid.save();
//       console.log(`✅ Updated bid ${bidId} for Round 2`);
//     }
//   }
  
//   // Mark all waiting queue bids as lost
//   console.log(`❌ Marking ${this.round1Selections.waitingQueue.length} waiting queue bids as lost`);
//   for (const queueItem of this.round1Selections.waitingQueue) {
//     const bid = await Bid.findById(queueItem.bid);
//     if (bid) {
//       bid.selectionStatus = 'lost';
//       bid.status = 'lost';
//       bid.isActiveInRound = false;
//       bid.isInWaitingQueue = false;
//       bid.queuePosition = null;
//       await bid.save();
//     }
//   }
  
//   // Clear waiting queue
//   this.round1Selections.waitingQueue = [];
  
//   return this.save();
  

//       // const statusAutomation = require('../services/statusAutomation');

  
//   // START THE 2-MINUTE TIMER - ADD THIS
//   // await statusAutomation.startRound2WithAutoComplete(this._id, 2 * 60 * 1000);
//   // return this;
// };
projectSchema.methods.selectTop3ForRound2 = async function (selectedBidIds) {
  const Bid = mongoose.model('Bid');
  
  if (!selectedBidIds || !Array.isArray(selectedBidIds) || selectedBidIds.length !== 3) {
    throw new Error('Exactly 3 bids must be selected for Round 2');
  }

  // Validate that all selected bids are in top3
  const validSelections = this.round1Selections.top3.filter(
    s =>
      selectedBidIds.includes(s.bid.toString()) &&
      (s.status === 'selected' || s.status === 'resubmitted')
  );

  if (validSelections.length !== 3) {
    throw new Error('Invalid bid selection for Round 2');
  }

  console.log(`🎯 Starting Round 2 with ${selectedBidIds.length} selected bids`);

  try {
    // Start Round 2 (2 minutes for testing)
    this.biddingRounds.round2.startDate = new Date();
    this.biddingRounds.round2.endDate = new Date(Date.now() + 2 * 60 * 1000); // 2 minutes
    this.biddingRounds.round2.status = 'active';
    this.biddingRounds.round2.selectedBids = selectedBidIds;
    this.biddingRounds.currentRound = 2;

    // Update selected bids for Round 2 - ENHANCED STATUS MANAGEMENT
    for (const bidId of selectedBidIds) {
      const bid = await Bid.findById(bidId);
      if (bid) {
        bid.round = 2;
        bid.selectionStatus = 'selected-round2';
        bid.status = 'selected'; // ← Ensure this is set
        bid.isActiveInRound = true;

        // Initialize round2Bid with current bid data
        if (!bid.round2Bid) {
          bid.round2Bid = {
            amount: bid.amount,
            proposal: bid.proposal,
            submittedAt: new Date(),
            revisionCount: 0,
          };
        }

        await bid.save();
        console.log(`✅ Updated bid ${bidId} for Round 2 - status: ${bid.status}, selectionStatus: ${bid.selectionStatus}`);
      } else {
        console.log(`❌ Bid ${bidId} not found!`);
      }
    }

    // Mark all waiting queue bids as lost
    console.log(`❌ Marking ${this.round1Selections.waitingQueue.length} waiting queue bids as lost`);
    for (const queueItem of this.round1Selections.waitingQueue) {
      const bid = await Bid.findById(queueItem.bid);
      if (bid) {
        bid.selectionStatus = 'lost';
        bid.status = 'lost';
        bid.isActiveInRound = false;
        bid.isInWaitingQueue = false;
        bid.queuePosition = null;
        await bid.save();
      }
    }

    // Clear waiting queue
    this.round1Selections.waitingQueue = [];

    // Save project updates
    await this.save();
    console.log(`🚀 Round 2 started for project ${this._id} (ends in 2 minutes)`);

    // 🕒 Schedule automatic Round 2 completion - FIXED SCOPE
    const projectId = this._id;
    setTimeout(async () => {
      try {
        console.log(`🕒 Auto-completing Round 2 for project ${projectId}`);
        
        // Re-fetch the project to get latest data
        const currentProject = await mongoose.model('Project').findById(projectId);
        if (currentProject && currentProject.biddingRounds.currentRound === 2) {
          await currentProject.completeRound2();
          console.log(`✅ Auto-completion successful for project ${projectId}`);
        }
      } catch (err) {
        console.error(`❌ Error auto-completing Round 2 for project ${projectId}:`, err.message);
      }
    }, 2 * 60 * 1000); // Run after 2 minutes

    return this;
  } catch (error) {
    console.error('Error in selectTop3ForRound2:', error);
    throw error;
  }
};




// Method to complete Round 2 and select winner (lowest bidder)
// projectSchema.methods.completeRound2 = async function() {
//   const Bid = mongoose.model('Bid');
  
//   // Get all Round 2 bids with their final amounts
//   const round2Bids = await Bid.find({
//     _id: { $in: this.biddingRounds.round2.selectedBids },
//     round: 2,
//     selectionStatus: 'selected-round2'
//   }).populate('seller');
  
//   if (round2Bids.length === 0) {
//     throw new Error('No active bids found in Round 2');
//   }
  
//   console.log(`🏆 Evaluating ${round2Bids.length} bids for Round 2 winner`);
  
//   // Find the lowest bidder (use round2Bid amount if available, otherwise use original amount)
//   const bidsWithAmounts = round2Bids.map(bid => ({
//     bid,
//     amount: bid.round2Bid?.amount || bid.amount
//   }));
  
//   bidsWithAmounts.sort((a, b) => a.amount - b.amount);
//   const winningBid = bidsWithAmounts[0].bid;
//   const winningAmount = bidsWithAmounts[0].amount;
  
//   console.log(`🎉 Winner selected: ${winningBid._id} with amount $${winningAmount}`);
  
//   // Update project status
//   this.biddingRounds.round2.status = 'completed';
//   this.biddingRounds.round2Completed = true;
//   this.biddingRounds.round2.winnerSelected = true;
//   this.biddingRounds.currentRound = 3;
//   this.selectedBid = winningBid._id;
//   this.status = 'awarded';
//   this.biddingCompleted = true;
//   this.winnerSelectedAt = new Date();
  
//   // Set final winner
//   this.finalWinner = {
//     bid: winningBid._id,
//     seller: winningBid.seller._id,
//     selectedAt: new Date(),
//     winningAmount: winningAmount,
//     round: 2
//   };
  
//   // Update winning bid
//   winningBid.selectionStatus = 'won';
//   winningBid.status = 'won';
//   winningBid.isActiveInRound = false;
//   await winningBid.save();
  
//   // Mark other Round 2 bids as lost
//   const otherBids = round2Bids.filter(bid => bid._id.toString() !== winningBid._id.toString());
//   console.log(`❌ Marking ${otherBids.length} other bids as lost`);
  
//   for (const bid of otherBids) {
//     bid.selectionStatus = 'lost';
//     bid.status = 'lost';
//     bid.isActiveInRound = false;
//     await bid.save();
//   }
  
//   return this.save();
// };


// projectSchema.methods.completeRound2 = async function() {
//   const Bid = mongoose.model('Bid');
  
//   try {
//     console.log(`🏆 Starting Round 2 completion for project: ${this._id}`);
    
//     // Get all Round 2 bids with their final amounts
//     const round2Bids = await Bid.find({
//       _id: { $in: this.biddingRounds.round2.selectedBids },
//       round: 2,
//       selectionStatus: 'selected-round2'
//     }).populate('seller');

//     console.log(`📊 Found ${round2Bids.length} active Round 2 bids`);

//     if (round2Bids.length === 0) {
//       console.log(`❌ No active bids in Round 2 - marking project as failed`);
//       this.status = 'failed';
//       this.biddingRounds.round2.status = 'completed';
//       this.biddingRounds.round2Completed = true;
//       await this.save();
//       throw new Error('No active bids found in Round 2');
//     }
    
//     // Find the lowest bidder
//     const bidsWithAmounts = round2Bids.map(bid => ({
//       bid,
//       amount: bid.round2Bid?.amount || bid.amount
//     }));
    
//     bidsWithAmounts.sort((a, b) => a.amount - b.amount);
//     const winningBid = bidsWithAmounts[0].bid;
//     const winningAmount = bidsWithAmounts[0].amount;
    
//     console.log(`🎉 Winner selected: ${winningBid._id} with amount $${winningAmount}`);
    
//     // Update project status - CRITICAL: Set to 'awarded' not 'failed'
//     this.biddingRounds.round2.status = 'completed';
//     this.biddingRounds.round2Completed = true;
//     this.biddingRounds.round2.winnerSelected = true;
//     this.biddingRounds.currentRound = 3;
//     this.selectedBid = winningBid._id;
//     this.status = 'awarded'; // ← This is the key line
//     this.biddingCompleted = true;
//     this.winnerSelectedAt = new Date();
    
//     // Set final winner
//     this.finalWinner = {
//       bid: winningBid._id,
//       seller: winningBid.seller._id,
//       selectedAt: new Date(),
//       winningAmount: winningAmount,
//       round: 2
//     };
    
//     // Update winning bid
//     winningBid.selectionStatus = 'won';
//     winningBid.status = 'won';
//     winningBid.isActiveInRound = false;
//     await winningBid.save();
    
//     // Mark other Round 2 bids as lost
//     const otherBids = round2Bids.filter(bid => bid._id.toString() !== winningBid._id.toString());
//     console.log(`❌ Marking ${otherBids.length} other bids as lost`);
    
//     for (const bid of otherBids) {
//       bid.selectionStatus = 'lost';
//       bid.status = 'lost';
//       bid.isActiveInRound = false;
//       await bid.save();
//     }
    
//     await this.save();
//     console.log(`✅ Round 2 successfully completed for project ${this._id}`);
    
//     return this;
    
//   } catch (error) {
//     console.error(`❌ Error in completeRound2 for project ${this._id}:`, error);
    
//     // Ensure project status is set properly even on error
//     this.status = 'failed';
//     this.biddingRounds.round2.status = 'completed';
//     await this.save();
    
//     throw error;
//   }
// };

// projectSchema.methods.completeRound2 = async function() {
//   const Bid = mongoose.model('Bid');
  
//   try {
//     console.log(`🏆 Starting Round 2 completion for project: ${this._id}`);
    
//     // FIXED QUERY: Look for bids in selectedBids array with proper status
//     const round2Bids = await Bid.find({
//       _id: { $in: this.biddingRounds.round2.selectedBids },
//       $or: [
//         { selectionStatus: 'selected-round2' },
//         { status: 'selected' },
//         { round: 2 }
//       ]
//     }).populate('seller');

//     console.log(`📊 Found ${round2Bids.length} active Round 2 bids from selectedBids:`, 
//       this.biddingRounds.round2.selectedBids);

//     // DEBUG: Log each bid found
//     round2Bids.forEach((bid, index) => {
//       console.log(`Bid ${index + 1}:`, {
//         id: bid._id,
//         amount: bid.round2Bid?.amount || bid.amount,
//         selectionStatus: bid.selectionStatus,
//         status: bid.status,
//         round: bid.round,
//         seller: bid.seller?.name
//       });
//     });

//     if (round2Bids.length === 0) {
//       console.log(`❌ No active bids in Round 2 - checking why...`);
      
//       // Debug: Check what bids actually exist
//       const allBidsInProject = await Bid.find({
//         project: this._id
//       }).select('_id amount selectionStatus status round');
      
//       console.log('All bids in project:', allBidsInProject);
//       console.log('Selected bids for Round 2:', this.biddingRounds.round2.selectedBids);
      
//       this.status = 'failed';
//       this.biddingRounds.round2.status = 'completed';
//       this.biddingRounds.round2Completed = true;
//       await this.save();
//       throw new Error('No active bids found in Round 2');
//     }
    
//     // Find the lowest bidder (WINNER SELECTION LOGIC)
//     const bidsWithAmounts = round2Bids.map(bid => ({
//       bid,
//       amount: bid.round2Bid?.amount || bid.amount,
//       finalAmount: bid.round2Bid?.amount // Prefer round2Bid amount if exists
//     }));
    
//     // Sort by lowest amount
//     bidsWithAmounts.sort((a, b) => a.amount - b.amount);
//     const winningBid = bidsWithAmounts[0].bid;
//     const winningAmount = bidsWithAmounts[0].finalAmount || bidsWithAmounts[0].amount;
    
//     console.log(`🎉 Winner selected: ${winningBid._id} with amount $${winningAmount}`);
//     console.log(`📝 All bid amounts:`, bidsWithAmounts.map(b => ({id: b.bid._id, amount: b.amount})));
    
//     // Update project status - CRITICAL FIX
//     this.biddingRounds.round2.status = 'completed';
//     this.biddingRounds.round2Completed = true;
//     this.biddingRounds.round2.winnerSelected = true;
//     this.biddingRounds.currentRound = 3;
//     this.selectedBid = winningBid._id;
//     this.status = 'awarded'; // ← This must be 'awarded' not 'failed'
//     this.biddingCompleted = true;
//     this.winnerSelectedAt = new Date();
    
//     // Set final winner
//     this.finalWinner = {
//       bid: winningBid._id,
//       seller: winningBid.seller._id,
//       selectedAt: new Date(),
//       winningAmount: winningAmount,
//       round: 2
//     };
    
//     // Update winning bid
//     winningBid.selectionStatus = 'won';
//     winningBid.status = 'won';
//     winningBid.isActiveInRound = false;
//     await winningBid.save();
    
//     // Mark other Round 2 bids as lost
//     const otherBids = round2Bids.filter(bid => bid._id.toString() !== winningBid._id.toString());
//     console.log(`❌ Marking ${otherBids.length} other bids as lost`);
    
//     for (const bid of otherBids) {
//       bid.selectionStatus = 'lost';
//       bid.status = 'lost';
//       bid.isActiveInRound = false;
//       await bid.save();
//     }
    
//     await this.save();
//     console.log(`✅ Round 2 successfully completed for project ${this._id}`);
    
//     return this;
    
//   } catch (error) {
//     console.error(`❌ Error in completeRound2 for project ${this._id}:`, error);
    
//     // Ensure project status is set properly even on error
//     this.status = 'failed';
//     this.biddingRounds.round2.status = 'completed';
//     this.biddingRounds.round2Completed = true;
//     await this.save();
    
//     throw error;
//   }
// };
projectSchema.methods.completeRound2 = async function() {
  const Bid = mongoose.model('Bid');
  
  try {
    console.log(`🏆 Starting Round 2 completion for project: ${this._id}`);
    
    // FIXED: Use the project's selectedBids from round2
    const round2Bids = await Bid.find({
      _id: { $in: this.biddingRounds.round2.selectedBids },
      $or: [
        { selectionStatus: 'selected-round2' },
        { status: 'selected' },
        { round: 2 }
      ]
    }).populate('seller');

    console.log(`📊 Found ${round2Bids.length} active Round 2 bids from selectedBids:`, 
      this.biddingRounds.round2.selectedBids);

    if (round2Bids.length === 0) {
      console.log(`❌ No active bids in Round 2 - marking project as failed`);
      this.status = 'failed';
      this.biddingRounds.round2.status = 'completed';
      this.biddingRounds.round2Completed = true;
      await this.save();
      throw new Error('No active bids found in Round 2');
    }
    
    // Find the lowest bidder (WINNER SELECTION LOGIC)
    const bidsWithAmounts = round2Bids.map(bid => ({
      bid,
      amount: bid.round2Bid?.amount || bid.amount,
      finalAmount: bid.round2Bid?.amount // Prefer round2Bid amount if exists
    }));
    
    // Sort by lowest amount
    bidsWithAmounts.sort((a, b) => a.amount - b.amount);
    const winningBid = bidsWithAmounts[0].bid;
    const winningAmount = bidsWithAmounts[0].finalAmount || bidsWithAmounts[0].amount;
    
    console.log(`🎉 Winner selected: ${winningBid._id} with amount $${winningAmount}`);
    
    // CRITICAL FIX: Ensure project status is set to 'awarded'
    this.biddingRounds.round2.status = 'completed';
    this.biddingRounds.round2Completed = true;
    this.biddingRounds.round2.winnerSelected = true;
    this.biddingRounds.currentRound = 3;
    this.selectedBid = winningBid._id;
    this.status = 'awarded'; // ← THIS MUST BE 'awarded'
    this.biddingCompleted = true;
    this.winnerSelectedAt = new Date();
    
    // Set final winner
    this.finalWinner = {
      bid: winningBid._id,
      seller: winningBid.seller._id,
      selectedAt: new Date(),
      winningAmount: winningAmount,
      round: 2
    };
    
    // Update winning bid
    winningBid.selectionStatus = 'won';
    winningBid.status = 'won';
    winningBid.isActiveInRound = false;
    await winningBid.save();
    
    // Mark other Round 2 bids as lost
    const otherBids = round2Bids.filter(bid => bid._id.toString() !== winningBid._id.toString());
    console.log(`❌ Marking ${otherBids.length} other bids as lost`);
    
    for (const bid of otherBids) {
      bid.selectionStatus = 'lost';
      bid.status = 'lost';
      bid.isActiveInRound = false;
      await bid.save();
    }
    
    await this.save();
    console.log(`✅ Round 2 successfully completed for project ${this._id}, Status: ${this.status}`);
    
    return this;
    
  } catch (error) {
    console.error(`❌ Error in completeRound2 for project ${this._id}:`, error);
    
    // Ensure project status is set properly even on error
    this.status = 'failed';
    this.biddingRounds.round2.status = 'completed';
    this.biddingRounds.round2Completed = true;
    await this.save();
    
    throw error;
  }
};

// Pre-save middleware
projectSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  
  // Calculate duration in days
  if (this.timeline.startDate && this.timeline.endDate) {
    const durationMs = this.timeline.endDate - this.timeline.startDate;
    this.timeline.duration = Math.ceil(durationMs / (1000 * 60 * 60* 24));
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
// Method to get current top 3 with populated data
projectSchema.methods.getCurrentTop3 = function() {
  return this.populate({
    path: 'round1Selections.top3.bid',
    populate: {
      path: 'seller',
      select: 'name companyName profileImage rating yearsOfExperience specialization companyDocuments'
    }
  });
};

// Method to get waiting queue with populated data
projectSchema.methods.getWaitingQueue = function() {
  return this.populate({
    path: 'round1Selections.waitingQueue.bid',
    populate: {
      path: 'seller',
      select: 'name companyName profileImage rating yearsOfExperience specialization'
    }
  });
};

// Method to get Round 2 bids with populated data
projectSchema.methods.getRound2Bids = function() {
  return this.populate({
    path: 'biddingRounds.round2.selectedBids',
    populate: {
      path: 'seller',
      select: 'name companyName profileImage rating yearsOfExperience specialization'
    }
  });
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
};// Method to approve project by admin
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
// Indexes
projectSchema.index({ 'biddingRounds.currentRound': 1, 'biddingRounds.round1.endDate': 1 });
projectSchema.index({ 'biddingRounds.currentRound': 1, 'biddingRounds.round2.endDate': 1 });
projectSchema.index({ 'round1Selections.top3.status': 1 });
projectSchema.index({ 'round1Selections.top3.resubmissionDeadline': 1 });
projectSchema.index({ customer: 1, status: 1 });
projectSchema.index({ category: 1, status: 1 });
projectSchema.index({ 'bidSettings.bidEndDate': 1 });
projectSchema.index({ createdAt: -1 });
projectSchema.index({ isPublic: 1 });
projectSchema.index({ adminStatus: 1 });
projectSchema.index({ 'biddingRounds.currentRound': 1 });
projectSchema.index({ status: 1, 'bidSettings.isActive': 1 });

module.exports = mongoose.model('Project', projectSchema);

