const mongoose = require('mongoose');
const Project = require('../models/Project');
const Bid = require('../models/Bid');
const User = require('../models/User');
const Notice = require('../models/Notice');
const Contract = require('../models/Contract');
const cloudinary = require('../config/cloudinary');
const moment = require('moment');
const statusAutomation = require('../services/statusAutomation');

// Dashboard - ENHANCED with automatic processing
exports.getDashboard = async (req, res) => {
    try {
        console.log('=== DASHBOARD DEBUG ===');
        console.log('Session user:', req.session.user);
        console.log('Req.user:', req.user);
        
        const customerId = req.session.userId;
        
        if (!customerId) {
            console.log('No customerId found in session');
            req.flash('error', 'Please log in to access dashboard');
            return res.redirect('/auth/login');
        }

        console.log('Customer ID:', customerId);
        
        // ✅ Force status update before showing dashboard
        await statusAutomation.updateAllProjectStatuses();

        // Get project statistics
        const stats = await Project.aggregate([
            { $match: { customer: new mongoose.Types.ObjectId(customerId) } },
            { $group: {
                _id: '$status',
                count: { $sum: 1 }
            }}
        ]);

        // Initialize status counts with ALL possible statuses
        const statusCounts = {
            'drafted': 0,
            'in-progress': 0,
            'half-partial': 0,
            'full-partial': 0,
            'half-completed': 0,
            'completed': 0,
            'failed': 0,
            'cancelled': 0
        };

        // Convert aggregation result to status counts
        stats.forEach(stat => {
            if (statusCounts.hasOwnProperty(stat._id)) {
                statusCounts[stat._id] = stat.count;
            }
        });

        // Get latest bids (ONLY for this customer's projects)
        const customerProjects = await Project.find({ customer: customerId }).select('_id');
        const projectIds = customerProjects.map(p => p._id);

        const latestBids = await Bid.find({ project: { $in: projectIds } })
            .populate('project', 'title featuredImage')
            .populate('seller', 'name companyName profileImage')
            .sort({ createdAt: -1 })
            .limit(10);

        // Get latest notices for customers
        const latestNotices = await Notice.find({
            $or: [
                { targetAudience: 'all' },
                { targetAudience: 'customer' }
            ],
            isActive: true,
            startDate: { $lte: new Date() },
            $or: [
                { endDate: { $gte: new Date() } },
                { endDate: null }
            ]
        })
        .sort({ createdAt: -1 })
        .limit(10);

        // NEW: Get projects with pending contracts
        const projectsWithPendingContracts = await Project.find({
            customer: customerId,
            selectedBid: { $exists: true },
            status: 'in-progress'
        }).populate('selectedBid');

        const pendingContracts = [];
        for (const project of projectsWithPendingContracts) {
            const contract = await Contract.findOne({ 
                project: project._id,
                status: { $in: ['pending-customer', 'pending-seller', 'pending-admin'] }
            });
            if (contract) {
                pendingContracts.push({
                    project: project,
                    contract: contract
                });
            }
        }

        // Use session user data for the template
        const userData = req.session.user || { name: 'Customer', email: '' };

        res.render('customer/dashboard', {
            user: userData,
            currentPage: 'dashboard',
            stats: statusCounts,
            latestBids: latestBids || [],
            latestNotices: latestNotices || [],
            pendingContracts: pendingContracts || [],
            moment: moment
        });
    } catch (error) {
        console.error('Dashboard error:', error);
        req.flash('error', 'Error loading dashboard');
        res.redirect('/auth/login');
    }
};

// Get My Projects - ENHANCED with automatic processing
exports.getMyProjects = async (req, res) => {
    try {
        const customerId = req.session.userId;
        
        if (!customerId) {
            req.flash('error', 'Please log in to view your projects');
            return res.redirect('/auth/login');
        }

        // ✅ Force status update before showing projects
        await statusAutomation.updateAllProjectStatuses();

        const projects = await Project.find({ customer: customerId })
            .sort({ createdAt: -1 })
            .populate('bids')
            .populate({
                path: 'selectedBid',
                populate: {
                    path: 'seller',
                    select: 'name companyName email phone rating profileImage'
                }
            })
            .select('title description category status location timeline bidSettings featuredImage images bids selectedBid createdAt');

        // NEW: Get contract information for each project
        const projectsWithContracts = [];
        for (const project of projects) {
            const contract = await Contract.findOne({ project: project._id })
                .populate('seller', 'name companyName');
            
            projectsWithContracts.push({
                ...project.toObject(),
                contract: contract
            });
        }

        const userData = req.session.user || { name: 'Customer', email: '' };

        const customerProjects = await Project.find({ customer: customerId }).select('_id');
        const projectIds = customerProjects.map(p => p._id);
        const bidCount = await Bid.countDocuments({ 
            project: { $in: projectIds },
            status: 'submitted'
        });

        res.render('customer/my-projects', {
            user: userData,
            currentPage: 'projects',
            projects: projectsWithContracts || [],
            bidCount: bidCount,
            messageCount: 0,
            moment: moment
        });

    } catch (error) {
        console.error('Get my projects error:', error);
        req.flash('error', 'Error loading projects: ' + error.message);
        res.redirect('/customer/dashboard');
    }
};

