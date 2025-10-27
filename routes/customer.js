const express = require('express');
const router = express.Router();
const customerController = require('../controllers/customerController');
const { protect, requireRole } = require('../middleware/auth');
const { upload, uploadImages, uploadDocuments, uploadSingle, uploadContracts } = require('../middleware/upload');

// Apply auth middleware to all customer routes
router.use(protect);
router.use(requireRole('customer'));

// Dashboard and Navigation
router.get('/dashboard', customerController.getDashboard);
router.get('/my-projects', customerController.getMyProjects);
router.get('/bids', customerController.getBids);
router.get('/won-projects', customerController.getWonProjects);
router.get('/profile', customerController.getProfile);
router.post('/profile', customerController.updateProfile);
router.post('/profile/image', upload.single('profileImage'), customerController.updateProfileImage);
router.post('/change-password', customerController.changePassword);
router.get('/messages', customerController.getMessages);
router.get('/notices', customerController.getNotices);
router.get('/support', customerController.getSupport);

// Project Management - ENHANCED with verification workflow
router.get('/add-project', customerController.getAddProject);
router.get('/project-form/:category', customerController.getProjectForm);
router.post('/project-step1/:category', customerController.postProjectStep1);
router.post('/project-step2/:category', upload.fields([
  { name: 'images', maxCount: 10 },
  { name: 'documents', maxCount: 5 }
]), customerController.postProjectStep2);
router.post('/project-step3/:category', customerController.postProjectStep3);
// Edit project page
router.get('/edit-project/:id', customerController.editProject);

// Update project
router.post('/update-project/:id', upload.array('images'), customerController.updateProject);

// Delete project
router.post('/delete-project/:id', customerController.deleteProject);

// Remove image
router.post('/project/:projectId/remove-image/:imageId', customerController.removeImage);

// NEW: Project Verification and Resubmission
router.post('/project/:projectId/submit-verification', customerController.submitForVerification);
router.post('/project/:projectId/edit-resubmit', customerController.editAndResubmitProject);

// Project Details and Bids
router.get('/project/:id', customerController.getProjectDetails);
router.get('/project-bids/:projectId', customerController.getProjectBids);
router.post('/select-bid/:bidId', customerController.selectBid);

// File Management
router.post('/project/:projectId/add-image', upload.single('image'), customerController.addProjectImage);
router.post('/project/:projectId/remove-image/:publicId', customerController.removeProjectImage);
router.post('/project/:projectId/remove-document/:publicId', customerController.removeProjectDocument);

// NEW: Multi-Round Bidding System Routes
router.get('/project/:projectId/round1-selection', customerController.getRound1Selection);
router.post('/project/:projectId/select-top3', customerController.selectTop3);
router.get('/project/:projectId/round2-selection', customerController.getRound2Bids);
router.post('/project/:projectId/select-winner', customerController.selectWinner);

// Contract Management
router.get('/contract-status/:projectId', customerController.getContractStatus);
router.get('/view-contract/:projectId', customerController.viewContract);
router.post('/upload-customer-contract', uploadContracts.single('contract'), customerController.uploadCustomerContract);

// Document Downloads
router.get('/download-contract-template/:bidId', customerController.downloadContractTemplate);

router.get('/download-certificate/:bidId', customerController.downloadCertificate);

// NEW: Status Updates
router.get('/update-statuses', customerController.updateStatuses);

// Contracts
router.get('/download-customer-contract/:bidId', customerController.downloadCustomerContract);
router.get('/download-seller-contract/:bidId', customerController.downloadSellerContract);

// Certificates
router.get('/download-customer-certificate/:bidId', customerController.downloadCustomerCertificate);
router.get('/download-seller-certificate/:bidId', customerController.downloadSellerCertificate);
router.get('/download-final-certificate/:bidId', customerController.downloadFinalCertificate);



module.exports = router;