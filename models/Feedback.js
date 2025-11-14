const mongoose = require('mongoose');

const feedbackSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  email: {
    type: String,
    required: true,
    trim: true
  },
  phone: {
    type: String,
    trim: true
  },
  subject: {
    type: String,
    required: true,
    trim: true
  },
  message: {
    type: String,
    required: true,
    trim: true
  },
  rating: {
    type: Number,
    min: 1,
    max: 5,
    required: true
  },
  category: {
    type: String,
    enum: ['general', 'service', 'technical', 'suggestion', 'complaint', 'other'],
    default: 'general'
  },
  userType: {
    type: String,
    enum: ['customer', 'seller', 'visitor', 'other'],
    default: 'visitor'
  },
  status: {
    type: String,
    enum: ['pending', 'approved', 'rejected'],
    default: 'approved' // Auto-approve all feedback for public display
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('Feedback', feedbackSchema);