// Enhanced getProjectDetails - Add status update and contract info
exports.getProjectDetails = async (req, res) => {
    try {
        // Force status update before showing project details
        await statusAutomation.updateAllProjectStatuses();

        const project = await Project.findById(req.params.id)
            .populate('customer')
            .populate({
                path: 'bids',
                populate: {
                    path: 'seller',
                    select: 'name companyName email phone rating profileImage'
                }
            })
            .populate({
                path: 'selectedBid', // ✅ This should be the ObjectId, not the full bid object
                select: '_id' // ✅ Only select the _id to avoid serialization issues
            });

        if (!project) {
            req.flash('error', 'Project not found');
            return res.redirect('/customer/my-projects');
        }

        if (project.customer._id.toString() !== req.session.userId.toString()) {
            req.flash('error', 'Unauthorized access');
            return res.redirect('/customer/my-projects');
        }

        // Get contract information
        const contract = await Contract.findOne({ project: req.params.id })
            .populate('seller', 'name companyName email phone')
            .populate('bid', 'amount proposal');

        const userData = req.session.user || { name: 'Customer', email: '' };

        res.render('customer/project-details', {
            user: userData,
            currentPage: 'projects',
            project,
            bids: project.bids || [],
            contract: contract || null,
            moment: moment
        });
    } catch (error) {
        console.error('Get project details error:', error);
        req.flash('error', 'Error loading project details');
        res.redirect('/customer/my-projects');
    }
};
// Get Bids Page - ENHANCED with automatic processing
exports.getBids = async (req, res) => {
    try {
        const customerId = req.session.userId;
        
        // ✅ Force status update before showing bids
        await statusAutomation.updateAllProjectStatuses();

        // Get customer's projects
        const customerProjects = await Project.find({ customer: customerId }).select('_id');
        const projectIds = customerProjects.map(p => p._id);

        // Get all bids for customer's projects
        const bids = await Bid.find({ project: { $in: projectIds } })
            .populate('project', 'title category featuredImage bidSettings')
            .populate('seller', 'name companyName email phone rating profileImage')
            .sort({ createdAt: -1 });

        const userData = req.session.user || { name: 'Customer', email: '' };

        res.render('customer/bids', {
            user: userData,
            currentPage: 'bids',
            bids: bids || [],
            moment: moment
        });
    } catch (error) {
        console.error('Get bids error:', error);
        req.flash('error', 'Error loading bids');
        res.redirect('/customer/dashboard');
    }
};

// NEW: Get project bids specifically
exports.getProjectBids = async (req, res) => {
    try {
        const { projectId } = req.params;
        const customerId = req.session.userId;

        const project = await Project.findById(projectId);
        if (!project || project.customer.toString() !== customerId) {
            req.flash('error', 'Project not found or unauthorized');
            return res.redirect('/customer/my-projects');
        }

        const bids = await Bid.find({ project: projectId })
            .populate('seller', 'name companyName email phone rating profileImage')
            .sort({ amount: -1 });

        const userData = req.session.user || { name: 'Customer', email: '' };

        res.render('customer/project-bids', {
            user: userData,
            currentPage: 'projects',
            project: project,
            bids: bids,
            moment: moment
        });
    } catch (error) {
        console.error('Get project bids error:', error);
        req.flash('error', 'Error loading project bids');
        res.redirect('/customer/my-projects');
    }
};

// NEW: Get won projects with contracts
exports.getWonProjects = async (req, res) => {
    try {
        const customerId = req.session.userId;
        
        // Get projects where customer has selected a bid or bid was auto-won
        const wonProjects = await Project.find({
            customer: customerId,
            selectedBid: { $exists: true },
            status: { $in: ['in-progress', 'completed'] }
        })
        .populate('selectedBid')
        .populate({
            path: 'selectedBid',
            populate: {
                path: 'seller',
                select: 'name companyName email phone'
            }
        })
        .sort({ updatedAt: -1 });

        // Get contract information for each project
        const projectsWithContracts = [];
        for (const project of wonProjects) {
            const contract = await Contract.findOne({ project: project._id });
            projectsWithContracts.push({
                project: project,
                contract: contract
            });
        }

        const userData = req.session.user || { name: 'Customer', email: '' };

        res.render('customer/won-projects', {
            user: userData,
            currentPage: 'won-projects',
            projects: projectsWithContracts,
            moment: moment
        });
    } catch (error) {
        console.error('Get won projects error:', error);
        req.flash('error', 'Error loading won projects');
        res.redirect('/customer/dashboard');
    }
};

// NEW: Get contract status
exports.getContractStatus = async (req, res) => {
    try {
        const { projectId } = req.params;
        const customerId = req.session.userId;

        const project = await Project.findById(projectId);
        if (!project || project.customer.toString() !== customerId) {
            req.flash('error', 'Project not found or unauthorized');
            return res.redirect('/customer/my-projects');
        }

        const contract = await Contract.findOne({ project: projectId })
            .populate('seller', 'name companyName')
            .populate('bid', 'amount proposal');

        const userData = req.session.user || { name: 'Customer', email: '' };

        res.render('customer/contract-status', {
            user: userData,
            currentPage: 'projects',
            project: project,
            contract: contract,
            moment: moment
        });
    } catch (error) {
        console.error('Get contract status error:', error);
        req.flash('error', 'Error loading contract status');
        res.redirect('/customer/my-projects');
    }
};

// Get Profile Page
exports.getProfile = async (req, res) => {
    try {
        const user = await User.findById(req.session.userId);
        
        if (!user) {
            req.flash('error', 'User not found');
            return res.redirect('/customer/dashboard');
        }

        const userData = req.session.user || { name: 'Customer', email: '' };

        res.render('customer/profile', {
            user: userData,
            currentPage: 'profile',
            profile: user
        });
    } catch (error) {
        console.error('Get profile error:', error);
        req.flash('error', 'Error loading profile');
        res.redirect('/customer/dashboard');
    }
};

