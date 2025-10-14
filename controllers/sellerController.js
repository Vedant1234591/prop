// controllers/sellerController.js
const Project = require('../models/Project');
const Bid = require('../models/Bid');
const User = require('../models/User');
const Notice = require('../models/Notice');
const Contract = require('../models/Contract');
const cloudinary = require('../config/cloudinary');
const mongoose = require('mongoose');

// Import status automation
const statusAutomation = require('../services/statusAutomation');

// Seller Dashboard - Enhanced with real-time updates
exports.getDashboard = async (req, res) => {
    try {
        const sellerId = req.session.userId;
        
        console.log('=== SELLER DASHBOARD DEBUG ===');
        console.log('Seller ID:', sellerId);
        
        if (!sellerId) {
            req.flash('error', 'Please log in to access the dashboard');
            return res.redirect('/auth/login');
        }
        
        // Force status update before showing dashboard
        await statusAutomation.updateAllProjectStatuses();

        // Get comprehensive bid statistics
        const bidStats = await Bid.aggregate([
            { $match: { seller: new mongoose.Types.ObjectId(sellerId) } },
            { 
                $group: {
                    _id: '$status',
                    count: { $sum: 1 },
                    totalAmount: { $sum: '$amount' }
                }
            }
        ]);

        console.log('Bid stats:', bidStats);

        // Convert array to object for easier access
        const stats = {
            submitted: { count: 0, amount: 0 },
            won: { count: 0, amount: 0 },
            'in-progress': { count: 0, amount: 0 },
            lost: { count: 0, amount: 0 },
            completed: { count: 0, amount: 0 }
        };

        bidStats.forEach(stat => {
            if (stats[stat._id]) {
                stats[stat._id].count = stat.count;
                stats[stat._id].amount = stat.totalAmount || 0;
            }
        });

        // Calculate total stats
        const totalBids = bidStats.reduce((sum, stat) => sum + stat.count, 0);
        const totalStats = {
            totalBids: totalBids,
            totalAmount: bidStats.reduce((sum, stat) => sum + (stat.totalAmount || 0), 0),
            successRate: stats.won.count > 0 ? Math.round((stats.won.count / (stats.submitted.count || 1)) * 100) : 0
        };

        // Get active projects for bidding
        const activeProjects = await Project.find({
            status: { $in: ['drafted', 'in-progress'] },
            'bidSettings.bidEndDate': { $gt: new Date() },
            'bidSettings.isActive': true
        })
        .populate('customer', 'name companyName')
        .sort({ createdAt: -1 })
        .limit(5);

        // Get seller's latest bids with real-time status
        const latestBids = await Bid.find({ seller: sellerId })
            .populate('project', 'title category status bidSettings')
            .sort({ createdAt: -1 })
            .limit(5);

        // Get won bids with pending contracts
        const wonBidsWithContracts = await Bid.find({ 
            seller: sellerId, 
            status: 'won' 
        })
        .populate('project', 'title category')
        .populate('customer', 'name email');

        const pendingContracts = [];
        for (const bid of wonBidsWithContracts) {
            const contract = await Contract.findOne({ 
                bid: bid._id,
                status: { $in: ['pending-seller', 'pending-admin'] }
            });
            if (contract) {
                pendingContracts.push({
                    bid: bid,
                    contract: contract
                });
            }
        }

        // Get latest notices for seller
        const latestNotices = await Notice.find({
            $or: [
                { targetAudience: 'all' },
                { targetAudience: 'seller' }
            ],
            isActive: true,
            startDate: { $lte: new Date() },
            $or: [
                { endDate: { $gte: new Date() } },
                { endDate: null }
            ]
        })
        .sort({ createdAt: -1 })
        .limit(3);

        const userData = req.session.user || { name: 'Seller', email: '' };

        // Get bid count for notifications
        const bidCount = await Bid.countDocuments({ 
            seller: sellerId,
            status: 'submitted'
        });

        res.render('seller/dashboard', {
            user: userData,
            currentPage: 'dashboard',
            stats: stats,
            totalStats: totalStats,
            activeProjects: activeProjects || [],
            latestBids: latestBids || [],
            latestNotices: latestNotices || [],
            pendingContracts: pendingContracts || [],
            bidCount: bidCount,
            moment: require('moment')
        });
    } catch (error) {
        console.error('Seller dashboard error:', error);
        req.flash('error', 'Error loading dashboard: ' + error.message);
        res.redirect('/auth/login');
    }
};

