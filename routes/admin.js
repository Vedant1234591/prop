const express = require("express");
const router = express.Router();
const adminController = require("../controllers/adminController");
const blogController = require("../controllers/blogController");const contactController = require('../controllers/contactController');
const { ensureAuthenticated, ensureAdmin } = require("../middleware/auth");

// Apply admin middleware to all routes
router.use(ensureAuthenticated, ensureAdmin);


// Public route - contact form submission


// Admin routes
router.get('/contact-submissions', contactController.getContactSubmissions);
router.get('/contact-submissions/:id', contactController.getContactSubmission);
router.post('/contact-submissions/:id/update', contactController.updateContactStatus);
router.post('/contact-submissions/:id/delete', contactController.deleteContactSubmission);
router.get('/contact-stats', contactController.getContactStats);
// Dashboard
router.get("/dashboard", adminController.getDashboard);
// verify seller
router.post("/users/:id/verify-seller", adminController.VerifySeller);
// User Management
router.get('/all-users', adminController.getAllUsers);
router.get('/users/:userId', adminController.getUserDetails);
router.post('/users/:userId/toggle-status', adminController.toggleUserStatus);
router.post('/users/:userId/update-role', adminController.updateUserRole);

// Project Management - ENHANCED with verification workflow
router.get('/all-projects', adminController.getAllProjects);
router.get('/projects/:id', adminController.getProjectDetails);
router.get('/projects/:projectId/verify', adminController.verifyProject);
router.post('/projects/:projectId/approve', adminController.approveProject);
router.post('/projects/:projectId/reject', adminController.rejectProject);
router.post('/projects/:projectId/force-close', adminController.forceCloseBidding);

// Bid Management
router.get('/all-bids', adminController.getAllBids);

// Contract Management - ENHANCED with rejection workflow

// Contract routes - THESE MUST BE DEFINED BEFORE ANY DYNAMIC ROUTES
router.get('/pending-contracts', adminController.getPendingContracts);
router.get('/contracts/:contractId', adminController.getContractDetails);


router.post('/contracts/:contractId/reject', adminController.rejectContract);
router.post('/contracts/:contractId/reject-with-remarks', adminController.rejectContractWithRemarks);
router.post('/bulk-approve-contracts', adminController.bulkApproveContracts);

// Document Downloads
router.get('/contracts/:contractId/download-customer', adminController.downloadCustomerContract);
router.get('/contracts/:contractId/download-seller', adminController.downloadSellerContract);
router.get('/contracts/:contractId/download-template/:party', adminController.downloadContractTemplate);

// System Management
router.get('/system-status', adminController.getSystemStatus);
router.post('/auto-process-all', adminController.autoProcessAll);

// Notice Management
router.get('/notices', adminController.getNotices);
router.post('/notices', adminController.createNotice);
router.get('/create-blog',blogController.showCreateForm);
router.post('/create-blog',blogController.createBlog);
router.post('/notices/:noticeId/update', adminController.updateNotice);
router.post('/notices/:noticeId/delete', adminController.deleteNotice);

// Certificate Generation
router.post('/generate-certificate/:bidId', adminController.generateCertificate);



router.post('/contracts/:contractId/approve', adminController.approveContract);
router.post('/contracts/:contractId/reject-customer', adminController.rejectCustomerContract);
router.post('/contracts/:contractId/reject-seller', adminController.rejectSellerContract);
router.get('/contracts/:contractId/download-customer-certificate', adminController.downloadCustomerCertificate);
router.get('/contracts/:contractId/download-seller-certificate', adminController.downloadSellerCertificate);
router.get('/contracts/:contractId/download-final-certificate', adminController.downloadFinalCertificate);
module.exports = router;