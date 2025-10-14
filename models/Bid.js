const mongoose = require('mongoose');

const bidSchema = new mongoose.Schema({
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
        startDate: {
            type: Date,
            required: false
        },
        endDate: {
            type: Date,
            required: false
        },
        duration: {
            type: Number,
            min: [1, 'Duration must be at least 1 day'],
            required: false
        }
    },
    // Cloudinary attachments
    attachments: [{
        public_id: {
            type: String,
            required: true
        },
        url: {
            type: String,
            required: true
        },
        filename: String,
        format: String,
        bytes: Number,
        originalName: String,
        description: String,
        uploadedAt: {
            type: Date,
            default: Date.now
        }
    }],
    status: {
        type: String,
        enum: ['submitted', 'won', 'lost', 'in-progress', 'completed', 'cancelled'],
        default: 'submitted'
    },
    isSelected: {
        type: Boolean,
        default: false
    },
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
    adminVerified: {
        type: Boolean,
        default: false
    },
    certificateGenerated: {
        type: Boolean,
        default: false
    },
    certificateUrl: String,
    notes: {
        type: String,
        maxlength: [500, 'Notes cannot exceed 500 characters']
    },
    revisionCount: {
        type: Number,
        default: 0
    },
    lastRevisedAt: Date,
    // ADD THESE NEW FIELDS FOR BETTER TRACKING
    autoWon: {
        type: Boolean,
        default: false
    },
    bidSubmittedAt: {
        type: Date,
        default: Date.now
    },
    contractCreated: {
        type: Boolean,
        default: false
    },
    createdAt: {
        type: Date,
        default: Date.now
    },
    updatedAt: {
        type: Date,
        default: Date.now
    }
});

// Pre-save middleware
bidSchema.pre('save', function(next) {
    this.updatedAt = Date.now();
    
    // Calculate duration if start and end dates are provided
    if (this.timeline.startDate && this.timeline.endDate) {
        const durationMs = this.timeline.endDate - this.timeline.startDate;
        this.timeline.duration = Math.ceil(durationMs / (1000 * 60 * 60 * 24));
    }
    
    next();
});

// Instance method to add attachment
bidSchema.methods.addAttachment = function(attachmentData) {
    this.attachments.push(attachmentData);
    return this.save();
};

// Instance method to remove attachment
bidSchema.methods.removeAttachment = function(publicId) {
    this.attachments = this.attachments.filter(att => att.public_id !== publicId);
    return this.save();
};

// NEW: Instance method to mark as auto-won
bidSchema.methods.markAsAutoWon = function() {
    this.status = 'won';
    this.isSelected = true;
    this.autoWon = true;
    return this.save();
};

// NEW: Instance method to check if bid can be edited
bidSchema.methods.canEdit = function() {
    return this.status === 'submitted' && 
           this.project?.bidSettings?.isActive && 
           new Date() < this.project.bidSettings.bidEndDate;
};

// Indexes
bidSchema.index({ project: 1, seller: 1 });
bidSchema.index({ seller: 1, status: 1 });
bidSchema.index({ customer: 1, status: 1 });
bidSchema.index({ createdAt: -1 });
bidSchema.index({ amount: 1 });
// NEW INDEX for auto selection
bidSchema.index({ project: 1, status: 1, amount: -1 });

module.exports = mongoose.model('Bid', bidSchema);