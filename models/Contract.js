// const mongoose = require('mongoose');

// const contractSchema = new mongoose.Schema({
//   // Enhanced Rejection System
//   rejectionHistory: [{
//     rejectedAt: Date,
//     rejectedBy: {
//       type: mongoose.Schema.Types.ObjectId,
//       ref: 'User'
//     },
//     reason: String,
//     partyRequired: {
//       type: String,
//       enum: ['customer', 'seller', 'both']
//     },
//     deadline: Date,
//     resolved: {
//       type: Boolean,
//       default: false
//     }
//   }],
  
//   currentRejection: {
//     rejectedAt: Date,
//     reason: String,
//     partyRequired: {
//       type: String,
//       enum: ['customer', 'seller', 'both']
//     },
//     deadline: Date
//   },

//   // EXISTING FIELDS
//   bid: {
//     type: mongoose.Schema.Types.ObjectId,
//     ref: 'Bid',
//     required: [true, 'Bid reference is required']
//   },
//   project: {
//     type: mongoose.Schema.Types.ObjectId,
//     ref: 'Project',
//     required: [true, 'Project reference is required']
//   },
//   customer: {
//     type: mongoose.Schema.Types.ObjectId,
//     ref: 'User',
//     required: [true, 'Customer reference is required']
//   },
//   seller: {
//     type: mongoose.Schema.Types.ObjectId,
//     ref: 'User',
//     required: [true, 'Seller reference is required']
//   },
//   customerTemplate: {
//     public_id: String,
//     url: String,
//     filename: String,
//     bytes: Number,
//     generatedAt: Date
//   },
//   sellerTemplate: {
//     public_id: String,
//     url: String,
//     filename: String,
//     bytes: Number,
//     generatedAt: Date
//   },
//   customerSignedContract: {
//     public_id: String,
//     url: String,
//     filename: String,
//     originalName: String,
//     bytes: Number,
//     uploadedAt: Date,
//     uploadedBy: { type: String, enum: ['customer'], default: 'customer' },
//     signatureDate: Date,
//     ipAddress: String
//   },
//   sellerSignedContract: {
//     public_id: String,
//     url: String,
//     filename: String,
//     originalName: String,
//     bytes: Number,
//     uploadedAt: Date,
//     uploadedBy: { type: String, enum: ['seller'], default: 'seller' },
//     signatureDate: Date,
//     ipAddress: String
//   },
//   finalCertificate: {
//     public_id: String,
//     url: String,
//     filename: String,
//     bytes: Number,
//     generatedAt: Date
//   },
//   customerCertificate: {
//     public_id: String,
//     url: String,
//     filename: String,
//     bytes: Number,
//     generatedAt: Date
//   },
//   sellerCertificate: {
//     public_id: String,
//     url: String,
//     filename: String,
//     bytes: Number,
//     generatedAt: Date
//   },
//   adminCertificate: {
//     public_id: String,
//     url: String,
//     filename: String,
//     bytes: Number,
//     generatedAt: Date
//   },
//   contractValue: { type: Number, required: true },
//   terms: {
//     type: Map,
//     of: mongoose.Schema.Types.Mixed,
//     default: new Map()
//   },
//   currentStep: {
//     type: Number,
//     enum: [1, 2, 3, 4],
//     default: 1
//   },
//   status: {
//     type: String,
//     enum: ['pending-customer', 'pending-seller', 'pending-admin', 'completed', 'rejected', 'correcting'],
//     default: 'pending-customer'
//   },
//   adminApproved: { type: Boolean, default: false },
//   adminApprovedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
//   adminApprovedAt: Date,
//   adminNotes: String,
//   adminRejectionReason: String,
//   createdAt: { type: Date, default: Date.now },
//   updatedAt: { type: Date, default: Date.now }
// });

// // Pre-save middleware
// contractSchema.pre('save', function(next) {
//   this.updatedAt = Date.now();
  