// Find Bids/Projects - Enhanced with real-time updates
exports.getFindBids = async (req, res) => {
    try {
        const sellerId = req.session.userId;
        
        if (!sellerId) {
            req.flash('error', 'Please log in to view projects');
            return res.redirect('/auth/login');
        }
        
        const { state, city, category } = req.query;
        const filters = {};
        
        if (state) filters['location.state'] = new RegExp(state, 'i');
        if (city) filters['location.city'] = new RegExp(city, 'i');
        if (category) filters.category = category;

        // Force status update before showing projects
        await statusAutomation.updateAllProjectStatuses();

        const activeProjects = await Project.find({
            ...filters,
            status: { $in: ['drafted', 'in-progress'] },
            'bidSettings.bidEndDate': { $gt: new Date() },
            'bidSettings.isActive': true
        })
        .populate('customer', 'name companyName')
        .populate('bids')
        .sort({ createdAt: -1 });

        const userData = req.session.user || { name: 'Seller', email: '' };

        // Get bid count for notifications
        const bidCount = await Bid.countDocuments({ 
            seller: sellerId,
            status: 'submitted'
        });

        res.render('seller/find-bids', {
            user: userData,
            currentPage: 'find-bids',
            projects: activeProjects || [],
            filters: { state, city, category },
            bidCount: bidCount,
            moment: require('moment')
        });
    } catch (error) {
        console.error('Find bids error:', error);
        req.flash('error', 'Error loading projects: ' + error.message);
        res.redirect('/seller/dashboard');
    }
};

// Bid Details - Enhanced with real-time updates
exports.getBidDetails = async (req, res) => {
    try {
        const projectId = req.params.id;
        const sellerId = req.session.userId;
        
        console.log('=== BID DETAILS DEBUG ===');
        console.log('Project ID:', projectId);
        console.log('Seller ID:', sellerId);
        
        if (!sellerId) {
            req.flash('error', 'Please log in to view project details');
            return res.redirect('/auth/login');
        }
        
        await statusAutomation.updateAllProjectStatuses();

        const project = await Project.findById(projectId)
            .populate('customer', 'name email phone companyName')
            .populate('bids');
        
        if (!project) {
            req.flash('error', 'Project not found');
            return res.redirect('/seller/find-bids');
        }

        // Check if seller already bid on this project
        const existingBid = await Bid.findOne({
            project: projectId,
            seller: sellerId
        });

        const userData = req.session.user || { name: 'Seller', email: '' };

        // Get bid count for notifications
        const bidCount = await Bid.countDocuments({ 
            seller: sellerId,
            status: 'submitted'
        });

        res.render('seller/bid-details', {
            user: userData,
            currentPage: 'find-bids',
            project: project,
            existingBid: existingBid,
            bidCount: bidCount,
            moment: require('moment')
        });
    } catch (error) {
        console.error('Bid details error:', error);
        req.flash('error', 'Error loading project details: ' + error.message);
        res.redirect('/seller/find-bids');
    }
};