// Update Profile Image
exports.updateProfileImage = async (req, res) => {
    try {
        if (!req.file) {
            req.flash('error', 'Please select an image to upload');
            return res.redirect('/customer/profile');
        }

        const user = await User.findById(req.session.userId);
        
        if (!user) {
            req.flash('error', 'User not found');
            return res.redirect('/customer/profile');
        }

        // Delete old profile image from Cloudinary if exists
        if (user.profileImage && user.profileImage.public_id) {
            try {
                await cloudinary.uploader.destroy(user.profileImage.public_id);
            } catch (error) {
                console.error('Error deleting old profile image:', error);
            }
        }

        // Update user with new profile image
        user.profileImage = {
            public_id: req.file.filename,
            url: req.file.path,
            filename: req.file.originalname,
            bytes: req.file.size,
            width: req.file.width,
            height: req.file.height,
            uploadedAt: new Date()
        };

        await user.save();

        // Update session user data
        req.session.user.profileImage = user.profileImage;

        req.flash('success', 'Profile image updated successfully!');
        res.redirect('/customer/profile');
    } catch (error) {
        console.error('Update profile image error:', error);
        req.flash('error', 'Error updating profile image: ' + error.message);
        res.redirect('/customer/profile');
    }
};

// Get Messages Page
exports.getMessages = async (req, res) => {
    try {
        const userData = req.session.user || { name: 'Customer', email: '' };

        res.render('customer/messages', {
            user: userData,
            currentPage: 'messages',
            messages: []
        });
    } catch (error) {
        console.error('Get messages error:', error);
        req.flash('error', 'Error loading messages');
        res.redirect('/customer/dashboard');
    }
};

// Get Notices Page
exports.getNotices = async (req, res) => {
    try {
        const notices = await Notice.find({
            $or: [
                { targetAudience: 'all' },
                { targetAudience: 'customer' }
            ],
            isActive: true,
            startDate: { $lte: new Date() },
            $or: [
                { endDate: { $gte: new Date() } },
                { endDate: null }
            ]
        })
        .sort({ createdAt: -1 });

        const userData = req.session.user || { name: 'Customer', email: '' };

        res.render('customer/notices', {
            user: userData,
            currentPage: 'notices',
            notices: notices || []
        });
    } catch (error) {
        console.error('Get notices error:', error);
        req.flash('error', 'Error loading notices');
        res.redirect('/customer/dashboard');
    }
};

// Project Management
exports.getAddProject = async (req, res) => {
    try {
        const userData = req.session.user || { name: 'Customer', email: '' };
        
        res.render('customer/add-project', { 
            user: userData,
            currentPage: 'add-project',
            categories: ['electrification', 'architecture', 'interior-design', 'general-construction']
        });
    } catch (error) {
        console.error('Get add project error:', error);
        req.flash('error', 'Error loading project form');
        res.redirect('/customer/dashboard');
    }
};

// Get Project Form with step parameter
exports.getProjectForm = async (req, res) => {
    try {
        const { category } = req.params;
        const { step = 1 } = req.query;
        
        const userData = req.session.user || { name: 'Customer', email: '' };
        
        res.render('customer/project-form', { 
            user: userData,
            currentPage: 'add-project',
            category,
            step: parseInt(step),
            projectData: req.session.projectData || {}
        });
    } catch (error) {
        console.error('Get project form error:', error);
        req.flash('error', 'Error loading project form');
        res.redirect('/customer/add-project');
    }
};

exports.postProjectStep1 = async (req, res) => {
    try {
        const { category } = req.params;
        
        console.log('=== STEP 1 DEBUG ===');
        console.log('Request body:', req.body);
        
        // Store step 1 data in session
        req.session.projectData = {
            ...req.session.projectData,
            title: req.body.title,
            description: req.body.description,
            phone: req.body.phone,
            address: req.body.address,
            city: req.body.city,
            state: req.body.state,
            zipCode: req.body.zipCode,
            category: category
        };

        console.log('Session data after step 1:', req.session.projectData);

        res.redirect(`/customer/project-form/${category}?step=2`);
    } catch (error) {
        console.error('Project step 1 error:', error);
        req.flash('error', 'Error saving project details');
        res.redirect('back');
    }
};

exports.postProjectStep2 = async (req, res) => {
    try {
        const { category } = req.params;
        
        console.log('=== STEP 2 DEBUG ===');
        console.log('Request body:', req.body);
        console.log('Files:', req.files);
        
        // Process Cloudinary uploads
        const imageFiles = req.files?.images || [];
        const documentFiles = req.files?.documents || [];
        
        const processedImages = imageFiles.map(file => ({
            public_id: file.filename,
            url: file.path,
            filename: file.originalname,
            format: file.format,
            bytes: file.size,
            width: file.width,
            height: file.height,
            createdAt: new Date()
        }));

        const processedDocuments = documentFiles.map(file => ({
            public_id: file.filename,
            url: file.path,
            filename: file.originalname,
            format: file.format,
            bytes: file.size,
            originalName: file.originalname,
            uploadedAt: new Date()
        }));

        req.session.projectData = {
            ...req.session.projectData,
            requirements: req.body.requirements,
            specifications: req.body.specifications || {},
            images: processedImages,
            documents: processedDocuments
        };

        console.log('Session data after step 2:', req.session.projectData);

        res.redirect(`/customer/project-form/${category}?step=3`);
    } catch (error) {
        console.error('Project step 2 error:', error);
        req.flash('error', 'Error uploading files: ' + error.message);
        res.redirect('back');
    }
};

