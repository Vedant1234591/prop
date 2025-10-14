const User = require('../models/User');
const Project = require('../models/Project');
const Bid = require('../models/Bid');
const Contract = require('../models/Contract');
const Notice = require('../models/Notice');
const CertificateService = require('../services/certificateService');
const statusAutomation = require('../services/statusAutomation');
const mongoose = require('mongoose');

// Dashboard
exports.getDashboard = async (req, res) => {
    try {
        const totalUsers = await User.countDocuments();
        const totalProjects = await Project.countDocuments();
        const totalBids = await Bid.countDocuments();
        const pendingContracts = await Contract.countDocuments({ status: 'pending-admin' });
        const activeProjects = await Project.countDocuments({ 'bidSettings.isActive': true });
        const submittedBids = await Bid.countDocuments({ status: 'submitted' });
        const autoWonBids = await Bid.countDocuments({ autoWon: true });

        const recentProjects = await Project.find()
            .populate('customer', 'name email')
            .sort({ createdAt: -1 })
            .limit(10);

        const pendingVerifications = await Contract.find({ status: 'pending-admin' })
            .populate('project', 'title')
            .populate('customer', 'name')
            .populate('seller', 'name companyName')
            .populate('bid', 'amount');

        res.render('admin/dashboard', {
            user: req.user,
            stats: {
                totalUsers,
                totalProjects,
                totalBids,
                pendingContracts,
                activeProjects,
                submittedBids,
                autoWonBids
            },
            recentProjects,
            pendingVerifications
        });
    } catch (error) {
        console.error('Admin dashboard error:', error);
        res.status(500).render('error', { message: 'Error loading admin dashboard' });
    }
};

// User Management
exports.getAllUsers = async (req, res) => {
    try {
        const users = await User.find()
            .select('name email role companyName isActive createdAt lastLogin')
            .sort({ createdAt: -1 });

        res.render('admin/all-users', {
            user: req.user,
            currentPage: 'all-users',
            users: users || []
        });
    } catch (error) {
        console.error('Get all users error:', error);
        req.flash('error', 'Error loading users');
        res.redirect('/admin/dashboard');
    }
};

exports.getUserDetails = async (req, res) => {
    try {
        const { userId } = req.params;

        const user = await User.findById(userId)
            .select('name email role companyName phone isActive createdAt lastLogin bio website');

        if (!user) {
            req.flash('error', 'User not found');
            return res.redirect('/admin/all-users');
        }

        let userProjects = [];
        let userBids = [];
        let userContracts = [];

        if (user.role === 'customer') {
            userProjects = await Project.find({ customer: userId })
                .populate('selectedBid')
                .sort({ createdAt: -1 });
        } else if (user.role === 'seller') {
            userBids = await Bid.find({ seller: userId })
                .populate('project', 'title category')
                .sort({ createdAt: -1 });
            
            userContracts = await Contract.find({ seller: userId })
                .populate('project', 'title')
                .populate('customer', 'name')
                .sort({ createdAt: -1 });
        }

        res.render('admin/user-details', {
            user: req.user,
            currentPage: 'all-users',
            userProfile: user,
            userProjects,
            userBids,
            userContracts,
            moment: require('moment')
        });
    } catch (error) {
        console.error('Get user details error:', error);
        req.flash('error', 'Error loading user details');
        res.redirect('/admin/all-users');
    }
};

exports.toggleUserStatus = async (req, res) => {
    try {
        const { userId } = req.params;

        const user = await User.findById(userId);
        if (!user) {
            req.flash('error', 'User not found');
            return res.redirect('/admin/all-users');
        }

        user.isActive = !user.isActive;
        await user.save();

        req.flash('success', `User ${user.isActive ? 'activated' : 'deactivated'} successfully!`);
        res.redirect(`/admin/users/${userId}`);
    } catch (error) {
        console.error('Toggle user status error:', error);
        req.flash('error', 'Error updating user status');
        res.redirect('/admin/all-users');
    }
};