// Apply for Bid - COMPLETELY REWRITTEN
exports.postApplyBid = async (req, res) => {
    try {
        const projectId = req.params.id;
        const sellerId = req.session.userId;
        
        console.log('=== APPLY BID DEBUG ===');
        console.log('Project ID:', projectId);
        console.log('Seller ID:', sellerId);
        console.log('Request body:', req.body);
        
        // Check authentication
        if (!sellerId) {
            req.flash('error', 'Please log in to submit a bid');
            return res.redirect('/auth/login');
        }
        
        // Basic validation
        if (!req.body.amount || !req.body.proposal) {
            req.flash('error', 'Bid amount and proposal are required');
            return res.redirect(`/seller/bid-details/${projectId}`);
        }

        // Get project
        const project = await Project.findById(projectId);
        if (!project) {
            req.flash('error', 'Project not found');
            return res.redirect('/seller/find-bids');
        }

        // Check if bidding is open
        const now = new Date();
        const bidEndDate = new Date(project.bidSettings.bidEndDate);
        
        if (!project.bidSettings.isActive || now > bidEndDate) {
            req.flash('error', 'Bidding for this project has closed');
            return res.redirect('/seller/find-bids');
        }

        // Check for existing bid
        const existingBid = await Bid.findOne({
            project: projectId,
            seller: sellerId
        });

        if (existingBid) {
            req.flash('error', 'You have already submitted a bid for this project');
            return res.redirect(`/seller/bid-details/${projectId}`);
        }

        // Validate amount
        const bidAmount = parseFloat(req.body.amount);
        if (isNaN(bidAmount) || bidAmount < project.bidSettings.startingBid) {
            req.flash('error', `Bid amount must be a number and at least $${project.bidSettings.startingBid}`);
            return res.redirect(`/seller/bid-details/${projectId}`);
        }

        // Validate proposal length
        if (req.body.proposal.trim().length < 10) {
            req.flash('error', 'Proposal must be at least 10 characters long');
            return res.redirect(`/seller/bid-details/${projectId}`);
        }

        // Create bid
        const bidData = {
            project: projectId,
            seller: sellerId,
            customer: project.customer,
            amount: bidAmount,
            proposal: req.body.proposal.trim(),
            status: 'submitted',
            createdAt: new Date(),
            updatedAt: new Date()
        };

        console.log('Creating bid:', bidData);

        const bid = await Bid.create(bidData);

        // Add to project
        project.bids.push(bid._id);
        await project.save();

        console.log('✅ Bid created successfully:', bid._id);

        req.flash('success', 'Bid submitted successfully!');
        res.redirect('/seller/my-bids');
        
    } catch (error) {
        console.error('❌ Apply bid error:', error);
        req.flash('error', 'Error submitting bid: ' + error.message);
        res.redirect(`/seller/bid-details/${req.params.id}`);
    }
};

// In sellerController.js - update getMyBids function
exports.getMyBids = async (req, res) => {
    try {
        const sellerId = req.session.userId;
        
        if (!sellerId) {
            req.flash('error', 'Please log in to view your bids');
            return res.redirect('/auth/login');
        }
        
        // Force status update before showing bids
        await statusAutomation.updateAllProjectStatuses();

        const myBids = await Bid.find({ seller: sellerId })
            .populate('project', 'title category description location bidSettings timeline status progress')
            .populate('customer', 'name email phone')
            .sort({ createdAt: -1 });

        // Group bids by status
        const bidsByStatus = {
            submitted: myBids.filter(bid => bid.status === 'submitted'),
            won: myBids.filter(bid => bid.status === 'won'),
            'in-progress': myBids.filter(bid => bid.status === 'in-progress'),
            lost: myBids.filter(bid => bid.status === 'lost'),
            completed: myBids.filter(bid => bid.status === 'completed')
        };

        // Get contracts for won bids
        const wonBidIds = bidsByStatus.won.map(bid => bid._id);
        const contracts = await Contract.find({ bid: { $in: wonBidIds } });

        // Add contract info to won bids
        bidsByStatus.won.forEach(bid => {
            const contract = contracts.find(contract => contract.bid.toString() === bid._id.toString());
            if (contract) {
                bid.contract = contract;
            }
        });

        const userData = req.session.user || { name: 'Seller', email: '' };

        // Get bid count for notifications
        const bidCount = await Bid.countDocuments({ 
            seller: sellerId,
            status: 'submitted'
        });

        res.render('seller/my-bids', {
            user: userData,
            currentPage: 'my-bids',
            bids: bidsByStatus,
            bidCount: bidCount,
            moment: require('moment')
        });
    } catch (error) {
        console.error('My bids error:', error);
        req.flash('error', 'Error loading bids: ' + error.message);
        res.redirect('/seller/dashboard');
    }
};
// Update Bid
exports.updateBid = async (req, res) => {
    try {
        const bidId = req.params.id;
        const sellerId = req.session.userId;
        
        if (!sellerId) {
            req.flash('error', 'Please log in to update bid');
            return res.redirect('/auth/login');
        }
        
        const bid = await Bid.findOne({ _id: bidId, seller: sellerId });
        
        if (!bid) {
            req.flash('error', 'Bid not found');
            return res.redirect('/seller/my-bids');
        }

        if (bid.status !== 'submitted') {
            req.flash('error', 'Only submitted bids can be updated');
            return res.redirect('/seller/my-bids');
        }

        // Check if project is still accepting bids
        const project = await Project.findById(bid.project);
        if (!project.bidSettings.isActive || new Date() > project.bidSettings.bidEndDate) {
            req.flash('error', 'Bidding for this project has closed');
            return res.redirect('/seller/my-bids');
        }

        // Validate amount
        const bidAmount = parseFloat(req.body.amount);
        if (isNaN(bidAmount) || bidAmount < project.bidSettings.startingBid) {
            req.flash('error', `Bid amount must be a number and at least $${project.bidSettings.startingBid}`);
            return res.redirect('/seller/my-bids');
        }

        // Validate proposal
        if (!req.body.proposal || req.body.proposal.trim().length < 10) {
            req.flash('error', 'Proposal must be at least 10 characters long');
            return res.redirect('/seller/my-bids');
        }

        bid.amount = bidAmount;
        bid.proposal = req.body.proposal.trim();
        bid.revisionCount += 1;
        bid.lastRevisedAt = new Date();
        bid.updatedAt = new Date();

        await bid.save();

        req.flash('success', 'Bid updated successfully!');
        res.redirect('/seller/my-bids');
    } catch (error) {
        console.error('Update bid error:', error);
        req.flash('error', 'Error updating bid: ' + error.message);
        res.redirect('/seller/my-bids');
    }
};