exports.postProjectStep3 = async (req, res) => {
    try {
        const { category } = req.params;
        const customerId = req.session.userId;
        
        console.log('=== PROJECT STEP 3 DEBUG ===');
        console.log('Session projectData:', req.session.projectData);
        console.log('Request body:', req.body);
        console.log('Customer ID:', customerId);
        
        if (!req.session.projectData) {
            req.flash('error', 'Project data not found. Please start over.');
            return res.redirect('/customer/add-project');
        }

        // Validate required fields
        const requiredFields = ['startingBid', 'bidEndDate', 'startDate', 'endDate'];
        const missingFields = requiredFields.filter(field => !req.body[field]);
        
        if (missingFields.length > 0) {
            req.flash('error', `Missing required fields: ${missingFields.join(', ')}`);
            return res.redirect(`/customer/project-form/${category}?step=3`);
        }

        // Parse datetime-local values
        let bidEndDate = new Date(req.body.bidEndDate);
        let startDate = new Date(req.body.startDate);
        let endDate = new Date(req.body.endDate);

        const now = new Date();

        console.log('Date validation:', {
            bidEndDate,
            startDate,
            endDate,
            now,
            bidEndDateValid: bidEndDate > now,
            startDateValid: startDate > now,
            endDateValid: endDate > startDate
        });

        // Date validation
        if (bidEndDate <= now) {
            req.flash('error', 'Bid end date must be in the future.');
            return res.redirect(`/customer/project-form/${category}?step=3`);
        }

        if (startDate <= now) {
            req.flash('error', 'Project start date must be in the future.');
            return res.redirect(`/customer/project-form/${category}?step=3`);
        }

        if (endDate <= startDate) {
            req.flash('error', 'Project end date must be after start date.');
            return res.redirect(`/customer/project-form/${category}?step=3`);
        }

        // Calculate duration in days
        const durationMs = endDate - startDate;
        const durationDays = Math.ceil(durationMs / (1000 * 60 * 60 * 24));

        // Convert specifications to Map
        const specificationsMap = new Map();
        if (req.session.projectData.specifications) {
            Object.entries(req.session.projectData.specifications).forEach(([key, value]) => {
                if (value && value.trim() !== '') {
                    specificationsMap.set(key, value.trim());
                }
            });
        }

        // Prepare project data with proper structure
        const projectData = {
            title: req.session.projectData.title?.trim(),
            description: req.session.projectData.description?.trim(),
            category: category,
            customer: customerId,
            status: 'drafted',
            timeline: {
                startDate: startDate,
                endDate: endDate,
                duration: durationDays
            },
            bidSettings: {
                startingBid: parseFloat(req.body.startingBid),
                bidEndDate: bidEndDate,
                isActive: true,
                autoSelectWinner: req.body.autoSelectWinner === 'true'
            },
            location: {
                address: req.session.projectData.address?.trim(),
                city: req.session.projectData.city?.trim(),
                state: req.session.projectData.state?.trim(),
                zipCode: req.session.projectData.zipCode?.trim()
            },
            contact: {
                phone: req.session.projectData.phone?.trim(),
                email: req.session.user?.email || ''
            },
            requirements: req.session.projectData.requirements?.trim(),
            specifications: specificationsMap,
            images: req.session.projectData.images || [],
            documents: req.session.projectData.documents || [],
            isPublic: true
        };

        console.log('Final project data to save:', projectData);

        // Validate project data before saving
        if (!projectData.title || !projectData.description) {
            req.flash('error', 'Project title and description are required.');
            return res.redirect(`/customer/project-form/${category}?step=3`);
        }

        // Create the project
        const project = new Project(projectData);
        await project.save();
        
        console.log('Project created successfully:', project._id);

        // Clear session data
        delete req.session.projectData;

        req.flash('success', 'Project created successfully! You can now view it in "My Projects".');
        res.redirect('/customer/my-projects');
        
    } catch (error) {
        console.error('Project creation error:', error);
        
        // More detailed error logging
        if (error.name === 'ValidationError') {
            const errors = Object.values(error.errors).map(err => err.message);
            console.log('Validation errors:', errors);
            req.flash('error', `Validation error: ${errors.join(', ')}`);
        } else if (error.code === 11000) {
            req.flash('error', 'A project with similar details already exists.');
        } else {
            req.flash('error', 'Error creating project: ' + error.message);
        }
        
        res.redirect(`/customer/project-form/${category}?step=3`);
    }
};

// Bid Management
exports.selectBid = async (req, res) => {
    try {
        const { bidId } = req.params;
        
        const bid = await Bid.findById(bidId)
            .populate('project')
            .populate('seller');

        if (!bid) {
            req.flash('error', 'Bid not found');
            return res.redirect('back');
        }

        // Check if project belongs to customer
        if (bid.project.customer.toString() !== req.session.userId.toString()) {
            req.flash('error', 'Unauthorized action');
            return res.redirect('back');
        }

        // Update bid status to won
        bid.status = 'won';
        bid.isSelected = true;
        await bid.save();

        // Update other bids for this project to lost
        await Bid.updateMany(
            { 
                project: bid.project._id, 
                _id: { $ne: bidId },
                status: 'submitted'
            },
            { status: 'lost' }
        );

        // Update project with selected bid and change status
        const project = await Project.findById(bid.project._id);
        project.selectedBid = bidId;
        project.status = 'in-progress';
        await project.save();

        req.flash('success', `Bid selected successfully! ${bid.seller.companyName || bid.seller.name} has been awarded the project.`);
        res.redirect(`/customer/project/${bid.project._id}`);
    } catch (error) {
        console.error('Bid selection error:', error);
        req.flash('error', 'Error selecting bid');
        res.redirect('back');
    }
};

// Project Editing
exports.editProject = async (req, res) => {
    try {
        const project = await Project.findById(req.params.id);
        
        if (!project) {
            req.flash('error', 'Project not found');
            return res.redirect('/customer/my-projects');
        }

        if (project.customer.toString() !== req.session.userId.toString()) {
            req.flash('error', 'Unauthorized access');
            return res.redirect('/customer/my-projects');
        }

        if (project.status !== 'drafted') {
            req.flash('error', 'Only drafted projects can be edited');
            return res.redirect('/customer/my-projects');
        }

        const userData = req.session.user || { name: 'Customer', email: '' };

        res.render('customer/project-edit', {
            user: userData,
            currentPage: 'projects',
            project,
            category: project.category
        });
    } catch (error) {
        console.error('Edit project error:', error);
        req.flash('error', 'Error loading project for editing');
        res.redirect('/customer/my-projects');
    }
};

