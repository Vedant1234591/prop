const express = require("express");
const router = express.Router();
const adminController = require("../controllers/adminController");
const { ensureAuthenticated, ensureAdmin } = require("../middleware/auth");

// Apply admin middleware to all routes
router.use(ensureAuthenticated, ensureAdmin);

// Dashboard
router.get("/dashboard", adminController.getDashboard);

// User Management
router.get("/all-users", adminController.getAllUsers);
router.get("/users/:userId", adminController.getUserDetails);
router.post("/users/:userId/toggle-status", adminController.toggleUserStatus);
router.post("/users/:userId/update-role", adminController.updateUserRole);

// Project Management
router.get("/all-projects", adminController.getAllProjects);
router.get("/projects/:id", adminController.getProjectDetails);
router.post(
  "/projects/:projectId/force-close",
  adminController.forceCloseBidding
);

// Bid Management
router.get("/all-bids", adminController.getAllBids);

// Contract Management - COMPLETE ROUTES
router.get("/pending-contracts", adminController.getPendingContracts);
router.get("/contracts/:contractId", adminController.getContractDetails);
router.post("/contracts/:contractId/approve", adminController.approveContract);
router.post("/contracts/:contractId/reject", adminController.rejectContract);
router.post("/contracts/bulk-approve", adminController.bulkApproveContracts);

// Contract Document Downloads
router.get(
  "/contracts/:contractId/download-customer",
  adminController.downloadCustomerContract
);
router.get(
  "/contracts/:contractId/download-seller",
  adminController.downloadSellerContract
);
router.get(
  "/contracts/:contractId/template/:party",
  adminController.downloadContractTemplate
);

// System Management
router.get("/system-status", adminController.getSystemStatus);
router.post("/auto-process-all", adminController.autoProcessAll);

// Notice Management
router.get("/notices", adminController.getNotices);
router.post("/notices", adminController.createNotice);
router.post("/notices/:noticeId/update", adminController.updateNotice);
router.post("/notices/:noticeId/delete", adminController.deleteNotice);

module.exports = router;