// Withdraw Bid
exports.withdrawBid = async (req, res) => {
    try {
        const bidId = req.params.id;
        const sellerId = req.session.userId;
        
        if (!sellerId) {
            req.flash('error', 'Please log in to withdraw bid');
            return res.redirect('/auth/login');
        }
        
        const bid = await Bid.findOne({ _id: bidId, seller: sellerId });
        
        if (!bid) {
            req.flash('error', 'Bid not found');
            return res.redirect('/seller/my-bids');
        }

        if (bid.status !== 'submitted') {
            req.flash('error', 'Only submitted bids can be withdrawn');
            return res.redirect('/seller/my-bids');
        }

        // Check if project is still accepting bids
        const project = await Project.findById(bid.project);
        if (!project.bidSettings.isActive || new Date() > project.bidSettings.bidEndDate) {
            req.flash('error', 'Bidding for this project has closed');
            return res.redirect('/seller/my-bids');
        }

        bid.status = 'cancelled';
        bid.updatedAt = new Date();
        await bid.save();

        // Remove bid reference from project
        await Project.findByIdAndUpdate(bid.project, {
            $pull: { bids: bidId }
        });

        req.flash('success', 'Bid withdrawn successfully!');
        res.redirect('/seller/my-bids');
    } catch (error) {
        console.error('Withdraw bid error:', error);
        req.flash('error', 'Error withdrawing bid: ' + error.message);
        res.redirect('/seller/my-bids');
    }
};

// Seller Profile
exports.getProfile = async (req, res) => {
    try {
        const sellerId = req.session.userId;
        
        if (!sellerId) {
            req.flash('error', 'Please log in to view profile');
            return res.redirect('/auth/login');
        }
        
        const user = await User.findById(sellerId);
        
        if (!user) {
            req.flash('error', 'User not found');
            return res.redirect('/seller/dashboard');
        }

        const userData = req.session.user || { name: 'Seller', email: '' };

        // Get bid count for notifications
        const bidCount = await Bid.countDocuments({ 
            seller: sellerId,
            status: 'submitted'
        });

        res.render('seller/profile', {
            user: userData,
            currentPage: 'profile',
            profile: user,
            bidCount: bidCount
        });
    } catch (error) {
        console.error('Seller profile error:', error);
        req.flash('error', 'Error loading profile: ' + error.message);
        res.redirect('/seller/dashboard');
    }
};

