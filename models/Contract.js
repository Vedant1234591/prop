// models/Contract.js - Enhanced version
const mongoose = require('mongoose');

const contractSchema = new mongoose.Schema({
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

    // STEP 1: Contract Templates (Auto-generated)
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

    // STEP 2: Signed Contracts (Uploaded by users)
    customerSignedContract: {
        public_id: String,
        url: String,
        filename: String,
        originalName: String,
        bytes: Number,
        uploadedAt: Date,
        uploadedBy: { type: String, enum: ['customer'], default: 'customer' },
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
        uploadedBy: { type: String, enum: ['seller'], default: 'seller' },
        signatureDate: Date,
        ipAddress: String
    },
// In the contract schema, ensure you have:
finalCertificate: {
    public_id: String,
    url: String,
    filename: String,
    bytes: Number,
    generatedAt: Date
},
    // STEP 3: Final Certificates (Auto-generated after admin approval)
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

    // Contract Details
    contractValue: {
        type: Number,
        required: true
    },
    terms: {
        type: Map,
        of: mongoose.Schema.Types.Mixed,
        default: new Map()
    },

    // Status Management
    currentStep: {
        type: Number,
        enum: [1, 2, 3, 4], // 1: Customer upload, 2: Seller upload, 3: Admin approval, 4: Completed
        default: 1
    },
    status: {
        type: String,
        enum: ['pending-customer', 'pending-seller', 'pending-admin', 'completed', 'rejected'],
        default: 'pending-customer'
    },

    // Admin Approval
    adminApproved: {
        type: Boolean,
        default: false
    },
    adminApprovedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    adminApprovedAt: Date,
    adminNotes: String,
    adminRejectionReason: String,

    // Timestamps
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
});

// Pre-save middleware to sync currentStep with status
contractSchema.pre('save', function(next) {
    this.updatedAt = Date.now();
    
    // Sync currentStep with status
    switch(this.status) {
        case 'pending-customer':
            this.currentStep = 1;
            break;
        case 'pending-seller':
            this.currentStep = 2;
            break;
        case 'pending-admin':
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

// Instance Methods
contractSchema.methods.canCustomerUpload = function() {
    return this.status === 'pending-customer' && !this.customerSignedContract?.url;
};

contractSchema.methods.isReadyForAdmin = function() {
    return this.customerSignedContract && this.customerSignedContract.url && 
           this.sellerSignedContract && this.sellerSignedContract.url;
};

// Add this method to check if seller can upload
contractSchema.methods.canSellerUpload = function() {
    return this.status === 'pending-seller' && 
           this.customerSignedContract && this.customerSignedContract.url && 
           !this.sellerSignedContract;
};

contractSchema.methods.completeCustomerStep = async function() {
    if (this.customerSignedContract?.url) {
        this.status = 'pending-seller';
        this.currentStep = 2;
        this.updatedAt = new Date();
        await this.save();
    }
    return this;
};

contractSchema.methods.completeSellerStep = async function() {
    if (this.sellerSignedContract?.url) {
        this.status = 'pending-admin';
        this.currentStep = 3;
        this.updatedAt = new Date();
        await this.save();
    }
    return this;
};

contractSchema.methods.approveByAdmin = async function(adminId, notes = '') {
    this.status = 'completed';
    this.currentStep = 4;
    this.adminApproved = true;
    this.adminApprovedBy = adminId;
    this.adminApprovedAt = new Date();
    this.adminNotes = notes;
    return this.save();
};

contractSchema.methods.getCurrentStep = function() {
    if (this.status === 'pending-customer') return 1;
    if (this.status === 'pending-seller') return 2;
    if (this.status === 'pending-admin') return 3;
    if (this.status === 'completed') return 4;
    return 1;
};
module.exports = mongoose.model('Contract', contractSchema);