exports.updateUserRole = async (req, res) => {
    try {
        const { userId } = req.params;
        const { role } = req.body;

        const validRoles = ['customer', 'seller', 'admin'];
        if (!validRoles.includes(role)) {
            req.flash('error', 'Invalid role specified');
            return res.redirect('/admin/all-users');
        }

        await User.findByIdAndUpdate(userId, { role });

        req.flash('success', `User role updated to ${role} successfully!`);
        res.redirect(`/admin/users/${userId}`);
    } catch (error) {
        console.error('Update user role error:', error);
        req.flash('error', 'Error updating user role');
        res.redirect('/admin/all-users');
    }
};

// Project Management
exports.getAllProjects = async (req, res) => {
    try {
        const projects = await Project.find()
            .populate('customer', 'name email')
            .populate('selectedBid')
            .sort({ createdAt: -1 });

        res.render('admin/all-projects', {
            user: req.user,
            currentPage: 'all-projects',
            projects: projects || [],
            moment: require('moment')
        });
    } catch (error) {
        console.error('Get all projects error:', error);
        req.flash('error', 'Error loading projects');
        res.redirect('/admin/dashboard');
    }
};

exports.getProjectDetails = async (req, res) => {
    try {
        const project = await Project.findById(req.params.id)
            .populate('customer', 'name email phone')
            .populate('bids')
            .populate('selectedBid')
            .populate({
                path: 'selectedBid',
                populate: {
                    path: 'seller',
                    select: 'name companyName email'
                }
            });

        if (!project) {
            req.flash('error', 'Project not found');
            return res.redirect('/admin/all-projects');
        }

        const contract = await Contract.findOne({ project: req.params.id });

        res.render('admin/project-details', {
            user: req.user,
            currentPage: 'all-projects',
            project: project,
            contract: contract,
            moment: require('moment')
        });
    } catch (error) {
        console.error('Get project details error:', error);
        req.flash('error', 'Error loading project details');
        res.redirect('/admin/all-projects');
    }
};

exports.forceCloseBidding = async (req, res) => {
    try {
        const { projectId } = req.params;

        const project = await Project.findById(projectId);
        if (!project) {
            req.flash('error', 'Project not found');
            return res.redirect('/admin/all-projects');
        }

        project.bidSettings.isActive = false;
        project.bidSettings.manualClose = true;
        project.bidSettings.closedAt = new Date();
        await project.save();

        await statusAutomation.processProjectBidClosure(projectId);

        req.flash('success', 'Bidding closed successfully and auto-win processing initiated!');
        res.redirect('/admin/all-projects');
    } catch (error) {
        console.error('Force close bidding error:', error);
        req.flash('error', 'Error closing bidding: ' + error.message);
        res.redirect('/admin/all-projects');
    }
};

// Bid Management
exports.getAllBids = async (req, res) => {
    try {
        const bids = await Bid.find()
            .populate('project', 'title category')
            .populate('seller', 'name companyName')
            .populate('customer', 'name email')
            .sort({ createdAt: -1 });

        res.render('admin/all-bids', {
            user: req.user,
            currentPage: 'all-bids',
            bids: bids || [],
            moment: require('moment')
        });
    } catch (error) {
        console.error('Get all bids error:', error);
        req.flash('error', 'Error loading bids');
        res.redirect('/admin/dashboard');
    }
};

// Contract Management - FIXED VERSION

// Get Pending Contracts
exports.getPendingContracts = async (req, res) => {
    try {
        const pendingContracts = await Contract.find({ status: 'pending-admin' })
            .populate('bid')
            .populate('project', 'title category')
            .populate('customer', 'name email')
            .populate('seller', 'name companyName')
            .sort({ createdAt: -1 });

        res.render('admin/pending-contracts', {
            user: req.user,
            currentPage: 'pending-contracts',
            contracts: pendingContracts,
            moment: require('moment')
        });
    } catch (error) {
        console.error('Get pending contracts error:', error);
        req.flash('error', 'Error loading pending contracts');
        res.redirect('/admin/dashboard');
    }
};

