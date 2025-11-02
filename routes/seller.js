const express = require('express');
const router = express.Router();
const sellerController = require('../controllers/sellerController');
const authController = require('../controllers/authController');
const { ensureAuthenticated, ensureSeller } = require('../middleware/auth');
const { upload, uploadProfileImage, uploadContracts, uploadDocuments } = require('../middleware/upload');

// Apply seller authentication to all routes
router.use(ensureAuthenticated);
router.use(ensureSeller);

// ==================== DASHBOARD & SYSTEM ====================
router.get('/dashboard', sellerController.getDashboard);
router.get('/pending-approval', sellerController.pendingPage);
router.get('/update-statuses', sellerController.updateStatuses);

// ==================== PROJECT BROWSING ====================
router.get('/find-bids', sellerController.getFindBids);
// Correct route - uses bid ID
// Make sure this route exists and matches your link
router.get('/bid/:id', sellerController.getBidDetails);

// NOT this (if you have it):
// router.get('/bid-details/:id', sellerController.getBidDetails);

// NOT project ID
// router.get('/seller/bid-details/:projectId', ...); // Wrong

// ==================== BID MANAGEMENT ====================
router.get('/my-bids', sellerController.getMyBids);
router.post('/withdraw-bid/:id', sellerController.withdrawBid);

// ==================== MULTI-ROUND BIDDING SYSTEM ====================

// ROUND 1 BIDDING
router.get('/project/:projectId/bid', sellerController.getRound1BiddingForm);
router.post('/project/:projectId/submit-round1-bid', sellerController.submitRound1Bid);
router.post('/update-bid/:id', sellerController.updateBid);

// ROUND 2 BIDDING
router.get('/project/:projectId/round2-bidding', sellerController.getRound2BiddingForm);
router.post('/project/:projectId/submit-round2-bid', sellerController.submitRound2Bid);
router.post('/update-bid-round2/:bidId', sellerController.updateBidForRound2);

// DEFECTED BID RESUBMISSION
router.get('/bid/:bidId/defected-resubmission', sellerController.getDefectedBidResubmission);
router.post('/bid/:bidId/resubmit-defected', sellerController.resubmitDefectedBid);

// WAITING QUEUE MANAGEMENT
router.get('/bid/:bidId/waiting-queue', sellerController.getWaitingQueue);

// ==================== CONTRACT MANAGEMENT ====================
router.get('/contract-details/:bidId', sellerController.getContractDetails);
router.post('/upload-contract', upload.single('contract'), sellerController.uploadContract);

// Contract Downloads
router.get('/download-contract-template/:bidId', sellerController.downloadContractTemplate);
router.get('/download-customer-contract/:bidId', sellerController.downloadCustomerContract);
router.get('/download-final-certificate/:bidId', sellerController.downloadFinalCertificate);

// ==================== PROFILE MANAGEMENT ====================
router.get('/profile', sellerController.getProfile);
router.post('/update-profile', sellerController.updateProfile);
router.post('/update-profile-image', upload.single('profileImage'), sellerController.updateProfileImage);
router.post('/upload-company-document', upload.single('document'), sellerController.uploadCompanyDocument);

// ==================== NOTIFICATIONS & ANALYTICS ====================
router.get('/notices', sellerController.getNotices);
router.get('/notifications', sellerController.getNotifications);
router.get('/analytics', sellerController.getBidAnalytics);

module.exports = router;