//   switch(this.status) {
//     case 'pending-customer':
//       this.currentStep = 1;
//       break;
//     case 'pending-seller':
//       this.currentStep = 2;
//       break;
//     case 'pending-admin':
//     case 'correcting':
//       this.currentStep = 3;
//       break;
//     case 'completed':
//       this.currentStep = 4;
//       break;
//     default:
//       this.currentStep = 1;
//   }
  
//   next();
// });



// contractSchema.methods.resolveRejection = function() {
//   if (this.rejectionHistory.length > 0) {
//     this.rejectionHistory[this.rejectionHistory.length - 1].resolved = true;
//   }
//   this.currentRejection = null;
//   this.status = 'pending-admin';
//   return this.save();
// };

// contractSchema.methods.isRejectionExpired = function() {
//   if (!this.currentRejection || !this.currentRejection.deadline) {
//     return false;
//   }
//   return new Date() > this.currentRejection.deadline;
// };

// contractSchema.methods.getRemainingCorrectionTime = function() {
//   if (!this.currentRejection || !this.currentRejection.deadline) {
//     return null;
//   }
  
//   const now = new Date();
//   const deadline = this.currentRejection.deadline;
//   const diffMs = deadline - now;
  
//   if (diffMs <= 0) return 'EXPIRED';
  
//   const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
//   const diffMinutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
  
//   return `${diffHours}h ${diffMinutes}m`;
// };

// // EXISTING METHODS (enhanced)
// contractSchema.methods.canCustomerUpload = function() {
//   return (this.status === 'pending-customer' || 
//          (this.status === 'correcting' && 
//           (this.currentRejection.partyRequired === 'customer' || 
//            this.currentRejection.partyRequired === 'both'))) && 
//          !this.customerSignedContract?.url;
// };

// contractSchema.methods.canSellerUpload = function() {
//   return (this.status === 'pending-seller' || 
//          (this.status === 'correcting' && 
//           (this.currentRejection.partyRequired === 'seller' || 
//            this.currentRejection.partyRequired === 'both'))) && 
//          this.customerSignedContract && this.customerSignedContract.url && 
//          !this.sellerSignedContract?.url;
// };

// contractSchema.methods.isReadyForAdmin = function() {
//   return this.customerSignedContract && this.customerSignedContract.url && 
//          this.sellerSignedContract && this.sellerSignedContract.url;
// };

// contractSchema.methods.completeCustomerStep = async function() {
//   if (this.customerSignedContract?.url) {
//     if (this.status === 'correcting' && this.currentRejection) {
//       if (this.currentRejection.partyRequired === 'customer') {
//         await this.resolveRejection();
//       } else if (this.currentRejection.partyRequired === 'both' && this.sellerSignedContract?.url) {
//         await this.resolveRejection();
//       } else {
//         this.status = 'pending-seller';
//         this.currentStep = 2;
//       }
//     } else {
//       this.status = 'pending-seller';
//       this.currentStep = 2;
//     }
    
//     this.updatedAt = new Date();
//     await this.save();
//   }
//   return this;
// };

// contractSchema.methods.completeSellerStep = async function() {
//   if (this.sellerSignedContract?.url) {
//     if (this.status === 'correcting' && this.currentRejection) {
//       if (this.currentRejection.partyRequired === 'seller') {
//         await this.resolveRejection();
//       } else if (this.currentRejection.partyRequired === 'both' && this.customerSignedContract?.url) {
//         await this.resolveRejection();
//       } else {
//         this.status = 'pending-admin';
//         this.currentStep = 3;
//       }
//     } else {
//       this.status = 'pending-admin';
//       this.currentStep = 3;
//     }
    
//     this.updatedAt = new Date();
//     await this.save();
//   }
//   return this;
// };

// // Enhanced rejectContract method
// contractSchema.methods.rejectContract = function(adminId, reason, partyRequired, deadlineHours = 48) {
//     const rejectionRecord = {
//         rejectedAt: new Date(),
//         rejectedBy: adminId,
//         reason: reason,
//         partyRequired: partyRequired,
//         deadline: new Date(Date.now() + deadlineHours * 60 * 60 * 1000),
//         resolved: false
//     };

