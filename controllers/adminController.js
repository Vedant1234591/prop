const User = require('../models/User');
const Seller = require('../models/Seller');
const Project = require('../models/Project');
const Bid = require('../models/Bid');
const Contract = require('../models/Contract');
const Notice = require('../models/Notice');
const CertificateService = require('../services/certificateService');
const statusAutomation = require('../services/statusAutomation');
const mongoose = require('mongoose');



//seler verification
exports.VerifySeller = async (req, res) => {
   

       try {
        const seller = await Seller.findById(req.params.id);
        seller.adminVerified = true;
        await seller.save();
        req.flash('success', 'Seller verified');
        res.redirect('back');
    } catch (err) {
        console.error('Verify bid error:', err);
        req.flash('error', 'Could not verify bid');
        res.redirect('back');
    }
    
}


// User Management
exports.getAllUsers = async (req, res) => {
  try {
    const users = await User.find()
    
     

    const sellers = await Seller.find().populate('userId');
     
    console.log("debug",req.user)
    console.log("debug",sellers)
    return res.render('admin/all-users', {
      user: req.user,
      currentPage: 'all-users',
      users: users || [],
      sellers: sellers || []
    });
  } catch (error) {
    console.error('Get all users error:', error);
    req.flash('error', 'Error loading users');
    return res.redirect('/admin/dashboard');
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
        console.log('Bids fetched:', bids[0].adminVerified);
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








// NEW: Download Customer Certificate
exports.downloadCustomerCertificate = async (req, res) => {
    try {
        const { contractId } = req.params;

        const contract = await Contract.findById(contractId);
        if (!contract) {
            req.flash('error', 'Contract not found');
            return res.redirect('/admin/pending-contracts');
        }

        if (contract.customerCertificate && contract.customerCertificate.url) {
            console.log('📥 Downloading customer certificate:', contract.customerCertificate.url);
            res.redirect(contract.customerCertificate.url);
        } else {
            req.flash('error', 'Customer certificate not available');
            res.redirect('/admin/pending-contracts');
        }
    } catch (error) {
        console.error('❌ Download customer certificate error:', error);
        req.flash('error', 'Error downloading customer certificate');
        res.redirect('/admin/pending-contracts');
    }
};

// NEW: Download Seller Certificate
exports.downloadSellerCertificate = async (req, res) => {
    try {
        const { contractId } = req.params;

        const contract = await Contract.findById(contractId);
        if (!contract) {
            req.flash('error', 'Contract not found');
            return res.redirect('/admin/pending-contracts');
        }

        if (contract.sellerCertificate && contract.sellerCertificate.url) {
            console.log('📥 Downloading seller certificate:', contract.sellerCertificate.url);
            res.redirect(contract.sellerCertificate.url);
        } else {
            req.flash('error', 'Seller certificate not available');
            res.redirect('/admin/pending-contracts');
        }
    } catch (error) {
        console.error('❌ Download seller certificate error:', error);
        req.flash('error', 'Error downloading seller certificate');
        res.redirect('/admin/pending-contracts');
    }
};

// NEW: Download Final Certificate
exports.downloadFinalCertificate = async (req, res) => {
    try {
        const { contractId } = req.params;

        const contract = await Contract.findById(contractId);
        if (!contract) {
            req.flash('error', 'Contract not found');
            return res.redirect('/admin/pending-contracts');
        }

        if (contract.finalCertificate && contract.finalCertificate.url) {
            console.log('📥 Downloading final certificate:', contract.finalCertificate.url);
            res.redirect(contract.finalCertificate.url);
        } else {
            req.flash('error', 'Final certificate not available');
            res.redirect('/admin/pending-contracts');
        }
    } catch (error) {
        console.error('❌ Download final certificate error:', error);
        req.flash('error', 'Error downloading final certificate');
        res.redirect('/admin/pending-contracts');
    }
};












// // NEW: Reject Customer Contract Only
// exports.rejectCustomerContract = async (req, res) => {
//     try {
//         const { contractId } = req.params;
//         const { rejectionReason, deadlineHours } = req.body;

//         console.log('🔄 Rejecting customer contract:', contractId);

//         const contract = await Contract.findById(contractId)
//             .populate('project')
//             .populate('customer')
//             .populate('seller');

//         if (!contract) {
//             req.flash('error', 'Contract not found');
//             return res.redirect('/admin/pending-contracts');
//         }

//         // Reject only customer contract
//         await contract.rejectContract(
//             req.user._id, 
//             rejectionReason, 
//             'customer', 
//             parseInt(deadlineHours) || 48
//         );

//         // Create rejection notice for customer
//         const Notice = require('../models/Notice');
//         await Notice.create({
//             title: `Contract Requires Correction - ${contract.project.title}`,
//             content: `Your contract requires corrections. Reason: ${rejectionReason}. Please upload corrected contract within ${deadlineHours || 48} hours.`,
//             targetAudience: 'customer',
//             specificUser: contract.customer._id,
//             noticeType: 'error',
//             isActive: true,
//             startDate: new Date(),
//             endDate: contract.currentRejection.deadline,
//         });

//         req.flash('success', `Customer contract rejected successfully. Customer has ${deadlineHours || 48} hours to correct.`);
//         res.redirect('/admin/pending-contracts');
//     } catch (error) {
//         console.error('❌ Reject customer contract error:', error);
//         req.flash('error', 'Error rejecting customer contract: ' + error.message);
//         res.redirect('/admin/pending-contracts');
//     }
// };

// // NEW: Reject Seller Contract Only
// exports.rejectSellerContract = async (req, res) => {
//     try {
//         const { contractId } = req.params;
//         const { rejectionReason, deadlineHours } = req.body;

//         console.log('🔄 Rejecting seller contract:', contractId);

//         const contract = await Contract.findById(contractId)
//             .populate('project')
//             .populate('customer')
//             .populate('seller');

//         if (!contract) {
//             req.flash('error', 'Contract not found');
//             return res.redirect('/admin/pending-contracts');
//         }

//         // Reject only seller contract
//         await contract.rejectContract(
//             req.user._id, 
//             rejectionReason, 
//             'seller', 
//             parseInt(deadlineHours) || 48
//         );

//         // Create rejection notice for seller
//         const Notice = require('../models/Notice');
//         await Notice.create({
//             title: `Contract Requires Correction - ${contract.project.title}`,
//             content: `Your contract requires corrections. Reason: ${rejectionReason}. Please upload corrected contract within ${deadlineHours || 48} hours.`,
//             targetAudience: 'seller',
//             specificUser: contract.seller._id,
//             noticeType: 'error',
//             isActive: true,
//             startDate: new Date(),
//             endDate: contract.currentRejection.deadline,
//         });

//         req.flash('success', `Seller contract rejected successfully. Seller has ${deadlineHours || 48} hours to correct.`);
//         res.redirect('/admin/pending-contracts');
//     } catch (error) {
//         console.error('❌ Reject seller contract error:', error);
//         req.flash('error', 'Error rejecting seller contract: ' + error.message);
//         res.redirect('/admin/pending-contracts');
//     }
// };



// Reject Customer Contract
exports.rejectCustomerContract = async (req, res) => {
    try {
        const { contractId } = req.params;
        const { rejectionReason, deadlineHours } = req.body;

        console.log('🔄 Rejecting customer contract:', contractId);

        const contract = await Contract.findById(contractId)
            .populate('project')
            .populate('customer')
            .populate('seller');

        if (!contract) {
            req.flash('error', 'Contract not found');
            return res.redirect('/admin/pending-contracts');
        }

        // Reject only customer
        await contract.rejectContract(
            req.user._id, 
            rejectionReason, 
            'customer', 
            parseInt(deadlineHours) || 48
        );

        // Create Notice
        const Notice = require('../models/Notice');
        await Notice.create({
            title: `Contract Requires Correction - ${contract.project.title}`,
            content: `Your contract requires corrections. Reason: ${rejectionReason}. Please upload corrected contract within ${deadlineHours || 48} hours.`,
            targetAudience: 'customer',
            specificUser: contract.customer._id,
            noticeType: 'error',
            isActive: true,
            startDate: new Date(),
            endDate: contract.currentRejection.deadline,
        });

        req.flash('success', `Customer contract rejected successfully. Customer has ${deadlineHours || 48} hours to correct.`);
        res.redirect('/admin/pending-contracts');
    } catch (error) {
        console.error('❌ Reject customer contract error:', error);
        req.flash('error', 'Error rejecting customer contract: ' + error.message);
        res.redirect('/admin/pending-contracts');
    }
};

// Reject Seller Contract
exports.rejectSellerContract = async (req, res) => {
    try {
        const { contractId } = req.params;
        const { rejectionReason, deadlineHours } = req.body;

        console.log('🔄 Rejecting seller contract:', contractId);

        const contract = await Contract.findById(contractId)
            .populate('project')
            .populate('customer')
            .populate('seller');

        if (!contract) {
            req.flash('error', 'Contract not found');
            return res.redirect('/admin/pending-contracts');
        }

        // Reject only seller
        await contract.rejectContract(
            req.user._id, 
            rejectionReason, 
            'seller', 
            parseInt(deadlineHours) || 48
        );

        // Create Notice
        const Notice = require('../models/Notice');
        await Notice.create({
            title: `Contract Requires Correction - ${contract.project.title}`,
            content: `Your contract requires corrections. Reason: ${rejectionReason}. Please upload corrected contract within ${deadlineHours || 48} hours.`,
            targetAudience: 'seller',
            specificUser: contract.seller._id,
            noticeType: 'error',
            isActive: true,
            startDate: new Date(),
            endDate: contract.currentRejection.deadline,
        });

        req.flash('success', `Seller contract rejected successfully. Seller has ${deadlineHours || 48} hours to correct.`);
        res.redirect('/admin/pending-contracts');
    } catch (error) {
        console.error('❌ Reject seller contract error:', error);
        req.flash('error', 'Error rejecting seller contract: ' + error.message);
        res.redirect('/admin/pending-contracts');
    }
};








// NEW: Enhanced contract rejection with remarks and deadlines
exports.rejectContractWithRemarks = async (req, res) => {
  try {
    const { contractId } = req.params;
    const { rejectionReason, partyRequired, deadlineHours } = req.body;

    const contract = await Contract.findById(contractId)
      .populate('project')
      .populate('customer')
      .populate('seller');

    if (!contract) {
      req.flash('error', 'Contract not found');
      return res.redirect('/admin/pending-contracts');
    }

    // Reject contract with specific party requirements and deadline
    await contract.rejectContract(
      req.user._id, 
      rejectionReason, 
      partyRequired, 
      parseInt(deadlineHours) || 48
    );

    // Create rejection notices
    const Notice = require('../models/Notice');
    
    if (partyRequired === 'customer' || partyRequired === 'both') {
      await Notice.create({
        title: `Contract Requires Correction - ${contract.project.title}`,
        content: `Your contract requires corrections. Reason: ${rejectionReason}. Please upload corrected contract within ${deadlineHours || 48} hours.`,
        targetAudience: 'customer',
        specificUser: contract.customer._id,
        noticeType: 'error',
        isActive: true,
        startDate: new Date(),
        endDate: contract.currentRejection.deadline,
      });
    }

    if (partyRequired === 'seller' || partyRequired === 'both') {
      await Notice.create({
        title: `Contract Requires Correction - ${contract.project.title}`,
        content: `Your contract requires corrections. Reason: ${rejectionReason}. Please upload corrected contract within ${deadlineHours || 48} hours.`,
        targetAudience: 'seller',
        specificUser: contract.seller._id,
        noticeType: 'error',
        isActive: true,
        startDate: new Date(),
        endDate: contract.currentRejection.deadline,
      });
    }

    req.flash('success', `Contract rejected successfully. ${partyRequired} has ${deadlineHours || 48} hours to correct.`);
    res.redirect('/admin/pending-contracts');
  } catch (error) {
    console.error('Reject contract with remarks error:', error);
    req.flash('error', 'Error rejecting contract: ' + error.message);
    res.redirect('/admin/pending-contracts');
  }
};





// Enhanced Approve Contract with PDF Generation
exports.approveContract = async (req, res) => {
    try {
        const { contractId } = req.params;
        const { adminNotes } = req.body;

        console.log('🔄 Approving contract:', contractId);

        // Find contract with all related data
        const contract = await Contract.findById(contractId)
            .populate('project')
            .populate('bid')
            .populate('customer')
            .populate('seller');

        if (!contract) {
            req.flash('error', 'Contract not found');
            return res.redirect('/admin/pending-contracts');
        }

        // Verify both parties have uploaded signed contracts
        if (!contract.customerSignedContract || !contract.customerSignedContract.url) {
            req.flash('error', 'Customer has not uploaded signed contract');
            return res.redirect('/admin/pending-contracts');
        }

        if (!contract.sellerSignedContract || !contract.sellerSignedContract.url) {
            req.flash('error', 'Seller has not uploaded signed contract');
            return res.redirect('/admin/pending-contracts');
        }

        console.log('📜 Generating completion certificate...');

        // Generate completion certificate
        const PDFGenerator = require('../services/pdfGenerator');
        const certificate = await PDFGenerator.generateCertificate(
            contract.bid,
            contract.project,
            contract.customer,
            contract.seller
        );

        console.log('✅ Certificate generated:', certificate ? 'Yes' : 'No');

        // Update contract with approval and certificate - USING CORRECT FIELD NAMES
        contract.status = 'completed';
        contract.adminApproved = true;
        contract.adminApprovedAt = new Date();
        contract.adminApprovedBy = req.user._id; // FIXED: adminApprovedBy instead of approvedBy
        contract.adminNotes = adminNotes;

        // Store the final certificate
        contract.finalCertificate = {
            public_id: certificate.public_id,
            url: certificate.secure_url,
            filename: `completion_certificate_${contract._id}.pdf`,
            bytes: certificate.bytes,
            generatedAt: new Date()
        };

        contract.updatedAt = new Date();

        await contract.save();
        console.log('✅ Contract approved:', contract._id);

        // Update bid status with certificate
        if (contract.bid) {
            const bid = await Bid.findById(contract.bid._id);
            if (bid) {
                bid.status = 'completed';
                bid.adminVerified = true;
                bid.certificateGenerated = true;
                bid.certificateUrl = certificate.secure_url;
                bid.certificatePublicId = certificate.public_id;
                bid.certificateGeneratedAt = new Date();
                bid.updatedAt = new Date();
                await bid.save();
                console.log('✅ Bid updated:', bid._id);
            }
        }

        // Update project status
        if (contract.project) {
            const project = await Project.findById(contract.project._id);
            if (project) {
                project.status = 'completed';
                project.completedAt = new Date();
                project.updatedAt = new Date();
                await project.save();
                console.log('✅ Project completed:', project._id);
            }
        }

        // Create success notices for both parties
        const Notice = require('../models/Notice');
        await Notice.create({
            title: `Contract Approved - ${contract.project.title}`,
            content: `Your contract has been approved by admin! Completion certificate is now available for download.${adminNotes ? ` Admin Notes: ${adminNotes}` : ''}`,
            targetAudience: 'customer',
            specificUser: contract.customer._id,
            noticeType: 'success',
            isActive: true,
            startDate: new Date(),
            endDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
        });

        await Notice.create({
            title: `Contract Approved - ${contract.project.title}`,
            content: `Your contract has been approved by admin! Completion certificate is now available for download.${adminNotes ? ` Admin Notes: ${adminNotes}` : ''}`,
            targetAudience: 'seller',
            specificUser: contract.seller._id,
            noticeType: 'success',
            isActive: true,
            startDate: new Date(),
            endDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
        });

        req.flash('success', 'Contract approved successfully! Completion certificate generated.');
        res.redirect('/admin/pending-contracts');

    } catch (error) {
        console.error('❌ Approve contract error:', error);
        req.flash('error', 'Error approving contract: ' + error.message);
        res.redirect('/admin/pending-contracts');
    }
};
// Enhanced Reject Contract with detailed feedback
exports.rejectContract = async (req, res) => {
    try {
        const { contractId } = req.params;
        const { rejectionReason, correctiveAction } = req.body;

        console.log('Rejecting contract:', contractId);

        const contract = await Contract.findById(contractId)
            .populate('project')
            .populate('customer')
            .populate('seller');

        if (!contract) {
            req.flash('error', 'Contract not found');
            return res.redirect('/admin/pending-contracts');
        }

        // Update contract status
        contract.status = 'rejected';
        contract.rejectionReason = rejectionReason;
        contract.adminApproved = false;
        contract.updatedAt = new Date();
        await contract.save();

        console.log('✅ Contract rejected:', contract._id);

        // Create rejection notices for both parties with corrective actions
        const Notice = require('../models/Notice');

        await Notice.create({
            title: `Contract Requires Correction - ${contract.project.title}`,
            content: `Your contract requires corrections before approval. Reason: ${rejectionReason}${correctiveAction ? ` Corrective Action: ${correctiveAction}` : ''}`,
            targetAudience: 'customer',
            specificUser: contract.customer._id,
            noticeType: 'error',
            isActive: true,
            startDate: new Date(),
            endDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
        });

        await Notice.create({
            title: `Contract Requires Correction - ${contract.project.title}`,
            content: `Your contract requires corrections before approval. Reason: ${rejectionReason}${correctiveAction ? ` Corrective Action: ${correctiveAction}` : ''}`,
            targetAudience: 'seller',
            specificUser: contract.seller._id,
            noticeType: 'error',
            isActive: true,
            startDate: new Date(),
            endDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
        });

        req.flash('success', 'Contract rejected successfully. Both parties notified with correction instructions.');
        res.redirect('/admin/pending-contracts');
    } catch (error) {
        console.error('❌ Reject contract error:', error);
        req.flash('error', 'Error rejecting contract: ' + error.message);
        res.redirect('/admin/pending-contracts');
    }
};

// Download Contract Documents for Admin Review
exports.downloadCustomerContract = async (req, res) => {
    try {
        const { contractId } = req.params;

        const contract = await Contract.findById(contractId);
        if (!contract || !contract.customerSignedContract?.url) {
            req.flash('error', 'Customer contract not available');
            return res.redirect('/admin/pending-contracts');
        }

        console.log('📥 Downloading customer contract:', contract.customerSignedContract.url);
        res.redirect(contract.customerSignedContract.url);
    } catch (error) {
        console.error('❌ Download customer contract error:', error);
        req.flash('error', 'Error downloading customer contract');
        res.redirect('/admin/pending-contracts');
    }
};
exports.getPendingContracts = async (req, res) => {
    try {
        console.log('🔄 Loading pending contracts...');
        
        // Get all contracts that need admin attention
        const pendingContracts = await Contract.find({
            status: { $in: ['pending-admin', 'correcting'] }
        })
            .populate('project', 'title category featuredImage biddingRounds adminStatus')
            .populate('customer', 'name email phone')
            .populate('seller', 'name companyName email')
            .populate('bid', 'amount proposal')
            .populate('adminApprovedBy', 'name') // FIXED: Changed from approvedBy to adminApprovedBy
            .sort({ updatedAt: -1 });

        console.log(`📋 Found ${pendingContracts.length} pending contracts`);

        // Calculate dynamic status for each contract and overall statistics
        let readyCount = 0;
        let waitingCount = 0;
        let correctingCount = 0;
        let autoCount = 0;

        const contractsWithStatus = pendingContracts.map(contract => {
            // Determine the dynamic status for filtering
            let filterStatus = '';
            
            if (contract.status === 'correcting') {
                filterStatus = 'correcting';
                correctingCount++;
            } else if (contract.customerSignedContract && contract.customerSignedContract.url &&
                contract.sellerSignedContract && contract.sellerSignedContract.url) {
                filterStatus = 'ready';
                readyCount++;
            } else {
                filterStatus = 'waiting';
                waitingCount++;
            }

            // Check if it's a round 3 winner for auto-generated count
            if (contract.project.biddingRounds?.currentRound === 3) {
                autoCount++;
            }

            // Return contract with additional computed properties
            return {
                ...contract.toObject(),
                filterStatus: filterStatus,
                isReadyForApproval: filterStatus === 'ready',
                isWaitingDocuments: filterStatus === 'waiting',
                isNeedsCorrection: filterStatus === 'correcting'
            };
        });

        const stats = {
            totalPending: pendingContracts.length,
            readyForApproval: readyCount,
            waitingDocuments: waitingCount,
            needsCorrection: correctingCount,
            autoGenerated: autoCount,
            totalApproved: await Contract.countDocuments({ status: 'completed' }),
            totalRejected: await Contract.countDocuments({ status: 'rejected' }),
            totalContracts: await Contract.countDocuments()
        };

        console.log('✅ Pending contracts loaded successfully');
        
        res.render('admin/pending-contracts', {
            user: req.user,
            currentPage: 'pending-contracts',
            contracts: contractsWithStatus,
            stats: stats,
            moment: require('moment')
        });
    } catch (error) {
        console.error('❌ Get pending contracts error:', error);
        req.flash('error', 'Error loading pending contracts: ' + error.message);
        res.redirect('/admin/dashboard');
    }
};

// FIXED: Enhanced contract details with correct field names
exports.getContractDetails = async (req, res) => {
    try {
        const { contractId } = req.params;
        
        console.log('🔍 Loading contract details for:', contractId);

        // Validate contract ID
        if (!contractId || contractId === 'undefined' || contractId === 'null') {
            console.error('❌ Invalid contract ID:', contractId);
            req.flash('error', 'Invalid contract ID');
            return res.redirect('/admin/pending-contracts');
        }

        // Check if it's a valid MongoDB ObjectId
        if (!mongoose.Types.ObjectId.isValid(contractId)) {
            console.error('❌ Invalid contract ID format:', contractId);
            req.flash('error', 'Invalid contract ID format');
            return res.redirect('/admin/pending-contracts');
        }

        const contract = await Contract.findById(contractId)
            .populate('project', 'title description category timeline location biddingRounds adminStatus')
            .populate('customer', 'name email phone address')
            .populate('seller', 'name companyName email phone taxId')
            .populate('bid', 'amount proposal timeline')
            .populate('adminApprovedBy', 'name email') // FIXED: Changed from approvedBy to adminApprovedBy
            .populate('rejectionHistory.rejectedBy', 'name email');

        if (!contract) {
            console.error('❌ Contract not found with ID:', contractId);
            req.flash('error', 'Contract not found');
            return res.redirect('/admin/pending-contracts');
        }

        console.log('✅ Contract details loaded successfully:', contract._id);

        // Add computed properties for the view
        const contractWithComputed = {
            ...contract.toObject(),
            filterStatus: contract.status === 'correcting' ? 'correcting' : 
                         (contract.customerSignedContract && contract.sellerSignedContract ? 'ready' : 'waiting'),
            isReadyForApproval: contract.customerSignedContract && contract.sellerSignedContract,
            isWaitingDocuments: !contract.customerSignedContract || !contract.sellerSignedContract,
            isNeedsCorrection: contract.status === 'correcting'
        };

        res.render('admin/contract-details', {
            user: req.user,
            currentPage: 'pending-contracts',
            contract: contractWithComputed,
            moment: require('moment')
        });
    } catch (error) {
        console.error('❌ Get contract details error:', error);
        req.flash('error', 'Error loading contract details: ' + error.message);
        res.redirect('/admin/pending-contracts');
    }
};
// Download Seller Contract
exports.downloadSellerContract = async (req, res) => {
    try {
        const { contractId } = req.params;

        const contract = await Contract.findById(contractId);
        if (!contract || !contract.sellerSignedContract?.url) {
            req.flash('error', 'Seller contract not available');
            return res.redirect('/admin/pending-contracts');
        }

        console.log('📥 Downloading seller contract:', contract.sellerSignedContract.url);
        res.redirect(contract.sellerSignedContract.url);
    } catch (error) {
        console.error('❌ Download seller contract error:', error);
        req.flash('error', 'Error downloading seller contract');
        res.redirect('/admin/pending-contracts');
    }
};
// Download Contract Template
exports.downloadContractTemplate = async (req, res) => {
    try {
        const { contractId, party } = req.params;

        const contract = await Contract.findById(contractId);
        if (!contract) {
            req.flash('error', 'Contract not found');
            return res.redirect('/admin/pending-contracts');
        }

        let templateUrl = null;
        if (party === 'customer' && contract.customerTemplate?.url) {
            templateUrl = contract.customerTemplate.url;
        } else if (party === 'seller' && contract.sellerTemplate?.url) {
            templateUrl = contract.sellerTemplate.url;
        }

        if (!templateUrl) {
            req.flash('error', 'Contract template not available');
            return res.redirect('/admin/pending-contracts');
        }

        console.log('📥 Downloading contract template:', templateUrl);
        res.redirect(templateUrl);
    } catch (error) {
        console.error('❌ Download contract template error:', error);
        req.flash('error', 'Error downloading contract template');
        res.redirect('/admin/pending-contracts');
    }
};


// Fix the bulkApproveContracts method
exports.bulkApproveContracts = async (req, res) => {
    try {
        const pendingContracts = await Contract.find({ status: 'pending-admin' })
            .populate('project')
            .populate('bid')
            .populate('customer')
            .populate('seller');

        if (pendingContracts.length === 0) {
            req.flash('info', 'No pending contracts to approve');
            return res.redirect('/admin/pending-contracts');
        }

        const PDFGenerator = require('../services/pdfGenerator');
        let approvedCount = 0;
        let skippedCount = 0;

        for (const contract of pendingContracts) {
            try {
                // Validate both parties have uploaded signed contracts
                if (!contract.customerSignedContract?.url || !contract.sellerSignedContract?.url) {
                    console.log(`⏭️ Skipping contract ${contract._id} - missing signed contracts`);
                    skippedCount++;
                    continue;
                }

                console.log(`🔄 Processing contract: ${contract._id}`);

                // Generate completion certificate
                const certificate = await PDFGenerator.generateCertificate(
                    contract.bid,
                    contract.project,
                    contract.customer,
                    contract.seller
                );

                // Update contract
                contract.status = 'completed';
                contract.adminApproved = true;
                contract.adminApprovedAt = new Date();
                contract.approvedBy = req.user._id;
                contract.finalCertificate = {
                    public_id: certificate.public_id,
                    url: certificate.secure_url,
                    filename: `completion_certificate_${contract._id}.pdf`,
                    bytes: certificate.bytes,
                    generatedAt: new Date()
                };
                contract.updatedAt = new Date();
                await contract.save();

                // Update bid
                if (contract.bid) {
                    await Bid.findByIdAndUpdate(contract.bid._id, {
                        status: 'completed',
                        adminVerified: true,
                        certificateGenerated: true,
                        certificateUrl: certificate.secure_url,
                        certificatePublicId: certificate.public_id,
                        certificateGeneratedAt: new Date(),
                        updatedAt: new Date()
                    });
                }

                // Update project
                if (contract.project) {
                    await Project.findByIdAndUpdate(contract.project._id, {
                        status: 'completed',
                        completedAt: new Date(),
                        updatedAt: new Date()
                    });
                }

                // Create notices
                const Notice = require('../models/Notice');
                await Notice.create([
                    {
                        title: `Contract Approved - ${contract.project.title}`,
                        content: 'Your contract has been approved by admin! Completion certificate is now available for download.',
                        targetAudience: 'customer',
                        specificUser: contract.customer._id,
                        noticeType: 'success',
                        isActive: true,
                        startDate: new Date(),
                        endDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
                    },
                    {
                        title: `Contract Approved - ${contract.project.title}`,
                        content: 'Your contract has been approved by admin! Completion certificate is now available for download.',
                        targetAudience: 'seller',
                        specificUser: contract.seller._id,
                        noticeType: 'success',
                        isActive: true,
                        startDate: new Date(),
                        endDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
                    }
                ]);

                approvedCount++;
                console.log(`✅ Bulk approved contract: ${contract._id}`);

            } catch (error) {
                console.error(`❌ Error processing contract ${contract._id}:`, error.message);
                skippedCount++;
            }
        }

        if (approvedCount > 0) {
            req.flash('success', `Successfully approved ${approvedCount} contract(s)!${skippedCount > 0 ? ` ${skippedCount} contract(s) skipped due to missing documents.` : ''}`);
        } else {
            req.flash('info', `No contracts could be approved. ${skippedCount} contract(s) skipped due to missing documents.`);
        }

        res.redirect('/admin/pending-contracts');

    } catch (error) {
        console.error('❌ Bulk approve contracts error:', error);
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
// controllers/adminController.js - ADD THESE METHODS

// NEW: Approve project
// NEW: Approve project and start Round 1




// NEW: Project verification workflow methods
exports.verifyProject = async (req, res) => {
  try {
    const projectId = req.params.projectId;
    
    const project = await Project.findById(projectId)
      .populate('customer', 'name email')
      .populate('bids');

    if (!project) {
      req.flash('error', 'Project not found');
      return res.redirect('/admin/all-projects');
    }

    res.render('admin/project-verification', {
      user: req.user,
      project: project,
      moment: require('moment')
    });
  } catch (error) {
    console.error('Project verification error:', error);
    req.flash('error', 'Error loading project verification page');
    res.redirect('/admin/all-projects');
  }
};

// NEW: Approve project and start bidding
exports.approveProject = async (req, res) => {
  try {
    const { projectId } = req.params;
    const { remarks } = req.body;

    const project = await Project.findById(projectId);
    if (!project) {
      req.flash('error', 'Project not found');
      return res.redirect('/admin/all-projects');
    }

    // Use the new method from Project model
    await project.approveByAdmin(req.user._id);

    // Notify customer
    const Notice = require('../models/Notice');
    await Notice.create({
      title: `Project Approved - ${project.title}`,
      content: `Your project "${project.title}" has been approved by admin and bidding is now active.${remarks ? ` Admin Remarks: ${remarks}` : ''}`,
      targetAudience: 'customer',
      specificUser: project.customer,
      noticeType: 'success',
      isActive: true,
      startDate: new Date(),
      endDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    });

    // Notify all sellers
    await Notice.create({
      title: `New Project Available - ${project.title}`,
      content: `A new project "${project.title}" is now available for bidding in ${project.category}.`,
      targetAudience: 'seller',
      noticeType: 'info',
      isActive: true,
      startDate: new Date(),
      endDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    });

    req.flash('success', 'Project approved successfully! Bidding is now active.');
    res.redirect('/admin/all-projects');
  } catch (error) {
    console.error('Approve project error:', error);
    req.flash('error', 'Error approving project');
    res.redirect('/admin/all-projects');
  }
};

// NEW: Reject project with remarks
exports.rejectProject = async (req, res) => {
  try {
    const { projectId } = req.params;
    const { remarks } = req.body;

    if (!remarks) {
      req.flash('error', 'Remarks are required for rejection');
      return res.redirect('/admin/all-projects');
    }

    const project = await Project.findById(projectId);
    if (!project) {
      req.flash('error', 'Project not found');
      return res.redirect('/admin/all-projects');
    }

    // Use the new method from Project model
    await project.rejectByAdmin(req.user._id, remarks);

    // Notify customer
    const Notice = require('../models/Notice');
    await Notice.create({
      title: `Project Rejected - ${project.title}`,
      content: `Your project "${project.title}" has been rejected by admin. Remarks: ${remarks}. Please edit and resubmit the project.`,
      targetAudience: 'customer',
      specificUser: project.customer,
      noticeType: 'error',
      isActive: true,
      startDate: new Date(),
      endDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    });

    req.flash('success', 'Project rejected successfully. Customer has been notified.');
    res.redirect('/admin/all-projects');
  } catch (error) {
    console.error('Reject project error:', error);
    req.flash('error', 'Error rejecting project');
    res.redirect('/admin/all-projects');
  }
};

// UPDATED: Dashboard to show pending projects
exports.getDashboard = async (req, res) => {
  try {
    const totalUsers = await User.countDocuments();
    const totalProjects = await Project.countDocuments();
    const totalBids = await Bid.countDocuments();
    const pendingContracts = await Contract.countDocuments({ status: 'pending-admin' });
    const activeProjects = await Project.countDocuments({ status: 'active' });
    const submittedBids = await Bid.countDocuments({ status: 'submitted' });

    const recentProjects = await Project.find()
      .populate('customer', 'name email')
      .sort({ createdAt: -1 })
      .limit(10);

    const pendingVerifications = await Contract.find({ status: 'pending-admin' })
      .populate('project', 'title')
      .populate('customer', 'name')
      .populate('seller', 'name companyName')
      .populate('bid', 'amount');

    // NEW: Get pending projects for verification
    const pendingProjects = await Project.find({ 
      adminStatus: 'pending' 
    })
    .populate('customer', 'name email')
    .sort({ createdAt: -1 })
    .limit(10);

    res.render('admin/dashboard', {
      user: req.user,
      stats: {
        totalUsers,
        totalProjects, 
        totalBids,
        pendingContracts,
        activeProjects,
        submittedBids,
        pendingProjects: pendingProjects.length
      },
      recentProjects,
      pendingVerifications,
      pendingProjects: pendingProjects || []
    });
  } catch (error) {
    console.error('Admin dashboard error:', error);
    res.status(500).render('error', { message: 'Error loading admin dashboard' });
  }
};

// UPDATED: Get all projects with new statuses
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















module.exports = exports;