exports.updateProject = async (req, res) => {
    try {
        const project = await Project.findById(req.params.id);
        
        if (!project) {
            req.flash('error', 'Project not found');
            return res.redirect('/customer/my-projects');
        }

        if (project.customer.toString() !== req.session.userId.toString()) {
            req.flash('error', 'Unauthorized access');
            return res.redirect('/customer/my-projects');
        }

        if (project.status !== 'drafted') {
            req.flash('error', 'Only drafted projects can be edited');
            return res.redirect('/customer/my-projects');
        }

        // Process new images if any
        const newImages = req.files?.images || [];
        const processedImages = newImages.map(file => ({
            public_id: file.filename,
            url: file.path,
            filename: file.originalname,
            format: file.format,
            bytes: file.size,
            width: file.width,
            height: file.height
        }));

        const updateData = {
            title: req.body.title,
            description: req.body.description,
            requirements: req.body.requirements,
            'location.address': req.body.address,
            'location.city': req.body.city,
            'location.state': req.body.state,
            'location.zipCode': req.body.zipCode,
            'contact.phone': req.body.phone,
            specifications: req.body.specifications || {}
        };

        // Add new images to existing ones
        if (processedImages.length > 0) {
            updateData.$push = { images: { $each: processedImages } };
        }

        await Project.findByIdAndUpdate(req.params.id, updateData);

        req.flash('success', 'Project updated successfully!');
        res.redirect('/customer/my-projects');
    } catch (error) {
        console.error('Update project error:', error);
        req.flash('error', 'Error updating project');
        res.redirect('back');
    }
};

exports.deleteProject = async (req, res) => {
    try {
        const project = await Project.findById(req.params.id);
        
        if (!project) {
            req.flash('error', 'Project not found');
            return res.redirect('/customer/my-projects');
        }

        if (project.customer.toString() !== req.session.userId.toString()) {
            req.flash('error', 'Unauthorized access');
            return res.redirect('/customer/my-projects');
        }

        if (project.status !== 'drafted') {
            req.flash('error', 'Only drafted projects can be deleted');
            return res.redirect('/customer/my-projects');
        }

        // Delete images from Cloudinary
        if (project.images && project.images.length > 0) {
            for (const image of project.images) {
                try {
                    await cloudinary.uploader.destroy(image.public_id);
                } catch (error) {
                    console.error('Error deleting image from Cloudinary:', error);
                }
            }
        }

        // Delete documents from Cloudinary
        if (project.documents && project.documents.length > 0) {
            for (const document of project.documents) {
                try {
                    await cloudinary.uploader.destroy(document.public_id);
                } catch (error) {
                    console.error('Error deleting document from Cloudinary:', error);
                }
            }
        }

        // Delete associated bids and their attachments
        const bids = await Bid.find({ project: req.params.id });
        for (const bid of bids) {
            // Delete bid attachments from Cloudinary
            if (bid.attachments && bid.attachments.length > 0) {
                for (const attachment of bid.attachments) {
                    try {
                        await cloudinary.uploader.destroy(attachment.public_id);
                    } catch (error) {
                        console.error('Error deleting bid attachment from Cloudinary:', error);
                    }
                }
            }
            await Bid.findByIdAndDelete(bid._id);
        }

        // Delete any associated contracts
        await Contract.deleteMany({ project: req.params.id });

        // Delete project
        await Project.findByIdAndDelete(req.params.id);

        req.flash('success', 'Project and all associated files deleted successfully!');
        res.redirect('/customer/my-projects');
    } catch (error) {
        console.error('Delete project error:', error);
        req.flash('error', 'Error deleting project');
        res.redirect('/customer/my-projects');
    }
};

// Add Image to Project
exports.addProjectImage = async (req, res) => {
    try {
        const { projectId } = req.params;
        
        if (!req.file) {
            req.flash('error', 'Please select an image to upload');
            return res.redirect('back');
        }

        const project = await Project.findById(projectId);
        
        if (!project || project.customer.toString() !== req.session.userId.toString()) {
            req.flash('error', 'Project not found or unauthorized');
            return res.redirect('back');
        }

        if (project.status !== 'drafted') {
            req.flash('error', 'Only drafted projects can be modified');
            return res.redirect('back');
        }

        const imageData = {
            public_id: req.file.filename,
            url: req.file.path,
            filename: req.file.originalname,
            format: req.file.format,
            bytes: req.file.size,
            width: req.file.width,
            height: req.file.height
        };

        await project.addImage(imageData);

        req.flash('success', 'Image added successfully!');
        res.redirect(`/customer/project/${projectId}`);
    } catch (error) {
        console.error('Add project image error:', error);
        req.flash('error', 'Error adding image: ' + error.message);
        res.redirect('back');
    }
};

// Remove Image from Project
exports.removeProjectImage = async (req, res) => {
    try {
        const { projectId, publicId } = req.params;
        
        const project = await Project.findById(projectId);
        
        if (!project || project.customer.toString() !== req.session.userId.toString()) {
            req.flash('error', 'Project not found or unauthorized');
            return res.redirect('back');
        }

        if (project.status !== 'drafted') {
            req.flash('error', 'Only drafted projects can be modified');
            return res.redirect('back');
        }

        // Delete from Cloudinary
        await cloudinary.uploader.destroy(publicId);
        
        // Remove from database
        await project.removeImage(publicId);

        req.flash('success', 'Image removed successfully!');
        res.redirect(`/customer/project/${projectId}`);
    } catch (error) {
        console.error('Remove project image error:', error);
        req.flash('error', 'Error removing image: ' + error.message);
        res.redirect('back');
    }
};

