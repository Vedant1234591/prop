const { body, validationResult, param, query } = require('express-validator');
const mongoose = require('mongoose');

// Validation rules for project creation
const validateProject = [
    body('title')
        .trim()
        .notEmpty()
        .withMessage('Project title is required')
        .isLength({ min: 5, max: 100 })
        .withMessage('Project title must be between 5 and 100 characters'),
    
    body('description')
        .trim()
        .notEmpty()
        .withMessage('Project description is required')
        .isLength({ min: 10, max: 500 })
        .withMessage('Project description must be between 10 and 500 characters'),
    
    body('category')
        .isIn(['electrification', 'architecture', 'interior-design', 'general-construction'])
        .withMessage('Please select a valid project category'),
    
    body('requirements')
        .trim()
        .notEmpty()
        .withMessage('Project requirements are required')
        .isLength({ min: 20 })
        .withMessage('Project requirements must be at least 20 characters'),
    
    body('address')
        .trim()
        .notEmpty()
        .withMessage('Address is required'),
    
    body('city')
        .trim()
        .notEmpty()
        .withMessage('City is required'),
    
    body('state')
        .trim()
        .notEmpty()
        .withMessage('State is required'),
    
    body('zipCode')
        .trim()
        .notEmpty()
        .withMessage('ZIP code is required')
        .isPostalCode('US')
        .withMessage('Please enter a valid ZIP code'),
    
    body('phone')
        .trim()
        .notEmpty()
        .withMessage('Phone number is required')
        .matches(/^\+?[\d\s-()]{10,}$/)
        .withMessage('Please enter a valid phone number'),
    
    body('startingBid')
        .isFloat({ min: 0 })
        .withMessage('Starting bid must be a valid number')
        .custom((value, { req }) => {
            if (parseFloat(value) <= 0) {
                throw new Error('Starting bid must be greater than 0');
            }
            return true;
        }),
    
    body('bidEndDate')
        .isISO8601()
        .withMessage('Bid end date must be a valid date')
        .custom((value, { req }) => {
            if (new Date(value) <= new Date()) {
                throw new Error('Bid end date must be in the future');
            }
            return true;
        }),
    
    body('startDate')
        .isISO8601()
        .withMessage('Project start date must be a valid date')
        .custom((value, { req }) => {
            if (new Date(value) <= new Date()) {
                throw new Error('Project start date must be in the future');
            }
            return true;
        }),
    
    body('endDate')
        .isISO8601()
        .withMessage('Project end date must be a valid date')
        .custom((value, { req }) => {
            if (new Date(value) <= new Date(req.body.startDate)) {
                throw new Error('Project end date must be after start date');
            }
            return true;
        })
];

// Validation rules for bid submission
const validateBid = [
    body('amount')
        .isFloat({ min: 0 })
        .withMessage('Bid amount must be a valid number')
        .custom((value, { req }) => {
            if (parseFloat(value) <= 0) {
                throw new Error('Bid amount must be greater than 0');
            }
            return true;
        }),
    
    body('proposal')
        .trim()
        .notEmpty()
        .withMessage('Proposal is required')
        .isLength({ min: 50, max: 2000 })
        .withMessage('Proposal must be between 50 and 2000 characters'),
    
    body('startDate')
        .isISO8601()
        .withMessage('Proposed start date must be a valid date'),
    
    body('endDate')
        .isISO8601()
        .withMessage('Proposed end date must be a valid date')
        .custom((value, { req }) => {
            if (new Date(value) <= new Date(req.body.startDate)) {
                throw new Error('Proposed end date must be after start date');
            }
            return true;
        })
];

// Validation rules for user registration
const validateRegistration = [
    body('name')
        .trim()
        .notEmpty()
        .withMessage('Name is required')
        .isLength({ min: 2, max: 50 })
        .withMessage('Name must be between 2 and 50 characters'),
    
    body('email')
        .isEmail()
        .withMessage('Please provide a valid email')
        .normalizeEmail(),
    
    body('password')
        .isLength({ min: 6 })
        .withMessage('Password must be at least 6 characters')
        .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
        .withMessage('Password must contain at least one lowercase letter, one uppercase letter, and one number'),
    
    body('confirmPassword')
        .custom((value, { req }) => {
            if (value !== req.body.password) {
                throw new Error('Passwords do not match');
            }
            return true;
        }),
    
    body('phone')
        .trim()
        .notEmpty()
        .withMessage('Phone number is required')
        .matches(/^\+?[\d\s-()]{10,}$/)
        .withMessage('Please enter a valid phone number'),
    
    body('companyName')
        .if(body('role').equals('seller'))
        .trim()
        .notEmpty()
        .withMessage('Company name is required for service providers')
        .isLength({ min: 2, max: 100 })
        .withMessage('Company name must be between 2 and 100 characters')
];

// Validation rules for user login
const validateLogin = [
    body('email')
        .isEmail()
        .withMessage('Please provide a valid email')
        .normalizeEmail(),
    
    body('password')
        .notEmpty()
        .withMessage('Password is required')
];

// Validation for MongoDB ObjectId parameters
const validateObjectId = [
    param('id')
        .custom((value) => {
            if (!mongoose.Types.ObjectId.isValid(value)) {
                throw new Error('Invalid ID format');
            }
            return true;
        })
];

// Validation for query parameters
const validateFindBidsQuery = [
    query('minBudget')
        .optional()
        .isFloat({ min: 0 })
        .withMessage('Minimum budget must be a valid number'),
    
    query('maxBudget')
        .optional()
        .isFloat({ min: 0 })
        .withMessage('Maximum budget must be a valid number')
        .custom((value, { req }) => {
            if (req.query.minBudget && parseFloat(value) < parseFloat(req.query.minBudget)) {
                throw new Error('Maximum budget cannot be less than minimum budget');
            }
            return true;
        }),
    
    query('category')
        .optional()
        .isIn(['electrification', 'architecture', 'interior-design', 'general-construction', ''])
        .withMessage('Invalid project category')
];

// Middleware to handle validation errors
const handleValidationErrors = (req, res, next) => {
    const errors = validationResult(req);
    
    if (!errors.isEmpty()) {
        const errorMessages = errors.array().map(error => error.msg);
        
        // For API requests, return JSON response
        if (req.xhr || req.headers.accept.indexOf('json') > -1) {
            return res.status(422).json({
                success: false,
                message: 'Validation failed',
                errors: errorMessages
            });
        }
        
        // For regular requests, flash first error and redirect back
        req.flash('error', errorMessages[0]);
        return res.redirect('back');
    }
    
    next();
};

// Sanitization middleware
const sanitizeData = [
    body('*').escape(), // Basic XSS protection
    body('email').normalizeEmail(),
    body('name').trim(),
    body('companyName').trim(),
    body('phone').trim()
];

module.exports = {
    validateProject,
    validateBid,
    validateRegistration,
    validateLogin,
    validateObjectId,
    validateFindBidsQuery,
    handleValidationErrors,
    sanitizeData
};