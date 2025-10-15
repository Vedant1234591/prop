const express = require('express');
const router = express.Router();
const sellerController = require('../controllers/sellerController');
const { ensureAuthenticated, ensureSeller } = require('../middleware/auth');
const { upload, uploadProfileImage, uploadContracts, uploadDocuments } = require('../middleware/upload');

// Apply seller authentication to all routes
router.use(ensureAuthenticated);
router.use(ensureSeller);

// Dashboard routes
router.get('/dashboard', sellerController.getDashboard);
router.get('/analytics', sellerController.getBidAnalytics);

// Bid management routes
router.get('/find-bids', sellerController.getFindBids);
router.get('/bid-details/:id', sellerController.getBidDetails);
router.post('/apply-bid/:id', sellerController.postApplyBid);
router.get('/my-bids', sellerController.getMyBids);
router.post('/update-bid/:id', sellerController.updateBid);
router.post('/withdraw-bid/:id', sellerController.withdrawBid);

// Contract management routes
router.get('/contract-details/:bidId', sellerController.getContractDetails);

// ✅ FIXED CONTRACT ROUTES - CORRECT METHOD NAMES
router.post('/upload-contract', uploadContracts.single('contract'), sellerController.uploadContract);
router.get('/download-contract-template/:bidId', sellerController.downloadContractTemplate);
router.get('/download-customer-contract/:bidId', sellerController.downloadCustomerContract);
router.get('/download-final-certificate/:bidId', sellerController.downloadFinalCertificate);

// OLD ROUTES (Keep for backward compatibility)
router.get('/download-contract/:bidId', sellerController.downloadContract);
router.get('/download-certificate/:bidId', sellerController.downloadCertificate);

// Profile management routes
router.get('/profile', sellerController.getProfile);
router.post('/update-profile', sellerController.updateProfile);
router.post('/update-profile-image', uploadProfileImage.single('profileImage'), sellerController.updateProfileImage);
router.post('/upload-company-document', uploadDocuments.single('companyDocument'), sellerController.uploadCompanyDocument);

// Notices routes
router.get('/notices', sellerController.getNotices);

module.exports = router;