// Remove Document from Project
exports.removeProjectDocument = async (req, res) => {
    try {
        const { projectId, publicId } = req.params;
        
        const project = await Project.findById(projectId);
        
        if (!project || project.customer.toString() !== req.session.userId.toString()) {
            req.flash('error', 'Project not found or unauthorized');
            return res.redirect('back');
        }

        if (project.status !== 'drafted') {
            req.flash('error', 'Only drafted projects can be modified');
            return res.redirect('back');
        }

        // Delete from Cloudinary
        await cloudinary.uploader.destroy(publicId);
        
        // Remove from database
        project.documents = project.documents.filter(doc => doc.public_id !== publicId);
        await project.save();

        req.flash('success', 'Document removed successfully!');
        res.redirect(`/customer/project/${projectId}`);
    } catch (error) {
        console.error('Remove project document error:', error);
        req.flash('error', 'Error removing document: ' + error.message);
        res.redirect('back');
    }
};
// In customerController.js - Enhance uploadCustomerContract function

exports.downloadContract = async (req, res) => {
    try {
        const { bidId } = req.params;
        
        const bid = await Bid.findById(bidId)
            .populate('project')
            .populate('seller')
            .populate('customer');

        if (!bid) {
            req.flash('error', 'Bid not found');
            return res.redirect('back');
        }

        // Check if contract already exists and has final version
        const existingContract = await Contract.findOne({ bid: bidId });
        
        if (existingContract && existingContract.finalContract?.url) {
            return res.redirect(existingContract.finalContract.url);
        }

        if (existingContract && existingContract.customerSignedContract?.url) {
            return res.redirect(existingContract.customerSignedContract.url);
        }

        // Generate contract template
        const contractContent = this.generateContractTemplate(bid);
        
        // Set response headers for download
        res.setHeader('Content-Type', 'text/plain');
        res.setHeader('Content-Disposition', `attachment; filename=contract-${bidId}.txt`);
        res.send(contractContent);
        
    } catch (error) {
        console.error('Contract download error:', error);
        req.flash('error', 'Error generating contract');
        res.redirect('back');
    }
};
// Fix the uploadCustomerContract method
// FIXED: Update the uploadCustomerContract method
exports.uploadCustomerContract = async (req, res) => {
    try {
        const { bidId } = req.body;
        const customerId = req.session.userId;

        console.log('=== UPLOAD CUSTOMER CONTRACT DEBUG ===');
        console.log('Raw bidId from request:', bidId);
        console.log('Customer ID:', customerId);
        console.log('File received:', req.file);

        if (!req.file) {
            req.flash('error', 'Please select a signed contract file');
            return res.redirect('back');
        }

        // ✅ FIX: Validate and extract proper bidId
        let actualBidId = bidId;
        
        // Check if bidId is actually a full bid object (stringified)
        if (typeof bidId === 'string' && bidId.includes('ObjectId')) {
            console.log('⚠️ Detected stringified bid object, extracting _id...');
            
            // Extract the ObjectId from the string
            const match = bidId.match(/ObjectId\("([a-f0-9]+)"\)/);
            if (match && match[1]) {
                actualBidId = match[1];
                console.log('✅ Extracted bidId:', actualBidId);
            } else {
                throw new Error('Invalid bidId format');
            }
        }

        // Validate that actualBidId is a valid MongoDB ObjectId
        if (!mongoose.Types.ObjectId.isValid(actualBidId)) {
            console.error('❌ Invalid bidId:', actualBidId);
            req.flash('error', 'Invalid bid identifier');
            return res.redirect('/customer/my-projects');
        }

        console.log('🔍 Searching for bid with ID:', actualBidId);

        const bid = await Bid.findOne({ _id: actualBidId }).populate('project');
        if (!bid) {
            console.error('❌ Bid not found with ID:', actualBidId);
            req.flash('error', 'Bid not found');
            return res.redirect('/customer/my-projects');
        }

        // Check if customer owns the project
        if (bid.project.customer.toString() !== customerId) {
            req.flash('error', 'Unauthorized access');
            return res.redirect('/customer/my-projects');
        }

        const contract = await Contract.findOne({ bid: actualBidId });
        if (!contract) {
            req.flash('error', 'Contract not found');
            return res.redirect('/customer/my-projects');
        }

        if (contract.status !== 'pending-customer') {
            req.flash('error', 'Cannot upload contract at this stage');
            return res.redirect('/customer/my-projects');
        }

        // Update contract with signed document
        contract.customerSignedContract = {
            public_id: req.file.filename,
            url: req.file.path,
            filename: req.file.originalname,
            bytes: req.file.size,
            uploadedAt: new Date(),
            signatureDate: new Date(),
            uploadedBy: 'customer'
        };

        // Move to next step
        contract.status = 'pending-seller';
        contract.currentStep = 2;
        contract.updatedAt = new Date();
        
        await contract.save();

        console.log('✅ Customer contract uploaded successfully');

        // Notify seller
        const Notice = require('../models/Notice');
        await Notice.create({
            title: `Customer Contract Uploaded - ${bid.project.title}`,
            content: 'Customer has uploaded their signed contract. You can now download the template and upload your signed contract.',
            targetAudience: 'seller',
            specificUser: bid.seller,
            noticeType: 'info',
            isActive: true,
            startDate: new Date(),
            endDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
        });

        req.flash('success', 'Contract uploaded successfully! Seller will now upload their contract.');
        res.redirect(`/customer/project/${bid.project._id}`);
    } catch (error) {
        console.error('❌ Upload customer contract error:', error);
        req.flash('error', 'Error uploading contract: ' + error.message);
        res.redirect('back');
    }
};