// Approve Contract - FIXED VERSION
exports.approveContract = async (req, res) => {
    try {
        const { contractId } = req.params;

        console.log('Approving contract:', contractId);

        // Find and update contract in one operation
        const contract = await Contract.findByIdAndUpdate(
            contractId,
            {
                status: 'completed',
                adminApproved: true,
                adminApprovedAt: new Date(),
                approvedBy: req.user._id,
                updatedAt: new Date()
            },
            { new: true }
        );

        if (!contract) {
            req.flash('error', 'Contract not found');
            return res.redirect('/admin/pending-contracts');
        }

        console.log('Contract approved:', contract._id);

        // Update bid status
        if (contract.bid) {
            await Bid.findByIdAndUpdate(contract.bid, {
                status: 'completed',
                adminVerified: true,
                updatedAt: new Date()
            });
            console.log('Bid updated:', contract.bid);
        }

        // Update project status
        if (contract.project) {
            await Project.findByIdAndUpdate(contract.project, {
                status: 'completed',
                completedAt: new Date(),
                updatedAt: new Date()
            });
            console.log('Project updated:', contract.project);
        }

        req.flash('success', 'Contract approved successfully!');
        res.redirect('/admin/pending-contracts');

    } catch (error) {
        console.error('Approve contract error:', error);
        req.flash('error', 'Error approving contract: ' + error.message);
        res.redirect('/admin/pending-contracts');
    }
};

// Reject Contract - FIXED VERSION
exports.rejectContract = async (req, res) => {
    try {
        const { contractId } = req.params;
        const { rejectionReason } = req.body;

        console.log('Rejecting contract:', contractId);

        const contract = await Contract.findByIdAndUpdate(
            contractId,
            {
                status: 'rejected',
                rejectionReason: rejectionReason,
                adminApproved: false,
                updatedAt: new Date()
            },
            { new: true }
        );

        if (!contract) {
            req.flash('error', 'Contract not found');
            return res.redirect('/admin/pending-contracts');
        }

        console.log('Contract rejected:', contract._id);

        // Also update the associated bid status
        if (contract.bid) {
            await Bid.findByIdAndUpdate(contract.bid, {
                status: 'rejected',
                adminVerified: false,
                updatedAt: new Date()
            });
        }

        req.flash('success', 'Contract rejected successfully');
        res.redirect('/admin/pending-contracts');
    } catch (error) {
        console.error('Reject contract error:', error);
        req.flash('error', 'Error rejecting contract: ' + error.message);
        res.redirect('/admin/pending-contracts');
    }
};

// NEW: Bulk Approve All Pending Contracts
exports.bulkApproveContracts = async (req, res) => {
    try {
        const pendingContracts = await Contract.find({ status: 'pending-admin' });

        if (pendingContracts.length === 0) {
            req.flash('info', 'No pending contracts to approve');
            return res.redirect('/admin/pending-contracts');
        }

        const updatePromises = pendingContracts.map(async (contract) => {
            // Update contract
            await Contract.findByIdAndUpdate(contract._id, {
                status: 'completed',
                adminApproved: true,
                adminApprovedAt: new Date(),
                approvedBy: req.user._id,
                updatedAt: new Date()
            });

            // Update bid
            if (contract.bid) {
                await Bid.findByIdAndUpdate(contract.bid, {
                    status: 'completed',
                    adminVerified: true,
                    updatedAt: new Date()
                });
            }

            // Update project
            if (contract.project) {
                await Project.findByIdAndUpdate(contract.project, {
                    status: 'completed',
                    completedAt: new Date(),
                    updatedAt: new Date()
                });
            }
        });

        await Promise.all(updatePromises);

        req.flash('success', `Successfully approved ${pendingContracts.length} contract(s)!`);
        res.redirect('/admin/pending-contracts');

    } catch (error) {
        console.error('Bulk approve contracts error:', error);
        req.flash('error', 'Error bulk approving contracts: ' + error.message);
        res.redirect('/admin/pending-contracts');
    }
};

