const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
    name: {
        type: String,
        required: [true, 'Name is required'],
        trim: true,
        maxlength: [100, 'Name cannot exceed 100 characters']
    },
    email: {
        type: String,
        required: [true, 'Email is required'],
        unique: true,
        lowercase: true,
        validate: {
            validator: function(email) {
                return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
            },
            message: 'Please provide a valid email'
        }
    },
    password: {
        type: String,
        required: [true, 'Password is required'],
        minlength: [6, 'Password must be at least 6 characters']
    },
    role: {
        type: String,
        enum: {
            values: ['customer', 'seller', 'admin'],
            message: 'Role must be either customer, seller, or admin'
        },
        required: true
    },
    phone: {
        type: String,
        required: [true, 'Phone number is required'],
        validate: {
            validator: function(phone) {
                return /^\+?[\d\s-()]{10,}$/.test(phone);
            },
            message: 'Please provide a valid phone number'
        }
    },
    address: {
        street: { type: String, trim: true },
        city: { type: String, trim: true },
        state: { type: String, trim: true },
        zipCode: { type: String, trim: true },
        country: {
            type: String,
            default: 'United States'
        }
    },
    companyName: {
        type: String,
        required: function() {
            return this.role === 'seller';
        },
        trim: true
    },
    taxId: {
        type: String,
        trim: true
    },
    // Cloudinary profile image
    profileImage: {
        public_id: String,
        url: {
            type: String,
            default: '/images/default-avatar.png'
        },
        filename: String,
        bytes: Number,
        width: Number,
        height: Number,
        uploadedAt: Date
    },
    // Cloudinary company documents (for sellers)
    companyDocuments: [{
        public_id: {
            type: String,
            required: true
        },
        url: {
            type: String,
            required: true
        },
        filename: String,
        documentType: {
            type: String,
            enum: ['license', 'certificate', 'insurance', 'other'],
            required: true
        },
        description: String,
        bytes: Number,
        uploadedAt: {
            type: Date,
            default: Date.now
        },
        verified: {
            type: Boolean,
            default: false
        }
    }],
    isVerified: {
        type: Boolean,
        default: false
    },
    isActive: {
        type: Boolean,
        default: true
    },
    bio: {
        type: String,
        maxlength: [500, 'Bio cannot exceed 500 characters'],
        trim: true
    },
    ratings: {
        average: {
            type: Number,
            default: 0,
            min: 0,
            max: 5
        },
        count: {
            type: Number,
            default: 0
        },
        breakdown: {
            five: { type: Number, default: 0 },
            four: { type: Number, default: 0 },
            three: { type: Number, default: 0 },
            two: { type: Number, default: 0 },
            one: { type: Number, default: 0 }
        }
    },
    specialization: [{
        type: String,
        trim: true
    }],
    yearsOfExperience: {
        type: Number,
        min: 0,
        max: 100
    },
    lastLogin: Date,
    loginCount: {
        type: Number,
        default: 0
    },
    emailVerified: {
        type: Boolean,
        default: false
    },
    phoneVerified: {
        type: Boolean,
        default: false
    }
}, {
    timestamps: true,
    toJSON: { 
        virtuals: true,
        transform: function(doc, ret) {
            delete ret.password;
            return ret;
        }
    }
});

// Indexes
userSchema.index({ email: 1 });
userSchema.index({ role: 1 });
userSchema.index({ createdAt: -1 });
userSchema.index({ 'ratings.average': -1 });
userSchema.index({ specialization: 1 });

// Pre-save middleware - USING BCRYPTJS CONSISTENTLY
userSchema.pre('save', async function(next) {
    // Only hash the password if it has been modified (or is new)
    if (!this.isModified('password')) return next();
    
    try {
        console.log('🔐 Hashing password for user:', this.email);
        console.log('Original password length:', this.password.length);
        
        // Generate a salt
        const salt = await bcrypt.genSalt(12);
        console.log('Salt generated');
        
        // Hash the password using the salt
        this.password = await bcrypt.hash(this.password, salt);
        
        console.log('✅ Password hashed successfully');
        console.log('Hashed password prefix:', this.password.substring(0, 4));
        console.log('Hashed password length:', this.password.length);
        next();
    } catch (error) {
        console.error('❌ Password hashing error:', error);
        next(error);
    }
});

// Instance method to compare password - USING BCRYPTJS CONSISTENTLY
userSchema.methods.comparePassword = async function(candidatePassword) {
    try {
        console.log('🔐 Password comparison for user:', this.email);
        console.log('Candidate password length:', candidatePassword.length);
        console.log('Stored hash prefix:', this.password.substring(0, 4));
        console.log('Stored hash length:', this.password.length);
        
        // Compare the candidate password with the stored hash
        const isMatch = await bcrypt.compare(candidatePassword, this.password);
        
        console.log('✅ Password match result:', isMatch);
        return isMatch;
    } catch (error) {
        console.error('❌ Password comparison error:', error);
        return false;
    }
};

userSchema.methods.canBid = function() {
    return this.role === 'seller' && this.isVerified && this.isActive;
};

userSchema.methods.addCompanyDocument = function(documentData) {
    this.companyDocuments.push(documentData);
    return this.save();
};

userSchema.methods.removeCompanyDocument = function(publicId) {
    this.companyDocuments = this.companyDocuments.filter(doc => doc.public_id !== publicId);
    return this.save();
};

userSchema.methods.updateRating = function(newRating) {
    if (newRating >= 1 && newRating <= 5) {
        const ratingKey = ['one', 'two', 'three', 'four', 'five'][newRating - 1];
        this.ratings.breakdown[ratingKey] += 1;
        
        const totalRatings = Object.values(this.ratings.breakdown).reduce((a, b) => a + b, 0);
        const weightedSum = this.ratings.breakdown.one * 1 + this.ratings.breakdown.two * 2 + 
                           this.ratings.breakdown.three * 3 + this.ratings.breakdown.four * 4 + 
                           this.ratings.breakdown.five * 5;
        
        this.ratings.average = totalRatings > 0 ? weightedSum / totalRatings : 0;
        this.ratings.count = totalRatings;
    }
};

// Virtuals
userSchema.virtual('formattedAddress').get(function() {
    if (!this.address.street && !this.address.city) return null;
    
    const parts = [];
    if (this.address.street) parts.push(this.address.street);
    if (this.address.city) parts.push(this.address.city);
    if (this.address.state) parts.push(this.address.state);
    if (this.address.zipCode) parts.push(this.address.zipCode);
    
    return parts.join(', ');
});

userSchema.virtual('hasProfileImage').get(function() {
    return !!(this.profileImage && this.profileImage.url && this.profileImage.url !== '/images/default-avatar.png');
});

// Method to update last login
userSchema.methods.updateLastLogin = function() {
    this.lastLogin = new Date();
    this.loginCount += 1;
    return this.save();
};

// Static method to find active users
userSchema.statics.findActiveUsers = function() {
    return this.find({ isActive: true });
};

// Static method to find by role
userSchema.statics.findByRole = function(role) {
    return this.find({ role, isActive: true });
};

module.exports = mongoose.model('User', userSchema);