exports.generateContractTemplate = (bid) => {
    // Add null checks for timeline
    const timelineText = bid.timeline && bid.timeline.startDate && bid.timeline.endDate 
        ? `${new Date(bid.timeline.startDate).toDateString()} to ${new Date(bid.timeline.endDate).toDateString()}`
        : 'To be determined';

    return `
CONTRACT AGREEMENT

This Agreement is made on ${new Date().toDateString()} between:

Customer: ${bid.customer?.name || 'Customer'}
Email: ${bid.customer?.email || 'N/A'}

AND

Service Provider: ${bid.seller?.companyName || bid.seller?.name || 'Service Provider'}
Email: ${bid.seller?.email || 'N/A'}

PROJECT: ${bid.project?.title || 'Project'}
AGREED AMOUNT: $${bid.amount || '0'}
TIMELINE: ${timelineText}

Terms and Conditions:
1. The Service Provider agrees to complete the work as described in the project requirements.
2. The Customer agrees to make payments as scheduled.
3. Both parties agree to resolve disputes through mediation.
4. This contract is binding upon both parties.

Signatures:

_________________________
Customer Signature

_________________________
Service Provider Signature

Date: ___________________
    `;
};

// View Contract
exports.viewContract = async (req, res) => {
    try {
        const { projectId } = req.params;
        
        const contract = await Contract.findOne({ project: projectId })
            .populate('customer', 'name email')
            .populate('seller', 'name companyName email')
            .populate('project', 'title description requirements')
            .populate('bid', 'amount proposal timeline');

        if (!contract) {
            req.flash('error', 'Contract not found');
            return res.redirect(`/customer/project/${projectId}`);
        }

        const userData = req.session.user || { name: 'Customer', email: '' };

        res.render('/customer/contract-view', {
            user: userData,
            currentPage: 'projects',
            contract,
            moment: require('moment')
        });
    } catch (error) {
        console.error('View contract error:', error);
        req.flash('error', 'Error loading contract');
        res.redirect('back');
    }
};

// Download Certificate - NEW
exports.downloadCertificate = async (req, res) => {
    try {
        const { bidId } = req.params;
        const customerId = req.session.userId;

        const bid = await Bid.findOne({ _id: bidId, customer: customerId });
        if (!bid) {
            req.flash('error', 'Bid not found');
            return res.redirect('/customer/my-projects');
        }

        if (!bid.certificateGenerated || !bid.certificateUrl) {
            req.flash('error', 'Certificate not yet generated');
            return res.redirect('/customer/my-projects');
        }

        // Redirect to certificate URL
        res.redirect(bid.certificateUrl);
    } catch (error) {
        console.error('Download certificate error:', error);
        req.flash('error', 'Error downloading certificate: ' + error.message);
        res.redirect('/customer/my-projects');
    }
};





exports.downloadFinalCertificate = async (req, res) => {
    try {
        const { bidId } = req.params;
        const customerId = req.session.userId;

        console.log('📥 Download final certificate request:', { bidId, customerId });

        const bid = await Bid.findOne({ _id: bidId }).populate('project');
        if (!bid || bid.project.customer.toString() !== customerId) {
            req.flash('error', 'Unauthorized access');
            return res.redirect('/customer/my-projects');
        }

        const contract = await Contract.findOne({ bid: bidId });
        if (!contract || contract.status !== 'completed') {
            req.flash('error', 'Certificate not available yet');
            return res.redirect('/customer/my-projects');
        }

        // Check for customer certificate first, then final contract
        if (contract.customerCertificate && contract.customerCertificate.url) {
            console.log('✅ Redirecting to customer certificate:', contract.customerCertificate.url);
            res.redirect(contract.customerCertificate.url);
        } else if (contract.finalContract && contract.finalContract.url) {
            console.log('✅ Redirecting to final contract:', contract.finalContract.url);
            res.redirect(contract.finalContract.url);
        } else {
            req.flash('error', 'Certificate not generated yet');
            res.redirect('/customer/my-projects');
        }
    } catch (error) {
        console.error('❌ Download certificate error:', error);
        req.flash('error', 'Error downloading certificate');
        res.redirect('/customer/my-projects');
    }
};
// Update Profile Information
exports.updateProfile = async (req, res) => {
    try {
        const { name, phone, address, city, state, zipCode, bio } = req.body;
        
        const user = await User.findById(req.session.userId);
        
        if (!user) {
            req.flash('error', 'User not found');
            return res.redirect('/customer/profile');
        }

        user.name = name;
        user.phone = phone;
        user.bio = bio;
        user.address = {
            street: address,
            city: city,
            state: state,
            zipCode: zipCode
        };

        await user.save();

        // Update session
        req.session.user.name = user.name;
        req.session.user.phone = user.phone;

        req.flash('success', 'Profile updated successfully!');
        res.redirect('/customer/profile');
    } catch (error) {
        console.error('Update profile error:', error);
        req.flash('error', 'Error updating profile: ' + error.message);
        res.redirect('/customer/profile');
    }
};

// Change Password
exports.changePassword = async (req, res) => {
    try {
        const { currentPassword, newPassword, confirmPassword } = req.body;
        
        if (newPassword !== confirmPassword) {
            req.flash('error', 'New passwords do not match');
            return res.redirect('/customer/profile');
        }

        if (newPassword.length < 6) {
            req.flash('error', 'Password must be at least 6 characters long');
            return res.redirect('/customer/profile');
        }

        const user = await User.findById(req.session.userId);
        
        if (!user) {
            req.flash('error', 'User not found');
            return res.redirect('/customer/profile');
        }

        // Verify current password
        const isCurrentPasswordValid = await user.comparePassword(currentPassword);
        if (!isCurrentPasswordValid) {
            req.flash('error', 'Current password is incorrect');
            return res.redirect('/customer/profile');
        }

        // Update password
        user.password = newPassword;
        await user.save();

        req.flash('success', 'Password changed successfully!');
        res.redirect('/customer/profile');
    } catch (error) {
        console.error('Change password error:', error);
        req.flash('error', 'Error changing password: ' + error.message);
        res.redirect('/customer/profile');
    }
};