//     this.rejectionHistory.push(rejectionRecord);
//     this.currentRejection = rejectionRecord;
//     this.status = 'correcting';
    
//     // Reset only the required party's upload
//     if (partyRequired === 'customer' || partyRequired === 'both') {
//         this.customerSignedContract = null;
//     }
//     if (partyRequired === 'seller' || partyRequired === 'both') {
//         this.sellerSignedContract = null;
//     }
    
//     return this.save();
// };

// // Enhanced approveByAdmin method
// contractSchema.methods.approveByAdmin = async function(adminId, notes = '') {
//     const PDFGenerator = require('../services/pdfGenerator');
    
//     // Generate all three certificates
//     const customerCertificate = await PDFGenerator.generateCertificate(
//         this.bid,
//         this.project,
//         this.customer,
//         this.seller,
//         'customer'
//     );
    
//     const sellerCertificate = await PDFGenerator.generateCertificate(
//         this.bid,
//         this.project,
//         this.customer,
//         this.seller,
//         'seller'
//     );
    
//     const finalCertificate = await PDFGenerator.generateCertificate(
//         this.bid,
//         this.project,
//         this.customer,
//         this.seller,
//         'final'
//     );

//     // Store all certificates
//     this.customerCertificate = {
//         public_id: customerCertificate.public_id,
//         url: customerCertificate.secure_url,
//         filename: `customer_certificate_${this._id}.pdf`,
//         bytes: customerCertificate.bytes,
//         generatedAt: new Date()
//     };

//     this.sellerCertificate = {
//         public_id: sellerCertificate.public_id,
//         url: sellerCertificate.secure_url,
//         filename: `seller_certificate_${this._id}.pdf`,
//         bytes: sellerCertificate.bytes,
//         generatedAt: new Date()
//     };

//     this.finalCertificate = {
//         public_id: finalCertificate.public_id,
//         url: finalCertificate.secure_url,
//         filename: `final_certificate_${this._id}.pdf`,
//         bytes: finalCertificate.bytes,
//         generatedAt: new Date()
//     };

//     this.status = 'completed';
//     this.currentStep = 4;
//     this.adminApproved = true;
//     this.adminApprovedBy = adminId;
//     this.adminApprovedAt = new Date();
//     this.adminNotes = notes;
//     this.currentRejection = null;
    
//     return this.save();
// };
// contractSchema.methods.getCurrentStep = function() {
//   if (this.status === 'pending-customer') return 1;
//   if (this.status === 'pending-seller') return 2;
//   if (this.status === 'pending-admin' || this.status === 'correcting') return 3;
//   if (this.status === 'completed') return 4;
//   return 1;
// };

// // NEW: Method to initialize contract after bid win
// contractSchema.statics.createFromBid = async function(bid) {
//   const Contract = mongoose.model('Contract');
  
//   const contract = new Contract({
//     bid: bid._id,
//     project: bid.project,
//     customer: bid.customer,
//     seller: bid.seller,
//     contractValue: bid.amount,
//     status: 'pending-customer',
//     currentStep: 1
//   });
  
//   await contract.save();
  
//   // Update bid to mark contract as created
//   bid.contractCreated = true;
//   await bid.save();
  
//   return contract;
// };

// // Add to contractSchema methods in your contract model
// contractSchema.methods.getFilterStatus = function() {
//     if (this.status === 'correcting') {
//         return 'correcting';
//     } else if (this.customerSignedContract && this.customerSignedContract.url &&
//                this.sellerSignedContract && this.sellerSignedContract.url) {
//         return 'ready';
//     } else {
//         return 'waiting';
//     }
// };

// contractSchema.methods.isReadyForApproval = function() {
//     return this.getFilterStatus() === 'ready';
// };

// contractSchema.methods.isWaitingDocuments = function() {
//     return this.getFilterStatus() === 'waiting';
// };

// contractSchema.methods.isNeedsCorrection = function() {
//     return this.getFilterStatus() === 'correcting';
// };

