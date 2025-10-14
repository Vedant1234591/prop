const mongoose = require('mongoose');

const noticeSchema = new mongoose.Schema({
    title: {
        type: String,
        required: true
    },
    content: {
        type: String,
        required: true
    },
    type: {
        type: String,
        enum: ['general', 'customer', 'seller', 'urgent'],
        default: 'general'
    },
    targetAudience: [{
        type: String,
        enum: ['all', 'customer', 'seller']
    }],
    isActive: {
        type: Boolean,
        default: true
    },
    priority: {
        type: String,
        enum: ['low', 'medium', 'high'],
        default: 'medium'
    },
    startDate: {
        type: Date,
        default: Date.now
    },
    endDate: Date,
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

module.exports = mongoose.model('Notice', noticeSchema);