// System Management
exports.getSystemStatus = async (req, res) => {
    try {
        const systemStats = await statusAutomation.updateAllProjectStatuses();
        
        const autoProcessStats = {
            lastRun: new Date(),
            draftedToActive: systemStats.data?.draftedToActive || 0,
            biddingClosed: systemStats.data?.biddingClosed || 0,
            bidsProcessed: systemStats.data?.bidsProcessed || 0,
            contractsCreated: systemStats.data?.contractsCreated || 0
        };

        res.render('admin/system-status', {
            user: req.user,
            currentPage: 'system-status',
            systemStats: autoProcessStats
        });
    } catch (error) {
        console.error('Get system status error:', error);
        req.flash('error', 'Error loading system status');
        res.redirect('/admin/dashboard');
    }
};

exports.autoProcessAll = async (req, res) => {
    try {
        const result = await statusAutomation.manualUpdate();
        
        if (result.success) {
            req.flash('success', 
                `Auto-processing completed! Projects activated: ${result.data.draftedToActive}, ` +
                `Bidding closed: ${result.data.biddingClosed}, Bids processed: ${result.data.bidsProcessed}`
            );
        } else {
            req.flash('error', 'Auto-processing failed: ' + result.message);
        }
        
        res.redirect('/admin/system-status');
    } catch (error) {
        req.flash('error', 'Error during auto-processing: ' + error.message);
        res.redirect('/admin/system-status');
    }
};

// Notice Management
exports.getNotices = async (req, res) => {
    try {
        const notices = await Notice.find()
            .populate('createdBy', 'name')
            .sort({ createdAt: -1 });

        res.render('admin/notices', {
            user: req.user,
            currentPage: 'notices',
            notices
        });
    } catch (error) {
        console.error('Get notices error:', error);
        res.status(500).render('error', { message: 'Error loading notices' });
    }
};

exports.createNotice = async (req, res) => {
    try {
        const { title, content, type, targetAudience, priority, endDate } = req.body;

        const notice = await Notice.create({
            title,
            content,
            type,
            targetAudience: Array.isArray(targetAudience) ? targetAudience : [targetAudience],
            priority,
            endDate: endDate || null,
            createdBy: req.user._id
        });

        req.flash('success', 'Notice created successfully!');
        res.redirect('/admin/notices');
    } catch (error) {
        console.error('Notice creation error:', error);
        req.flash('error', 'Error creating notice');
        res.redirect('back');
    }
};

exports.updateNotice = async (req, res) => {
    try {
        const { noticeId } = req.params;
        const { title, content, type, targetAudience, priority, isActive, endDate } = req.body;

        await Notice.findByIdAndUpdate(noticeId, {
            title,
            content,
            type,
            targetAudience: Array.isArray(targetAudience) ? targetAudience : [targetAudience],
            priority,
            isActive: isActive === 'on',
            endDate: endDate || null
        });

        req.flash('success', 'Notice updated successfully!');
        res.redirect('/admin/notices');
    } catch (error) {
        console.error('Notice update error:', error);
        req.flash('error', 'Error updating notice');
        res.redirect('back');
    }
};

exports.deleteNotice = async (req, res) => {
    try {
        const { noticeId } = req.params;

        await Notice.findByIdAndDelete(noticeId);

        req.flash('success', 'Notice deleted successfully!');
        res.redirect('/admin/notices');
    } catch (error) {
        console.error('Notice deletion error:', error);
        req.flash('error', 'Error deleting notice');
        res.redirect('back');
    }
};

// Helper Functions
exports.generateCertificateUrl = async (contract) => {
    return `/certificates/${contract.bid._id}.pdf`;
};

exports.generateCertificate = async (req, res) => {
    try {
        const { bidId } = req.params;

        const bid = await Bid.findById(bidId)
            .populate('project')
            .populate('seller')
            .populate('customer');

        if (!bid) {
            req.flash('error', 'Bid not found');
            return res.redirect('/admin/pending-contracts');
        }

        const certificateUrl = await this.generateCertificateUrl({ bid });
        bid.certificateGenerated = true;
        bid.certificateUrl = certificateUrl;
        await bid.save();

        req.flash('success', 'Certificate generated successfully!');
        res.redirect('/admin/pending-contracts');
    } catch (error) {
        console.error('Generate certificate error:', error);
        req.flash('error', 'Error generating certificate: ' + error.message);
        res.redirect('/admin/pending-contracts');
    }
};