// // Static method to get counts by filter status
// contractSchema.statics.getFilterStatusCounts = async function() {
//     const contracts = await this.find({
//         status: { $in: ['pending-admin', 'correcting'] }
//     });
    
//     let readyCount = 0;
//     let waitingCount = 0;
//     let correctingCount = 0;

//     contracts.forEach(contract => {
//         const status = contract.getFilterStatus();
//         if (status === 'ready') readyCount++;
//         else if (status === 'waiting') waitingCount++;
//         else if (status === 'correcting') correctingCount++;
//     });

//     return {
//         ready: readyCount,
//         waiting: waitingCount,
//         correcting: correctingCount,
//         total: contracts.length
//     };
// };

// // Indexes
// contractSchema.index({ bid: 1 });
// contractSchema.index({ status: 1 });
// contractSchema.index({ 'currentRejection.deadline': 1 });
// contractSchema.index({ customer: 1, status: 1 });
// contractSchema.index({ seller: 1, status: 1 });

// module.exports = mongoose.model('Contract', contractSchema);



const mongoose = require('mongoose');

const contractSchema = new mongoose.Schema({
  // Enhanced Rejection System
  rejectionHistory: [{
    rejectedAt: Date,
    rejectedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    reason: String,
    partyRequired: {
      type: String,
      enum: ['customer', 'seller', 'both','null']
    },
    deadline: Date,
    resolved: {
      type: Boolean,
      default: false
    }
  }],
  
  currentRejection: {
    rejectedAt: Date,
    reason: String,
    partyRequired: {
      type: String,
      enum: ['customer', 'seller', 'both','null']
    },
    deadline: Date
  },

  // EXISTING FIELDS
  bid: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Bid',
    required: [true, 'Bid reference is required']
  },
  project: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Project',
    required: [true, 'Project reference is required']
  },
  customer: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Customer reference is required']
  },
  seller: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Seller reference is required']
  },
  customerTemplate: {
    public_id: String,
    url: String,
    filename: String,
    bytes: Number,
    generatedAt: Date
  },
  sellerTemplate: {
    public_id: String,
    url: String,
    filename: String,
    bytes: Number,
    generatedAt: Date
  },
  customerSignedContract: {
    public_id: String,
    url: String,
    filename: String,
    originalName: String,
    bytes: Number,
    uploadedAt: Date,
    uploadedBy: { type: String, enum: ['admin','customer','null'], default: 'customer' },
    signatureDate: Date,
    ipAddress: String
  },
  sellerSignedContract: {
    public_id: String,
    url: String,
    filename: String,
    originalName: String,
    bytes: Number,
    uploadedAt: Date,
    uploadedBy: { type: String, enum: ['admin','seller','null'], default: 'seller' },
    signatureDate: Date,
    ipAddress: String
  },
  finalCertificate: {
    public_id: String,
    url: String,
    filename: String,
    bytes: Number,
    generatedAt: Date
  },
  customerCertificate: {
    public_id: String,
    url: String,
    filename: String,
    bytes: Number,
    generatedAt: Date
  },
  sellerCertificate: {
    public_id: String,
    url: String,
    filename: String,
    bytes: Number,
    generatedAt: Date
  },
  adminCertificate: {
    public_id: String,
    url: String,
    filename: String,
    bytes: Number,
    generatedAt: Date
  },
  contractValue: { type: Number, required: true },
  terms: {
    type: Map,
    of: mongoose.Schema.Types.Mixed,
    default: new Map()
  },
  currentStep: {
    type: Number,
    enum: [1, 2, 3, 4],
    default: 1
  },
  status: {
    type: String,
    enum: ['pending-customer', 'pending-seller', 'pending-admin', 'completed', 'rejected', 'correcting','null'],
    default: 'pending-customer'
  },
  adminApproved: { type: Boolean, default: false },
  adminApprovedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  adminApprovedAt: Date,
  adminNotes: String,
  adminRejectionReason: String,
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