// NEW: Enhanced download method with proper Cloudinary handling
// exports.downloadContractTemplate = async (req, res) => {
//     try {
//         const { bidId } = req.params;
//         const customerId = req.session.userId;

//         console.log('📥 Download contract template request:', { bidId, customerId });

//         const bid = await Bid.findOne({ _id: bidId }).populate('project');
//         if (!bid || bid.project.customer.toString() !== customerId) {
//             req.flash('error', 'Unauthorized access');
//             return res.redirect('/customer/my-projects');
//         }

//         const contract = await Contract.findOne({ bid: bidId });
//         if (!contract) {
//             req.flash('error', 'Contract not found');
//             return res.redirect('/customer/my-projects');
//         }

//         if (!contract.customerTemplate || !contract.customerTemplate.url) {
//             req.flash('error', 'Contract template not available yet');
//             return res.redirect('/customer/my-projects');
//         }

//         console.log('🔗 Cloudinary URL:', contract.customerTemplate.url);
        
//         // ✅ FIX: Use Cloudinary download URL transformation
//         let downloadUrl = contract.customerTemplate.url;
        
//         // Transform the URL to force download
//         if (downloadUrl.includes('/upload/')) {
//             downloadUrl = downloadUrl.replace('/upload/', '/upload/fl_attachment/');
//         }
        
//         console.log('🔗 Transformed URL:', downloadUrl);
        
//         // Set proper headers for PDF download
//         res.setHeader('Content-Disposition', `attachment; filename="contract_template_${bidId}.pdf"`);
//         res.setHeader('Content-Type', 'application/pdf');
        
//         // Redirect to the transformed Cloudinary URL
//         res.redirect(downloadUrl);
        
//     } catch (error) {
//         console.error('❌ Download contract template error:', error);
//         req.flash('error', 'Error downloading contract template: ' + error.message);
//         res.redirect('/customer/my-projects');
//     }
// };




//code from chaty gpt

// const cloudinary = require('../config/cloudinary'); // adjust the path if needed

exports.downloadContractTemplate = async (req, res) => {
    try {
        const { bidId } = req.params;
        const customerId = req.session.userId;

        console.log('📥 Download contract template request:', { bidId, customerId });

        const bid = await Bid.findOne({ _id: bidId }).populate('project');
        if (!bid || bid.project.customer.toString() !== customerId) {
            req.flash('error', 'Unauthorized access');
            return res.redirect('/customer/my-projects');
        }

        const contract = await Contract.findOne({ bid: bidId });
        if (!contract) {
            req.flash('error', 'Contract not found');
            return res.redirect('/customer/my-projects');
        }

        if (!contract.customerTemplate || !contract.customerTemplate.public_id) {
            req.flash('error', 'Contract template not available yet');
            return res.redirect('/customer/my-projects');
        }

        // ✅ Generate a signed (authenticated) URL for this PDF
        const signedUrl = cloudinary.url(contract.customerTemplate.public_id, {
            resource_type: 'raw',  // PDF = raw
            type: 'authenticated', // ensures signed access
            sign_url: true,        // creates a signed link with your API secret
            transformation: [{ flags: 'attachment' }], // triggers download
        });

        console.log('🔒 Signed Cloudinary URL:', signedUrl);

        // Set headers for download
        res.setHeader('Content-Disposition', `attachment; filename="contract_template_${bidId}.pdf"`);
        res.setHeader('Content-Type', 'application/pdf');

        // Redirect to the signed Cloudinary URL
        return res.redirect(signedUrl);

    } catch (error) {
        console.error('❌ Download contract template error:', error);
        req.flash('error', 'Error downloading contract template: ' + error.message);
        res.redirect('/customer/my-projects');
    }
};


// NEW: Enhanced download seller contract
exports.downloadSellerContract = async (req, res) => {
    try {
        const { bidId } = req.params;
        const customerId = req.session.userId;

        console.log('📥 Download seller contract request:', { bidId, customerId });

        const bid = await Bid.findOne({ _id: bidId }).populate('project');
        if (!bid || bid.project.customer.toString() !== customerId) {
            req.flash('error', 'Unauthorized access');
            return res.redirect('/customer/my-projects');
        }

        const contract = await Contract.findOne({ bid: bidId });
        if (!contract || !contract.sellerSignedContract || !contract.sellerSignedContract.url) {
            req.flash('error', 'Seller contract not available yet');
            return res.redirect('/customer/my-projects');
        }

        console.log('🔗 Seller contract URL:', contract.sellerSignedContract.url);
        
        // ✅ FIX: Transform URL for download
        let downloadUrl = contract.sellerSignedContract.url;
        if (downloadUrl.includes('/upload/')) {
            downloadUrl = downloadUrl.replace('/upload/', '/upload/fl_attachment/');
        }
        
        res.setHeader('Content-Disposition', `attachment; filename="seller_contract_${bidId}.pdf"`);
        res.setHeader('Content-Type', 'application/pdf');
        res.redirect(downloadUrl);
        
    } catch (error) {
        console.error('❌ Download seller contract error:', error);
        req.flash('error', 'Error downloading seller contract');
        res.redirect('/customer/my-projects');
    }
};

module.exports = exports;