const mongoose = require('mongoose');

const projectSchema = new mongoose.Schema({
    title: {
        type: String,
        required: [true, 'Project title is required'],
        trim: true,
        maxlength: [200, 'Title cannot exceed 200 characters']
    },
    adminVerified: {
        type: Boolean,
        default: false
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
            required: [true, 'End date is required'],
          
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
    // Cloudinary image fields
    images: [{
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
        width: Number,
        height: Number,
        createdAt: {
            type: Date,
            default: Date.now
        }
    }],
    // Cloudinary document fields
    documents: [{
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
        uploadedAt: {
            type: Date,
            default: Date.now
        }
    }],
    status: {
        type: String,
        enum: ['drafted', 'in-progress', 'half-partial', 'full-partial', 'half-completed', 'completed', 'failed', 'cancelled'],
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
            required: [true, 'Bid end date is required'],
           
        },
        isActive: {
            type: Boolean,
            default: true
        },
        autoSelectWinner: {
            type: Boolean,
            default: true
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
        default: true
    },
    viewCount: {
        type: Number,
        default: 0
    },
    // ADD THESE NEW FIELDS
    autoActivated: {
        type: Boolean,
        default: false
    },
    biddingCompleted: {
        type: Boolean,
        default: false
    },
    winnerSelectedAt: Date,
    contractGenerated: {
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
    
    // NEW: Auto-activate project when start date arrives
    if (this.status === 'drafted' && this.timeline.startDate <= new Date()) {
        this.status = 'in-progress';
        this.autoActivated = true;
        this.bidSettings.isActive = true;
    }
    
    next();
});

// Pre-save middleware for update operations
projectSchema.pre('findOneAndUpdate', function(next) {
    this.set({ updatedAt: Date.now() });
    next();
});

// Virtual for checking if bids are still accepted
projectSchema.virtual('isAcceptingBids').get(function() {
    return this.bidSettings.isActive && new Date() < this.bidSettings.bidEndDate;
});

// NEW: Virtual for checking if bidding has ended
projectSchema.virtual('isBiddingEnded').get(function() {
    return !this.bidSettings.isActive || new Date() >= this.bidSettings.bidEndDate;
});

// Virtual for image count
projectSchema.virtual('imageCount').get(function() {
    return this.images.length;
});

// Virtual for document count
projectSchema.virtual('documentCount').get(function() {
    return this.documents.length;
});

// Instance method to add image
projectSchema.methods.addImage = function(imageData) {
    this.images.push(imageData);
    return this.save();
};

// Instance method to add document
projectSchema.methods.addDocument = function(documentData) {
    this.documents.push(documentData);
    return this.save();
};

// Instance method to remove image by public_id
projectSchema.methods.removeImage = function(publicId) {
    this.images = this.images.filter(img => img.public_id !== publicId);
    return this.save();
};

// Instance method to remove document by public_id
projectSchema.methods.removeDocument = function(publicId) {
    this.documents = this.documents.filter(doc => doc.public_id !== publicId);
    return this.save();
};

// NEW: Instance method to close bidding and select winner
projectSchema.methods.closeBiddingAndSelectWinner = async function() {
    if (this.biddingCompleted || this.bidSettings.isActive) return null;
    
    const Bid = mongoose.model('Bid');
    const Contract = mongoose.model('Contract');
    
    // Find the highest bid
    const winningBid = await Bid.findOne({ project: this._id, status: 'submitted' })
        .sort({ amount: -1 })
        .populate('seller');
    
    if (winningBid) {
        // Mark winning bid
        winningBid.status = 'won';
        winningBid.isSelected = true;
        winningBid.autoWon = true;
        await winningBid.save();
        
        // Mark other bids as lost
        await Bid.updateMany(
            { project: this._id, _id: { $ne: winningBid._id }, status: 'submitted' },
            { status: 'lost' }
        );
        
        // Update project
        this.selectedBid = winningBid._id;
        this.bidSettings.isActive = false;
        this.biddingCompleted = true;
        this.winnerSelectedAt = new Date();
        await this.save();
        
        // Create contract
        const contract = await Contract.create({
            bid: winningBid._id,
            project: this._id,
            customer: this.customer,
            seller: winningBid.seller,
            contractValue: winningBid.amount,
            status: 'pending-customer',
            autoGenerated: true
        });
        
        this.contractGenerated = true;
        await this.save();
        
        return { winningBid, contract };
    }
    
    // No bids case
    this.bidSettings.isActive = false;
    this.biddingCompleted = true;
    this.status = 'failed';
    await this.save();
    
    return null;
};

// Static method to auto-process projects
projectSchema.statics.autoProcessProjects = async function() {
    const now = new Date();
    
    // 1. Activate drafted projects
    await this.updateMany(
        {
            status: 'drafted',
            'timeline.startDate': { $lte: now }
        },
        {
            status: 'in-progress',
            'bidSettings.isActive': true,
            autoActivated: true
        }
    );
    
    // 2. Close bidding for expired projects
    const expiredProjects = await this.find({
        'bidSettings.isActive': true,
        'bidSettings.bidEndDate': { $lte: now },
        biddingCompleted: false
    });
    
    for (const project of expiredProjects) {
        await project.closeBiddingAndSelectWinner();
    }
};

// Indexes
projectSchema.index({ customer: 1, status: 1 });
projectSchema.index({ category: 1, status: 1 });
projectSchema.index({ 'bidSettings.bidEndDate': 1 });
projectSchema.index({ createdAt: -1 });
projectSchema.index({ isPublic: 1 });
// NEW INDEXES for auto-processing
projectSchema.index({ status: 1, 'timeline.startDate': 1 });
projectSchema.index({ 'bidSettings.isActive': 1, 'bidSettings.bidEndDate': 1 });

module.exports = mongoose.model('Project', projectSchema);