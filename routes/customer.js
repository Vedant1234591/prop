const express = require('express');
const router = express.Router();
const customerController = require('../controllers/customerController');
const { protect, requireRole } = require('../middleware/auth');
const { upload, uploadImages, uploadDocuments, uploadSingle, uploadContracts } = require('../middleware/upload');

// Apply auth middleware to all customer routes
router.use(protect);
router.use(requireRole('customer'));

// ==================== DASHBOARD & NAVIGATION ====================
router.get('/dashboard', customerController.getDashboard);
router.get('/my-projects', customerController.getMyProjects);
router.get('/bids', customerController.getBids);
router.get('/won-projects', customerController.getWonProjects);
router.get('/profile', customerController.getProfile);
router.post('/profile', customerController.updateProfile);
router.post('/profile/image', upload.single('image'), customerController.updateProfileImage);
router.post('/change-password', customerController.changePassword);
router.get('/messages', customerController.getMessages);
router.get('/notices', customerController.getNotices);
router.get('/support', customerController.getSupport);

// ==================== PROJECT MANAGEMENT ====================
router.get('/add-project', customerController.getAddProject);
router.get('/project-form/:category', customerController.getProjectForm);
router.post('/project-step1/:category', customerController.postProjectStep1);
router.post('/project-step2/:category', upload.fields([
  { name: 'images', maxCount: 10 },
  { name: 'documents', maxCount: 5 }
]), customerController.postProjectStep2);
router.post('/project-step3/:category', customerController.postProjectStep3);

// Project CRUD Operations
router.get('/edit-project/:id', customerController.editProject);
router.post('/update-project/:id', upload.array('images'), customerController.updateProject);
router.post('/delete-project/:id', customerController.deleteProject);

// Project File Management
router.post('/project/:projectId/remove-image/:imageId', customerController.removeImage);
router.post('/project/:projectId/add-image', upload.single('image'), customerController.addProjectImage);
router.post('/project/:projectId/remove-image/:publicId', customerController.removeProjectImage);
router.post('/project/:projectId/remove-document/:publicId', customerController.removeProjectDocument);

// Project Verification and Resubmission
router.post('/project/:projectId/submit-verification', customerController.submitForVerification);
router.post('/project/:projectId/edit-resubmit', customerController.editAndResubmitProject);

// ==================== PROJECT DETAILS & BIDS ====================
router.get('/project/:id', customerController.getProjectDetails);
router.get('/project-bids/:projectId', customerController.getProjectBids);
router.post('/select-bid/:bidId', customerController.selectBid);

// ==================== MULTI-ROUND BIDDING SYSTEM ====================

// ROUND 1 SELECTION & DEFECT MANAGEMENT
router.get('/project/:projectId/round1-selection', customerController.getRound1Selection);
router.post('/project/:projectId/select-top3', customerController.selectTop3);
router.post('/project/:projectId/bid/:bidId/defect', customerController.defectBid);

// BID DETAILS & PROFILES
router.get('/project/:projectId/bid/:bidId/details', customerController.viewBidDetails);
router.get('/project/:projectId/bid/:bidId/profile', customerController.viewSellerProfile);

// ROUND 2 MANAGEMENT
router.get('/project/:projectId/round2-selection', customerController.getRound2Selection);
router.post('/project/:projectId/select-winner', customerController.selectWinner);
router.post('/project/:projectId/auto-complete-round2', customerController.autoCompleteRound2);

// ==================== CONTRACT MANAGEMENT ====================
router.get('/contract-status/:projectId', customerController.getContractStatus);
router.get('/view-contract/:projectId', customerController.viewContract);
router.get('/contract/:contractId/details', customerController.viewContractDetails);
router.post('/upload-customer-contract', uploadContracts.single('contract'), customerController.uploadCustomerContract);

// ==================== DOCUMENT DOWNLOADS ====================

// Contract Downloads
router.get('/download-contract-template/:bidId', customerController.downloadContractTemplate);
router.get('/download-customer-contract/:bidId', customerController.downloadCustomerContract);
router.get('/download-seller-contract/:bidId', customerController.downloadSellerContract);

// Certificate Downloads
router.get('/download-certificate/:bidId', customerController.downloadCertificate);
router.get('/download-customer-certificate/:bidId', customerController.downloadCustomerCertificate);
router.get('/download-seller-certificate/:bidId', customerController.downloadSellerCertificate);
router.get('/download-final-certificate/:bidId', customerController.downloadFinalCertificate);

// ==================== SYSTEM MANAGEMENT ====================
router.get('/update-statuses', customerController.updateStatuses);
router.get('/notifications', customerController.getNotifications);

module.exports = router;