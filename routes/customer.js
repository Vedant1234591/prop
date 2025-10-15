const express = require('express');
const router = express.Router();
const customerController = require('../controllers/customerController');
const { protect, requireRole } = require('../middleware/auth');
const { upload, uploadImages, uploadDocuments, uploadSingle, uploadContracts } = require('../middleware/upload');

// Apply auth middleware to all customer routes
router.use(protect);
router.use(requireRole('customer'));

// Dashboard and main routes
router.get('/dashboard', customerController.getDashboard);
router.get('/my-projects', customerController.getMyProjects);
router.get('/bids', customerController.getBids);
router.get('/profile', customerController.getProfile);
router.get('/messages', customerController.getMessages);
router.get('/notices', customerController.getNotices);

// Profile management routes
router.post('/update-profile', customerController.updateProfile);
router.post('/update-profile-image', uploadSingle.single('profileImage'), customerController.updateProfileImage);
router.post('/change-password', customerController.changePassword);

// Project routes
router.get('/add-project', customerController.getAddProject);
router.get('/project-form/:category', customerController.getProjectForm);

// Project creation with Cloudinary file uploads
router.post('/project-step1/:category', customerController.postProjectStep1);
router.post('/project-step2/:category', 
    upload.fields([
        { name: 'images', maxCount: 10 },
        { name: 'documents', maxCount: 5 }
    ]), 
    customerController.postProjectStep2
);
router.post('/project-step3/:category', customerController.postProjectStep3);

// Project management routes
router.get('/project/:id', customerController.getProjectDetails);
router.get('/edit-project/:id', customerController.editProject);
router.post('/update-project/:id', uploadImages.array('images'), customerController.updateProject);
router.post('/delete-project/:id', customerController.deleteProject);

// Project image management routes
router.post('/project/:projectId/add-image', uploadSingle.single('image'), customerController.addProjectImage);
router.post('/project/:projectId/remove-image/:publicId', customerController.removeProjectImage);
router.post('/project/:projectId/remove-document/:publicId', customerController.removeProjectDocument);

// Bid management routes
router.post('/select-bid/:bidId', customerController.selectBid);
router.get('/project-bids/:projectId', customerController.getProjectBids);

// ✅ FIXED CONTRACT ROUTES - CORRECT METHOD NAMES
router.post('/upload-customer-contract', uploadContracts.single('contract'), customerController.uploadCustomerContract);
router.get('/download-contract-template/:bidId', customerController.downloadContractTemplate);
router.get('/download-seller-contract/:bidId', customerController.downloadSellerContract);
router.get('/download-final-certificate/:bidId', customerController.downloadFinalCertificate);

// OLD ROUTES (Keep for backward compatibility)
router.get('/download-contract/:bidId', customerController.downloadContract);
router.get('/download-certificate/:bidId', customerController.downloadCertificate);
router.get('/view-contract/:projectId', customerController.viewContract);

// Contract status and management routes
router.get('/contract-status/:projectId', customerController.getContractStatus);
router.get('/won-projects', customerController.getWonProjects);

const statusAutomation = require('../services/statusAutomation');

// Manual status update route
router.get('/update-statuses', async (req, res) => {
    try {
        const result = await statusAutomation.updateAllProjectStatuses();
        req.flash('success', 
            `Statuses updated! ${result.draftedToActive} projects activated, ` +
            `${result.biddingClosed} bidding closed`
        );
        res.redirect('/customer/my-projects');
    } catch (error) {
        req.flash('error', 'Error updating statuses: ' + error.message);
        res.redirect('/customer/my-projects');
    }
});

// Auto-process projects route for customer
router.get('/auto-process-projects', async (req, res) => {
    try {
        const Project = require('../models/Project');
        await Project.autoProcessProjects();
        
        req.flash('success', 'Projects auto-processed successfully!');
        res.redirect('/customer/my-projects');
    } catch (error) {
        req.flash('error', 'Error auto-processing projects: ' + error.message);
        res.redirect('/customer/my-projects');
    }
});

module.exports = router;