// Update Profile
exports.updateProfile = async (req, res) => {
    try {
        const sellerId = req.session.userId;
        
        if (!sellerId) {
            req.flash('error', 'Please log in to update profile');
            return res.redirect('/auth/login');
        }
        
        const { name, phone, companyName, bio, yearsOfExperience, specialization } = req.body;
        
        const user = await User.findById(sellerId);
        if (!user) {
            req.flash('error', 'User not found');
            return res.redirect('/seller/profile');
        }

        user.name = name;
        user.phone = phone;
        user.companyName = companyName;
        user.bio = bio;
        user.yearsOfExperience = yearsOfExperience;
        
        // Handle specialization as array
        if (specialization) {
            user.specialization = Array.isArray(specialization) 
                ? specialization 
                : specialization.split(',').map(s => s.trim());
        }

        await user.save();

        // Update session user data
        req.session.user.name = name;
        if (companyName) req.session.user.companyName = companyName;

        req.flash('success', 'Profile updated successfully!');
        res.redirect('/seller/profile');
    } catch (error) {
        console.error('Update profile error:', error);
        req.flash('error', 'Error updating profile: ' + error.message);
        res.redirect('/seller/profile');
    }
};

// Update Profile Image
// In sellerController.js - update the file upload functions

// Update Profile Image - FIXED
exports.updateProfileImage = async (req, res) => {
    try {
        const sellerId = req.session.userId;
        
        if (!sellerId) {
            req.flash('error', 'Please log in to update profile image');
            return res.redirect('/auth/login');
        }
        
        console.log('=== UPDATE PROFILE IMAGE DEBUG ===');
        console.log('File received:', req.file);
        console.log('Request body:', req.body);
        
        if (!req.file) {
            req.flash('error', 'Please select an image to upload');
            return res.redirect('/seller/profile');
        }

        const user = await User.findById(sellerId);
        
        if (!user) {
            req.flash('error', 'User not found');
            return res.redirect('/seller/profile');
        }

        // Delete old profile image from Cloudinary if exists
        if (user.profileImage && user.profileImage.public_id) {
            try {
                await cloudinary.uploader.destroy(user.profileImage.public_id);
                console.log('Old profile image deleted');
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
            uploadedAt: new Date()
        };

        await user.save();

        // Update session user data
        req.session.user.profileImage = user.profileImage;

        req.flash('success', 'Profile image updated successfully!');
        res.redirect('/seller/profile');
    } catch (error) {
        console.error('Update profile image error:', error);
        req.flash('error', 'Error updating profile image: ' + error.message);
        res.redirect('/seller/profile');
    }
};

// Upload Company Document - FIXED
exports.uploadCompanyDocument = async (req, res) => {
    try {
        const sellerId = req.session.userId;
        
        if (!sellerId) {
            req.flash('error', 'Please log in to upload documents');
            return res.redirect('/auth/login');
        }
        
        console.log('=== UPLOAD COMPANY DOCUMENT DEBUG ===');
        console.log('File received:', req.file);
        console.log('Request body:', req.body);
        
        if (!req.file) {
            req.flash('error', 'Please select a document to upload');
            return res.redirect('/seller/profile');
        }

        const user = await User.findById(sellerId);
        if (!user) {
            req.flash('error', 'User not found');
            return res.redirect('/seller/profile');
        }

        const documentData = {
            public_id: req.file.filename,
            url: req.file.path,
            filename: req.file.originalname,
            documentType: req.body.documentType || 'other',
            bytes: req.file.size,
            uploadedAt: new Date()
        };

        // Initialize companyDocuments array if it doesn't exist
        if (!user.companyDocuments) {
            user.companyDocuments = [];
        }

        user.companyDocuments.push(documentData);
        await user.save();

        req.flash('success', 'Document uploaded successfully!');
        res.redirect('/seller/profile');
    } catch (error) {
        console.error('Upload document error:', error);
        req.flash('error', 'Error uploading document: ' + error.message);
        res.redirect('/seller/profile');
    }
};

// Upload Contract - FIXED
// In sellerController.js - Update uploadContract function
exports.uploadContract = async (req, res) => {
    try {
        const sellerId = req.session.userId;
        const { bidId } = req.body;
        
        console.log('=== SELLER CONTRACT UPLOAD DEBUG ===');
        console.log('Bid ID:', bidId);
        console.log('Seller ID:', sellerId);
        console.log('File received:', req.file);
        
        if (!req.file) {
            req.flash('error', 'Please select a contract file to upload');
            return res.redirect('/seller/my-bids');
        }

        if (!sellerId) {
            req.flash('error', 'Please log in to upload contract');
            return res.redirect('/auth/login');
        }

        // Verify bid exists and belongs to seller
        const bid = await Bid.findOne({ _id: bidId, seller: sellerId });
        if (!bid) {
            req.flash('error', 'Bid not found or unauthorized');
            return res.redirect('/seller/my-bids');
        }

        if (bid.status !== 'won') {
            req.flash('error', 'Only won bids can upload contracts');
            return res.redirect('/seller/my-bids');
        }

        // Check contract status - customer must upload first
        const contract = await Contract.findOne({ bid: bidId });
        if (!contract) {
            req.flash('error', 'Contract record not found. Please wait for customer to initiate the contract process.');
            return res.redirect('/seller/my-bids');
        }

        // CRITICAL: Check if customer has uploaded their contract first
        if (!contract.customerSignedContract || !contract.customerSignedContract.url) {
            req.flash('error', 'Please wait for customer to upload their signed contract first');
            return res.redirect('/seller/my-bids');
        }

        // Upload seller contract
        contract.sellerSignedContract = {
            public_id: req.file.filename,
            url: req.file.path,
            filename: req.file.originalname,
            originalName: req.file.originalname,
            bytes: req.file.size,
            uploadedAt: new Date(),
            uploadedBy: 'seller',
            mimeType: req.file.mimetype,
            signatureDate: new Date()
        };

        // Update contract status
        contract.status = 'pending-admin'; // Both uploaded, waiting for admin approval
        contract.updatedAt = new Date();
        await contract.save();

        // Update bid status
        bid.sellerAction = 'contract-uploaded';
        bid.updatedAt = new Date();
        await bid.save();

        console.log('✅ Seller contract uploaded successfully');

        req.flash('success', 'Contract uploaded successfully! Waiting for admin approval.');
        res.redirect('/seller/my-bids');
        
    } catch (error) {
        console.error('❌ Seller contract upload error:', error);
        req.flash('error', 'Error uploading contract: ' + error.message);
        res.redirect('/seller/my-bids');
    }
};
// Seller Notices
exports.getNotices = async (req, res) => {
    try {
        const sellerId = req.session.userId;
        
        if (!sellerId) {
            req.flash('error', 'Please log in to view notices');
            return res.redirect('/auth/login');
        }
        
        const notices = await Notice.find({
            $or: [
                { targetAudience: 'all' },
                { targetAudience: 'seller' }
            ],
            isActive: true,
            startDate: { $lte: new Date() },
            $or: [
                { endDate: { $gte: new Date() } },
                { endDate: null }
            ]
        })
        .sort({ createdAt: -1 });

        const userData = req.session.user || { name: 'Seller', email: '' };

        // Get bid count for notifications
        const bidCount = await Bid.countDocuments({ 
            seller: sellerId,
            status: 'submitted'
        });

        res.render('seller/notices', {
            user: userData,
            currentPage: 'notices',
            notices: notices || [],
            bidCount: bidCount
        });
    } catch (error) {
        console.error('Get notices error:', error);
        req.flash('error', 'Error loading notices: ' + error.message);
        res.redirect('/seller/dashboard');
    }
};

// Upload Contract

// Download Contract
exports.downloadContract = async (req, res) => {
    try {
        const { bidId } = req.params;
        const sellerId = req.session.userId;

        if (!sellerId) {
            req.flash('error', 'Please log in to download contract');
            return res.redirect('/auth/login');
        }

        const bid = await Bid.findOne({ _id: bidId, seller: sellerId });
        if (!bid) {
            req.flash('error', 'Bid not found');
            return res.redirect('/seller/my-bids');
        }

        const contract = await Contract.findOne({ bid: bidId });
        if (!contract) {
            req.flash('error', 'Contract not found');
            return res.redirect('/seller/my-bids');
        }

        // Check if seller has access to this contract
        if (!contract.sellerSignedContract || !contract.sellerSignedContract.url) {
            req.flash('error', 'Contract not available for download');
            return res.redirect('/seller/my-bids');
        }

        // Redirect to Cloudinary URL for download
        res.redirect(contract.sellerSignedContract.url);
    } catch (error) {
        console.error('Download contract error:', error);
        req.flash('error', 'Error downloading contract: ' + error.message);
        res.redirect('/seller/my-bids');
    }
};

// Download Certificate
exports.downloadCertificate = async (req, res) => {
    try {
        const { bidId } = req.params;
        const sellerId = req.session.userId;

        if (!sellerId) {
            req.flash('error', 'Please log in to download certificate');
            return res.redirect('/auth/login');
        }

        const bid = await Bid.findOne({ _id: bidId, seller: sellerId });
        if (!bid) {
            req.flash('error', 'Bid not found');
            return res.redirect('/seller/my-bids');
        }

        if (!bid.certificateGenerated || !bid.certificateUrl) {
            req.flash('error', 'Certificate not yet generated');
            return res.redirect('/seller/my-bids');
        }

        // Redirect to certificate URL
        res.redirect(bid.certificateUrl);
    } catch (error) {
        console.error('Download certificate error:', error);
        req.flash('error', 'Error downloading certificate: ' + error.message);
        res.redirect('/seller/my-bids');
    }
};

// Get bid analytics
exports.getBidAnalytics = async (req, res) => {
    try {
        const sellerId = req.session.userId;
        
        if (!sellerId) {
            req.flash('error', 'Please log in to view analytics');
            return res.redirect('/auth/login');
        }
        
        const analytics = await Bid.aggregate([
            { $match: { seller: new mongoose.Types.ObjectId(sellerId) } },
            {
                $group: {
                    _id: '$status',
                    count: { $sum: 1 },
                    totalAmount: { $sum: '$amount' },
                    avgAmount: { $avg: '$amount' }
                }
            }
        ]);

        const userData = req.session.user || { name: 'Seller', email: '' };

        // Get bid count for notifications
        const bidCount = await Bid.countDocuments({ 
            seller: sellerId,
            status: 'submitted'
        });

        res.render('seller/analytics', {
            user: userData,
            currentPage: 'analytics',
            analytics: analytics,
            bidCount: bidCount
        });
    } catch (error) {
        console.error('Bid analytics error:', error);
        req.flash('error', 'Error loading analytics: ' + error.message);
        res.redirect('/seller/dashboard');
    }
};

// View Contract Details
exports.getContractDetails = async (req, res) => {
    try {
        const { bidId } = req.params;
        const sellerId = req.session.userId;

        if (!sellerId) {
            req.flash('error', 'Please log in to view contract details');
            return res.redirect('/auth/login');
        }

        const bid = await Bid.findOne({ _id: bidId, seller: sellerId })
            .populate('project', 'title category description')
            .populate('customer', 'name email phone companyName');

        if (!bid) {
            req.flash('error', 'Bid not found');
            return res.redirect('/seller/my-bids');
        }

        const contract = await Contract.findOne({ bid: bidId });
        if (!contract) {
            req.flash('error', 'Contract not found');
            return res.redirect('/seller/my-bids');
        }

        const userData = req.session.user || { name: 'Seller', email: '' };

        // Get bid count for notifications
        const bidCount = await Bid.countDocuments({ 
            seller: sellerId,
            status: 'submitted'
        });

        res.render('seller/contract-details', {
            user: userData,
            currentPage: 'my-bids',
            bid: bid,
            contract: contract,
            bidCount: bidCount,
            moment: require('moment')
        });
    } catch (error) {
        console.error('Contract details error:', error);
        req.flash('error', 'Error loading contract details: ' + error.message);
        res.redirect('/seller/my-bids');
    }
};

module.exports = exports;