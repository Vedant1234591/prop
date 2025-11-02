const mongoose = require('mongoose');

const agreementSchema = new mongoose.Schema({
  project: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Project',
    required: true
  },
  category: {
    type: String,
    enum: ['electrification', 'architecture', 'interior-design', 'general-construction'],
    required: true
  },
  clauses: [{
    clauseNumber: {
      type: Number,
      required: true
    },
    title: {
      type: String,
      required: true,
      trim: true
    },
    description: {
      type: String,
      required: true,
      trim: true
    },
    required: {
      type: Boolean,
      default: false
    },
    categorySpecific: {
      type: Boolean,
      default: false
    },
    fieldReference: String,
    helpText: String,
    consequences: String
  }],
  customClauses: [{
    title: String,
    description: String,
    required: {
      type: Boolean,
      default: false
    },
    addedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    addedAt: {
      type: Date,
      default: Date.now
    },
    isActive: {
      type: Boolean,
      default: true
    }
  }],
  version: {
    type: String,
    default: '1.0'
  },
  isActive: {
    type: Boolean,
    default: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  },
  lastModifiedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
});

// Pre-save middleware
agreementSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

// Static method to get agreements by category
agreementSchema.statics.getByCategory = function(category) {
  return this.findOne({ category, isActive: true });
};

// Static method to create default agreements for a project
agreementSchema.statics.createDefaultAgreements = async function(project) {
  const defaultClauses = this.getDefaultClauses(project.category);
  
  const agreement = new this({
    project: project._id,
    category: project.category,
    clauses: defaultClauses,
    lastModifiedBy: project.customer
  });
  
  return await agreement.save();
};

// Method to get default clauses based on category
agreementSchema.statics.getDefaultClauses = function(category) {
  const commonClauses = [
    {
      clauseNumber: 1,
      title: "Project Timeline Agreement",
      description: "I agree to complete the project within the specified timeline as per project requirements.",
      required: true,
      categorySpecific: false,
      fieldReference: "timeline",
      helpText: "Ensure you can meet the project deadline before agreeing",
      consequences: "Failure to meet timeline may result in penalties or contract termination"
    },
    {
      clauseNumber: 2,
      title: "Budget Compliance",
      description: "I agree to work within the agreed budget and provide transparent cost breakdown.",
      required: true,
      categorySpecific: false,
      fieldReference: "bidSettings.startingBid",
      helpText: "Your bid amount should reflect all project costs",
      consequences: "Significant budget overruns may not be approved"
    },
    {
      clauseNumber: 3,
      title: "Quality Standards",
      description: "I agree to maintain high-quality standards as per industry specifications.",
      required: true,
      categorySpecific: false,
      fieldReference: "requirements",
      helpText: "Ensure you understand and can meet all quality requirements",
      consequences: "Substandard work may require rework at your cost"
    },
    {
      clauseNumber: 4,
      title: "Change Order Process",
      description: "I agree to follow the formal change order process for any scope changes.",
      required: false,
      categorySpecific: false,
      fieldReference: null,
      helpText: "All changes must be documented and approved",
      consequences: "Unauthorized changes may not be compensated"
    }
  ];

  const categorySpecificClauses = {
    'electrification': [
      {
        clauseNumber: 5,
        title: "Electrical Safety Standards",
        description: "I agree to comply with all electrical safety standards and regulations including NEC codes.",
        required: true,
        categorySpecific: true,
        fieldReference: "specifications.safetyStandards",
        helpText: "Must have proper electrical licensing and insurance",
        consequences: "Safety violations may result in immediate termination"
      }
    ],
    'architecture': [
      {
        clauseNumber: 5,
        title: "Structural Compliance",
        description: "I agree to comply with all structural engineering standards and building codes.",
        required: true,
        categorySpecific: true,
        fieldReference: "specifications.buildingType",
        helpText: "Must have structural engineering expertise",
        consequences: "Structural failures may have legal implications"
      }
    ],
    'interior-design': [
      {
        clauseNumber: 5,
        title: "Design Specifications",
        description: "I agree to follow the design specifications and client preferences exactly.",
        required: true,
        categorySpecific: true,
        fieldReference: "specifications.designStyle",
        helpText: "Review all design documents thoroughly",
        consequences: "Design deviations may not be accepted"
      }
    ],
    'general-construction': [
      {
        clauseNumber: 5,
        title: "Construction Standards",
        description: "I agree to follow all construction standards and safety protocols.",
        required: true,
        categorySpecific: true,
        fieldReference: "specifications.constructionType",
        helpText: "Maintain daily safety briefings and documentation",
        consequences: "Safety violations may stop work immediately"
      }
    ]
  };

  return [...commonClauses, ...(categorySpecificClauses[category] || [])];
};

// Method to validate agreement responses
agreementSchema.methods.validateResponses = function(project, responses) {
  const validationResults = {
    isValid: true,
    errors: [],
    warnings: []
  };

  this.clauses.forEach(clause => {
    const response = responses.find(r => 
      r.clauseId && r.clauseId.toString() === clause._id.toString()
    );
    
    if (clause.required && (!response || !response.agreed)) {
      validationResults.isValid = false;
      validationResults.errors.push(`Required clause "${clause.title}" must be agreed`);
    }

    // Check if remarks are provided for disagreed clauses
    if (response && !response.agreed && (!response.remarks || response.remarks.trim() === '')) {
      validationResults.warnings.push(`Remarks recommended for disagreed clause: ${clause.title}`);
    }
  });

  return validationResults;
};

module.exports = mongoose.model('Agreement', agreementSchema);