// Pre-save middleware
contractSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  
  switch(this.status) {
    case 'pending-customer':
      this.currentStep = 1;
      break;
    case 'pending-seller':
      this.currentStep = 2;
      break;
    case 'pending-admin':
    case 'correcting':
      this.currentStep = 3;
      break;
    case 'completed':
      this.currentStep = 4;
      break;
    default:
      this.currentStep = 1;
  }
  
  next();
});

// Enhanced rejectContract method
contractSchema.methods.rejectContract = function(adminId, reason, partyRequired, deadlineHours = 48) {
    const rejectionRecord = {
        rejectedAt: new Date(),
        rejectedBy: adminId,
        reason: reason,
        partyRequired: partyRequired,
        deadline: new Date(Date.now() + deadlineHours * 60 * 60 * 1000),
        resolved: false
    };

    this.rejectionHistory.push(rejectionRecord);
    this.currentRejection = rejectionRecord;
    this.status = 'correcting';
    
    // Reset only the required party's upload info (keep uploadedBy valid)
    if (partyRequired === 'customer' || partyRequired === 'both') {
        this.customerSignedContract = this.customerSignedContract || {};
        this.customerSignedContract.url = undefined;
        this.customerSignedContract.public_id = undefined;
        this.customerSignedContract.filename = undefined;
        this.customerSignedContract.originalName = undefined;
        this.customerSignedContract.bytes = undefined;
        this.customerSignedContract.uploadedAt = undefined;
        this.customerSignedContract.signatureDate = undefined;
        this.customerSignedContract.ipAddress = undefined;
        this.customerSignedContract.uploadedBy = 'customer';
    }
    if (partyRequired === 'seller' || partyRequired === 'both') {
        this.sellerSignedContract = this.sellerSignedContract || {};
        this.sellerSignedContract.url = undefined;
        this.sellerSignedContract.public_id = undefined;
        this.sellerSignedContract.filename = undefined;
        this.sellerSignedContract.originalName = undefined;
        this.sellerSignedContract.bytes = undefined;
        this.sellerSignedContract.uploadedAt = undefined;
        this.sellerSignedContract.signatureDate = undefined;
        this.sellerSignedContract.ipAddress = undefined;
        this.sellerSignedContract.uploadedBy = 'seller';
    }
    
    return this.save();
};

// Approve contract by admin
contractSchema.methods.approveByAdmin = async function(adminId, notes = '') {
    const PDFGenerator = require('../services/pdfGenerator');
    
    // Generate certificates
    const customerCertificate = await PDFGenerator.generateCertificate(
        this.bid,
        this.project,
        this.customer,
        this.seller,
        'customer'
    );
    
    const sellerCertificate = await PDFGenerator.generateCertificate(
        this.bid,
        this.project,
        this.customer,
        this.seller,
        'seller'
    );
    
    const finalCertificate = await PDFGenerator.generateCertificate(
        this.bid,
        this.project,
        this.customer,
        this.seller,
        'final'
    );

    this.customerCertificate = {
        public_id: customerCertificate.public_id,
        url: customerCertificate.secure_url,
        filename: `customer_certificate_${this._id}.pdf`,
        bytes: customerCertificate.bytes,
        generatedAt: new Date()
    };

    this.sellerCertificate = {
        public_id: sellerCertificate.public_id,
        url: sellerCertificate.secure_url,
        filename: `seller_certificate_${this._id}.pdf`,
        bytes: sellerCertificate.bytes,
        generatedAt: new Date()
    };

    this.finalCertificate = {
        public_id: finalCertificate.public_id,
        url: finalCertificate.secure_url,
        filename: `final_certificate_${this._id}.pdf`,
        bytes: finalCertificate.bytes,
        generatedAt: new Date()
    };

    this.status = 'completed';
    this.currentStep = 4;
    this.adminApproved = true;
    this.adminApprovedBy = adminId;
    this.adminApprovedAt = new Date();
    this.adminNotes = notes;
    this.currentRejection = null;
    
    return this.save();
};

module.exports = mongoose.model('Contract', contractSchema);
