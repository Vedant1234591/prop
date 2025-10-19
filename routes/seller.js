const express = require('express');
const router = express.Router();
const sellerController = require('../controllers/sellerController');
const authController = require('../controllers/authController');
const { ensureAuthenticated, ensureSeller } = require('../middleware/auth');
const { upload, uploadProfileImage, uploadContracts, uploadDocuments } = require('../middleware/upload');

// Apply seller authentication to all routes
router.use(ensureAuthenticated);
router.use(ensureSeller);

// Dashboard and Navigation
router.get('/dashboard', sellerController.getDashboard);
router.get('/find-bids', sellerController.getFindBids);
router.get('/my-bids', sellerController.getMyBids);
router.get('/profile', sellerController.getProfile);
router.post('/profile', sellerController.updateProfile);
router.post('/profile/image', uploadProfileImage.single('image'), sellerController.updateProfileImage);
router.post('/profile/document', uploadDocuments.single('document'), sellerController.uploadCompanyDocument);
router.get('/notices', sellerController.getNotices);
router.get('/analytics', sellerController.getBidAnalytics);

// Bid Management - ENHANCED with round awareness
router.get('/bid-details/:id', sellerController.getBidDetails);
router.post('/apply-bid/:id', sellerController.postApplyBid); // Round 1 bidding
router.post('/update-bid/:id', sellerController.updateBid); // General bid update

// NEW: Round-specific bid updates
router.post('/update-bid-round2/:bidId', sellerController.updateBidForRound2);
router.post('/withdraw-bid/:id', sellerController.withdrawBid);

// Contract Management
router.get('/contract-details/:bidId', sellerController.getContractDetails);
router.post('/upload-contract', uploadContracts.single('contract'), sellerController.uploadContract);

// Document Downloads
router.get('/download-contract-template/:bidId', sellerController.downloadContractTemplate);
router.get('/download-customer-contract/:bidId', sellerController.downloadCustomerContract);
router.get('/download-final-certificate/:bidId', sellerController.downloadFinalCertificate);
router.get('/download-certificate/:bidId', sellerController.downloadCertificate);
router.get('/download-contract/:bidId', sellerController.downloadContract);

// NEW: Status Updates
router.get('/update-statuses', sellerController.updateStatuses);
// Seller Round 2 Bidding Routes// Round 2 Bidding Routes
router.get('/project/:projectId/round2-bidding', sellerController.getSellerRound2Bidding);
router.post('/project/:projectId/update-round2-bid', sellerController.updateRound2Bid);
module.exports = router;