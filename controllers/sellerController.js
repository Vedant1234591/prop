// controllers/sellerController.js
const Project = require("../models/Project");
const Bid = require("../models/Bid");
const User = require("../models/User");
const Notice = require("../models/Notice");
const Contract = require("../models/Contract");
const Seller = require("../models/Seller");
const cloudinary = require("../config/cloudinary");

// const cloudinary = require("../config/cloudinary");
const mongoose = require("mongoose");

// Import status automation
const statusAutomation = require("../services/statusAutomation");

// Seller Dashboard - Enhanced with real-time updates
exports.pendingPage = async (req, res) => {
  res.render("seller/pending");
};
// const mongoose = require("mongoose");
// const moment = require("moment");
// const Seller = require("../../models/seller");
// const Project = require("../../models/project");
// const Bid = require("../../models/bid");
// const Contract = require("../../models/contract");
// const Notice = require("../../models/notice");
// const statusAutomation = require("../../utils/statusAutomation");

// ======================== SELLER DASHBOARD ========================
exports.getDashboard = async (req, res) => {
  try {
    const sellerId = req.session.userId;

    if (!sellerId) {
      req.flash("error", "Please log in to access the dashboard");
      return res.redirect("/auth/login");
    }

    const seller = await Seller.findOne({ userId: sellerId });
    if (!seller || !seller.adminVerified) {
      return res.redirect("/seller/pending-approval");
    }

    console.log("=== SELLER DASHBOARD DEBUG ===");
    console.log("Seller ID:", sellerId);

    // ✅ Update all project statuses before rendering dashboard
    await statusAutomation.updateAllProjectStatuses();

    // ✅ Bid statistics aggregation
    const bidStats = await Bid.aggregate([
      { $match: { seller: new mongoose.Types.ObjectId(sellerId) } },
      {
        $group: {
          _id: "$status",
          count: { $sum: 1 },
          totalAmount: { $sum: "$amount" },
        },
      },
    ]);

    console.log("Bid stats:", bidStats);

    // ✅ Initialize default stats object
    const stats = {
      submitted: { count: 0, amount: 0 },
      won: { count: 0, amount: 0 },
      "in-progress": { count: 0, amount: 0 },
      lost: { count: 0, amount: 0 },
      completed: { count: 0, amount: 0 },
    };

    bidStats.forEach((stat) => {
      if (stats[stat._id]) {
        stats[stat._id].count = stat.count;
        stats[stat._id].amount = stat.totalAmount || 0;
      }
    });

    // ✅ Totals and derived metrics
    const totalBids = bidStats.reduce((sum, stat) => sum + stat.count, 0);
    const totalStats = {
      totalBids,
      totalAmount: bidStats.reduce((sum, stat) => sum + (stat.totalAmount || 0), 0),
      successRate:
        stats.won.count > 0
          ? Math.round((stats.won.count / (stats.submitted.count || 1)) * 100)
          : 0,
    };

    // ✅ Get active projects for seller
    const activeProjects = await Project.find({
      status: { $in: ["drafted", "in-progress"] },
      "bidSettings.bidEndDate": { $gt: new Date() },
      "bidSettings.isActive": true,
    })
      .populate("customer", "name companyName")
      .sort({ createdAt: -1 })
      .limit(5);

    // ✅ Seller’s latest bids
    const latestBids = await Bid.find({ seller: sellerId })
      .populate("project", "title category status bidSettings")
      .sort({ createdAt: -1 })
      .limit(5);

    // ✅ Find pending contracts
    const wonBidsWithContracts = await Bid.find({
      seller: sellerId,
      status: "won",
    })
      .populate("project", "title category")
      .populate("customer", "name email");

    const pendingContracts = [];
    for (const bid of wonBidsWithContracts) {
      const contract = await Contract.findOne({
        bid: bid._id,
        status: { $in: ["pending-seller", "pending-admin"] },
      });
      if (contract) pendingContracts.push({ bid, contract });
    }

    // ✅ Active notices
    const latestNotices = await Notice.find({
      targetAudience: "seller" ,
      isActive: true,
      startDate: { $lte: new Date() },
      $or: [{ endDate: { $gte: new Date() } }, { endDate: null }],
    })
      .sort({ createdAt: -1 })
      .limit(3);

    const userData = req.session.user || { name: "Seller", email: "" };

    // ✅ Unread bid count for notification badge
    const bidCount = await Bid.countDocuments({
      seller: sellerId,
      status: "submitted",
    });

    // ✅ Render page
    res.render("seller/dashboard", {
      user: userData,
      currentPage: "dashboard",
      stats,
      totalStats,
      activeProjects,
      latestBids,
      latestNotices,
      pendingContracts,
      bidCount,
      // moment,
    });
  } catch (error) {
    console.error("Seller dashboard error:", error);
    req.flash("error", "Error loading dashboard: " + error.message);
    res.redirect("/auth/login");
  }
};

// ======================== FIND BIDS PAGE ========================
// exports.getFindBids = async (req, res) => {
//   try {
//     const sellerId = req.session.userId;

//     if (!sellerId) {
//       req.flash("error", "Please log in to view projects");
//       return res.redirect("/auth/login");
//     }

//     const { state, city, category } = req.query;
//     const filters = {};

//     if (state) filters["location.state"] = new RegExp(state, "i");
//     if (city) filters["location.city"] = new RegExp(city, "i");
//     if (category) filters.category = category;

//     // ✅ Always update project statuses before listing
//     await statusAutomation.updateAllProjectStatuses();

//     const activeProjects = await Project.find({
//       ...filters,
//       status: { $in: ["drafted", "in-progress"] },
//       "bidSettings.bidEndDate": { $gt: new Date() },
//       "bidSettings.isActive": true,
//     })
//       .populate("customer", "name companyName")
//       .populate("bids")
//       .sort({ createdAt: -1 });

//     const userData = req.session.user || { name: "Seller", email: "" };

//     // ✅ Bid count for notification
//     const bidCount = await Bid.countDocuments({
//       seller: sellerId,
//       status: "submitted",
//     });

//     // ✅ Render find-bids page
//     res.render("seller/find-bids", {
//       user: userData,
//       currentPage: "find-bids",
        

//       projects: activeProjects || [],
//       filters: { state, city, category },
//       bidCount,
//       moment,
//     });
//   } catch (error) {
//     console.error("Find bids error:", error);
//     req.flash("error", "Error loading projects: " + error.message);
//     res.redirect("/seller/dashboard");
//   }
// };


exports.getFindBids = async (req, res) => {
  try {
    const sellerId = req.session.userId;

    if (!sellerId) {
      req.flash("error", "Please log in to view projects");
      return res.redirect("/auth/login");
    }

   const { state, city, category, pincode } = req.query;
const filters = {};

// Helper to safely escape regex special characters
const escapeRegex = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// --- 1️⃣ Handle State ---
if (state) {
  const cleanState = state.trim();
  filters["location.state"] = { $regex: new RegExp(escapeRegex(cleanState), "i") };
}

// --- 2️⃣ Handle City/District ---
if (city) {
  const cleanCity = city
    .replace(/\s*\([^)]*\)\s*/g, "") // remove anything inside parentheses
    .trim();

  // Match either "Kaimur" or "Kaimur (Bhabua)" or "Bhabua"
  filters["$or"] = [
    { "location.city": { $regex: new RegExp(escapeRegex(cleanCity), "i") } },
    { "location.city": { $regex: new RegExp(`${escapeRegex(cleanCity)}\\s*\\([^)]*\\)`, "i") } },
    { "location.city": { $regex: new RegExp(`\\([^)]*${escapeRegex(cleanCity)}[^)]*\\)`, "i") } },
  ];
}

// --- 3️⃣ Handle Category ---
if (category) {
  filters.category = { $regex: new RegExp(escapeRegex(category), "i") };
}

// --- 4️⃣ Handle Pincode ---
if (pincode && /^\d{6}$/.test(pincode)) {
  filters["location.pincode"] = pincode;
}


    // ✅ Always update project statuses before listing
    await statusAutomation.updateAllProjectStatuses();

    const activeProjects = await Project.find({
      ...filters,
      status: { $in: ["drafted", "in-progress"] },
      "bidSettings.bidEndDate": { $gt: new Date() },
      "bidSettings.isActive": true,
    })
      .populate("customer", "name companyName")
      .populate("bids")
      .sort({ createdAt: -1 });

    const userData = req.session.user || { name: "Seller", email: "" };

    const bidCount = await Bid.countDocuments({
      seller: sellerId,
      status: "submitted",
    });

    res.render("seller/find-bids", {
      user: userData,
      currentPage: "find-bids",
      projects: activeProjects || [],
      filters: { state, city, category },
      bidCount,
      moment,
    });
  } catch (error) {
    console.error("Find bids error:", error);
    req.flash("error", "Error loading projects: " + error.message);
    res.redirect("/seller/dashboard");
  }
};





// Bid Details - Enhanced with real-time updates
exports.getBidDetails = async (req, res) => {
  try {
    const projectId = req.params.id;
    const sellerId = req.session.userId;

    console.log("=== BID DETAILS DEBUG ===");
    console.log("Project ID:", projectId);
    console.log("Seller ID:", sellerId);

    if (!sellerId) {
      req.flash("error", "Please log in to view project details");
      return res.redirect("/auth/login");
    }

    await statusAutomation.updateAllProjectStatuses();

    const project = await Project.findById(projectId)
      .populate("customer", "name email phone companyName")
      .populate("bids");

    if (!project) {
      req.flash("error", "Project not found");
      return res.redirect("/seller/find-bids");
    }

    // Check if seller already bid on this project
    const existingBid = await Bid.findOne({
      project: projectId,
      seller: sellerId,
    });

    const userData = req.session.user || { name: "Seller", email: "" };

    // Get bid count for notifications
    const bidCount = await Bid.countDocuments({
      seller: sellerId,
      status: "submitted",
    });

    res.render("seller/bid-details", {
      user: userData,
      currentPage: "find-bids",
      project: project,
      existingBid: existingBid,
      bidCount: bidCount,
      moment: require("moment"),
    });
  } catch (error) {
    console.error("Bid details error:", error);
    req.flash("error", "Error loading project details: " + error.message);
    res.redirect("/seller/find-bids");
  }
};



// Update Bid
exports.updateBid = async (req, res) => {
  try {
    const bidId = req.params.id;
    const sellerId = req.session.userId;

    if (!sellerId) {
      req.flash("error", "Please log in to update bid");
      return res.redirect("/auth/login");
    }

    const bid = await Bid.findOne({ _id: bidId, seller: sellerId });

    if (!bid) {
      req.flash("error", "Bid not found");
      return res.redirect("/seller/my-bids");
    }

    if (bid.status !== "submitted") {
      req.flash("error", "Only submitted bids can be updated");
      return res.redirect("/seller/my-bids");
    }

    // Check if project is still accepting bids
    const project = await Project.findById(bid.project);
    if (
      !project.bidSettings.isActive ||
      new Date() > project.bidSettings.bidEndDate
    ) {
      req.flash("error", "Bidding for this project has closed");
      return res.redirect("/seller/my-bids");
    }

    // Validate amount
    const bidAmount = parseFloat(req.body.amount);
    if (isNaN(bidAmount) || bidAmount < project.bidSettings.startingBid) {
      req.flash(
        "error",
        `Bid amount must be a number and at least $${project.bidSettings.startingBid}`
      );
      return res.redirect("/seller/my-bids");
    }

    // Validate proposal
    if (!req.body.proposal || req.body.proposal.trim().length < 10) {
      req.flash("error", "Proposal must be at least 10 characters long");
      return res.redirect("/seller/my-bids");
    }

    bid.amount = bidAmount;
    bid.proposal = req.body.proposal.trim();
    bid.revisionCount += 1;
    bid.lastRevisedAt = new Date();
    bid.updatedAt = new Date();

    await bid.save();

    req.flash("success", "Bid updated successfully!");
    res.redirect("/seller/my-bids");
  } catch (error) {
    console.error("Update bid error:", error);
    req.flash("error", "Error updating bid: " + error.message);
    res.redirect("/seller/my-bids");
  }
};

// Withdraw Bid
exports.withdrawBid = async (req, res) => {
  try {
    const bidId = req.params.id;
    const sellerId = req.session.userId;

    if (!sellerId) {
      req.flash("error", "Please log in to withdraw bid");
      return res.redirect("/auth/login");
    }

    const bid = await Bid.findOne({ _id: bidId, seller: sellerId });

    if (!bid) {
      req.flash("error", "Bid not found");
      return res.redirect("/seller/my-bids");
    }

    if (bid.status !== "submitted") {
      req.flash("error", "Only submitted bids can be withdrawn");
      return res.redirect("/seller/my-bids");
    }

    // Check if project is still accepting bids
    const project = await Project.findById(bid.project);
    if (
      !project.bidSettings.isActive ||
      new Date() > project.bidSettings.bidEndDate
    ) {
      req.flash("error", "Bidding for this project has closed");
      return res.redirect("/seller/my-bids");
    }

    bid.status = "cancelled";
    bid.updatedAt = new Date();
    await bid.save();

    // Remove bid reference from project
    await Project.findByIdAndUpdate(bid.project, {
      $pull: { bids: bidId },
    });

    req.flash("success", "Bid withdrawn successfully!");
    res.redirect("/seller/my-bids");
  } catch (error) {
    console.error("Withdraw bid error:", error);
    req.flash("error", "Error withdrawing bid: " + error.message);
    res.redirect("/seller/my-bids");
  }
};

// Seller Profile
// exports.getProfile = async (req, res) => {
//   try {
//     const sellerId = req.session.userId;

//     if (!sellerId) {
//       req.flash("error", "Please log in to view profile");
//       return res.redirect("/auth/login");
//     }

//     const user = await User.findById(sellerId);

//     if (!user) {
//       req.flash("error", "User not found");
//       return res.redirect("/seller/dashboard");
//     }

//     const userData = req.session.user || { name: "Seller", email: "" };

//     // Get bid count for notifications
//     const bidCount = await Bid.countDocuments({
//       seller: sellerId,
//       status: "submitted",
//     });

//     res.render("seller/profile", {
//       user: userData,
//       currentPage: "profile",
//       profile: user,
//       bidCount: bidCount,
//     });
//   } catch (error) {
//     console.error("Seller profile error:", error);
//     req.flash("error", "Error loading profile: " + error.message);
//     res.redirect("/seller/dashboard");
//   }
// };

exports.getProfile = async (req, res) => {
  try {
    const sellerId = req.session.userId;

    if (!sellerId) {
      req.flash("error", "Please log in to view your profile");
      return res.redirect("/auth/login");
    }

    const user = await User.findById(sellerId);
    if (!user) {
      req.flash("error", "User not found");
      return res.redirect("/seller/dashboard");
    }

    // Fetch Seller details if applicable
    const seller = await Seller.findOne({ userId: sellerId });

    // Fetch bid count for top bar
    const bidCount = await Bid.countDocuments({
      seller: sellerId,
      status: "submitted",
    });

    res.render("seller/profile/profile", {
      user, // Base user data
      seller, // Extended seller details (optional)
      bidCount, // For notifications
      currentPage: "profile", // Sidebar active page
    });
  } catch (error) {
    console.error("❌ Error loading seller profile:", error);
    req.flash("error", "Error loading profile: " + error.message);
    res.redirect("/seller/dashboard");
  }
};

// Update Profile
exports.updateProfile = async (req, res) => {
  try {
    const sellerId = req.session.userId;

    if (!sellerId) {
      req.flash("error", "Please log in to update profile");
      return res.redirect("/auth/login");
    }

    const { name, phone, companyName, bio, yearsOfExperience, specialization } =
      req.body;

    const user = await User.findById(sellerId);
    if (!user) {
      req.flash("error", "User not found");
      return res.redirect("/seller/profile");
    }

    user.name = name;
    user.phone = phone;
    user.companyName = companyName;
    user.bio = bio;
    user.yearsOfExperience = yearsOfExperience;

    // Handle specialization as array
    if (specialization) {
      user.specialization = Array.isArray(specialization)
        ? specialization
        : specialization.split(",").map((s) => s.trim());
    }

    await user.save();

    // Update session user data
    req.session.user.name = name;
    if (companyName) req.session.user.companyName = companyName;

    req.flash("success", "Profile updated successfully!");
    res.redirect("/seller/profile");
  } catch (error) {
    console.error("Update profile error:", error);
    req.flash("error", "Error updating profile: " + error.message);
    res.redirect("/seller/profile");
  }
};

// Update Profile Image
// In sellerController.js - update the file upload functions

// Update Profile Image - FIXED
exports.updateProfileImage = async (req, res) => {
  try {
    const sellerId = req.session.userId;

    if (!sellerId) {
      req.flash("error", "Please log in to update profile image");
      return res.redirect("/auth/login");
    }

    console.log("=== UPDATE PROFILE IMAGE DEBUG ===");
    console.log("File received:", req.file);
    console.log("Request body:", req.body);

    if (!req.file) {
      req.flash("error", "Please select an image to upload");
      return res.redirect("/seller/profile");
    }

    const user = await User.findById(sellerId);

    if (!user) {
      req.flash("error", "User not found");
      return res.redirect("/seller/profile");
    }

    // Delete old profile image from Cloudinary if exists
    if (user.profileImage && user.profileImage.public_id) {
      try {
        await cloudinary.uploader.destroy(user.profileImage.public_id);
        console.log("Old profile image deleted");
      } catch (error) {
        console.error("Error deleting old profile image:", error);
      }
    }

    // Update user with new profile image
    user.profileImage = {
      public_id: req.file.filename,
      url: req.file.path,
      filename: req.file.originalname,
      bytes: req.file.size,
      uploadedAt: new Date(),
    };

    await user.save();

    // Update session user data
    req.session.user.profileImage = user.profileImage;

    req.flash("success", "Profile image updated successfully!");
    res.redirect("/seller/profile");
  } catch (error) {
    console.error("Update profile image error:", error);
    req.flash("error", "Error updating profile image: " + error.message);
    res.redirect("/seller/profile");
  }
};

// Upload Company Document - FIXED
exports.uploadCompanyDocument = async (req, res) => {
  try {
    const sellerId = req.session.userId;

    if (!sellerId) {
      req.flash("error", "Please log in to upload documents");
      return res.redirect("/auth/login");
    }

    console.log("=== UPLOAD COMPANY DOCUMENT DEBUG ===");
    console.log("File received:", req.file);
    console.log("Request body:", req.body);

    if (!req.file) {
      req.flash("error", "Please select a document to upload");
      return res.redirect("/seller/profile");
    }

    const user = await User.findById(sellerId);
    if (!user) {
      req.flash("error", "User not found");
      return res.redirect("/seller/profile");
    }

    const documentData = {
      public_id: req.file.filename,
      url: req.file.path,
      filename: req.file.originalname,
      documentType: req.body.documentType || "other",
      bytes: req.file.size,
      uploadedAt: new Date(),
    };

    // Initialize companyDocuments array if it doesn't exist
    if (!user.companyDocuments) {
      user.companyDocuments = [];
    }

    user.companyDocuments.push(documentData);
    await user.save();

    req.flash("success", "Document uploaded successfully!");
    res.redirect("/seller/profile");
  } catch (error) {
    console.error("Upload document error:", error);
    req.flash("error", "Error uploading document: " + error.message);
    res.redirect("/seller/profile");
  }
};

// Upload Contract - FIXED
// Enhanced upload seller contract
// Step 2: Upload Signed Seller Contract
// Fix the uploadContract method in sellerController
exports.uploadContract = async (req, res) => {
  try {
    const { bidId } = req.body;
    const sellerId = req.session.userId;

    console.log("=== UPLOAD SELLER CONTRACT DEBUG ===");
    console.log("Bid ID:", bidId);
    console.log("Seller ID:", sellerId);
    console.log("File received:", req.file);

    if (!req.file) {
      req.flash("error", "Please select a signed contract file");
      return res.redirect("back");
    }

    const bid = await Bid.findOne({ _id: bidId, seller: sellerId });
    if (!bid) {
      req.flash("error", "Bid not found");
      return res.redirect("/seller/my-bids");
    }

    const contract = await Contract.findOne({ bid: bidId });
    if (!contract) {
      req.flash("error", "Contract not found");
      return res.redirect("/seller/my-bids");
    }

    // Check if seller can upload (customer must have uploaded first)
    if (
      contract.status !== "pending-seller" ||
      !contract.customerSignedContract
    ) {
      req.flash(
        "error",
        "Cannot upload contract at this time. Wait for customer to upload first."
      );
      return res.redirect("/seller/my-bids");
    }

    // Update contract with signed document
    contract.sellerSignedContract = {
      public_id: req.file.filename,
      url: req.file.path,
      filename: req.file.originalname,
      bytes: req.file.size,
      uploadedAt: new Date(),
      signatureDate: new Date(),
      uploadedBy: "seller",
    };

    // Move to admin approval step
    contract.status = "pending-admin";
    contract.currentStep = 3;
    contract.updatedAt = new Date();

    await contract.save();

    console.log("✅ Seller contract uploaded successfully");

    // Notify admin
    const Notice = require("../models/Notice");
    await Notice.create({
      title: `Contract Ready for Approval - ${bid.project.title}`,
      content:
        "Both customer and seller have uploaded signed contracts. Please review and approve.",
      targetAudience: "admin",
      noticeType: "warning",
      isActive: true,
      startDate: new Date(),
      endDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    });

    req.flash(
      "success",
      "Contract uploaded successfully! Waiting for admin approval."
    );
    res.redirect("/seller/my-bids");
  } catch (error) {
    console.error("❌ Upload seller contract error:", error);
    req.flash("error", "Error uploading contract: " + error.message);
    res.redirect("back");
  }
};
// Seller Notices
exports.getNotices = async (req, res) => {
  try {
    const sellerId = req.session.userId;

    if (!sellerId) {
      req.flash("error", "Please log in to view notices");
      return res.redirect("/auth/login");
    }

    const notices = await Notice.find({
      targetAudience: "seller" ,
      isActive: true,
      startDate: { $lte: new Date() },
      $or: [{ endDate: { $gte: new Date() } }, { endDate: null }],
    }).sort({ createdAt: -1 });

    const userData = req.session.user || { name: "Seller", email: "" };

    // Get bid count for notifications
    const bidCount = await Bid.countDocuments({
      seller: sellerId,
      status: "submitted",
    });

    res.render("seller/notices", {
      user: userData,
      currentPage: "notices",
      notices: notices || [],
      bidCount: bidCount,
    });
  } catch (error) {
    console.error("Get notices error:", error);
    req.flash("error", "Error loading notices: " + error.message);
    res.redirect("/seller/dashboard");
  }
};

// Upload Contract

// Download Contract






// Download Certificate
exports.downloadCertificate = async (req, res) => {
  try {
    const { bidId } = req.params;
    const sellerId = req.session.userId;

    if (!sellerId) {
      req.flash("error", "Please log in to download certificate");
      return res.redirect("/auth/login");
    }

    const bid = await Bid.findOne({ _id: bidId, seller: sellerId });
    if (!bid) {
      req.flash("error", "Bid not found");
      return res.redirect("/seller/my-bids");
    }

    if (!bid.certificateGenerated || !bid.certificateUrl) {
      req.flash("error", "Certificate not yet generated");
      return res.redirect("/seller/my-bids");
    }

    // Redirect to certificate URL
    res.redirect(bid.certificateUrl);
  } catch (error) {
    console.error("Download certificate error:", error);
    req.flash("error", "Error downloading certificate: " + error.message);
    res.redirect("/seller/my-bids");
  }
};

// Get bid analytics
exports.getBidAnalytics = async (req, res) => {
  try {
    const sellerId = req.session.userId;

    if (!sellerId) {
      req.flash("error", "Please log in to view analytics");
      return res.redirect("/auth/login");
    }

    const analytics = await Bid.aggregate([
      { $match: { seller: new mongoose.Types.ObjectId(sellerId) } },
      {
        $group: {
          _id: "$status",
          count: { $sum: 1 },
          totalAmount: { $sum: "$amount" },
          avgAmount: { $avg: "$amount" },
        },
      },
    ]);

    const userData = req.session.user || { name: "Seller", email: "" };

    // Get bid count for notifications
    const bidCount = await Bid.countDocuments({
      seller: sellerId,
      status: "submitted",
    });

    res.render("seller/analytics", {
      user: userData,
      currentPage: "analytics",
      analytics: analytics,
      bidCount: bidCount,
    });
  } catch (error) {
    console.error("Bid analytics error:", error);
    req.flash("error", "Error loading analytics: " + error.message);
    res.redirect("/seller/dashboard");
  }
};

// View Contract Details
exports.getContractDetails = async (req, res) => {
  try {
    const { bidId } = req.params;
    const sellerId = req.session.userId;

    if (!sellerId) {
      req.flash("error", "Please log in to view contract details");
      return res.redirect("/auth/login");
    }

    const bid = await Bid.findOne({ _id: bidId, seller: sellerId })
      .populate("project", "title category description")
      .populate("customer", "name email phone companyName");

    if (!bid) {
      req.flash("error", "Bid not found");
      return res.redirect("/seller/my-bids");
    }

    const contract = await Contract.findOne({ bid: bidId });
    if (!contract) {
      req.flash("error", "Contract not found");
      return res.redirect("/seller/my-bids");
    }

    const userData = req.session.user || { name: "Seller", email: "" };

    // Get bid count for notifications
    const bidCount = await Bid.countDocuments({
      seller: sellerId,
      status: "submitted",
    });

    res.render("seller/contract-details", {
      user: userData,
      currentPage: "my-bids",
      bid: bid,
      contract: contract,
      bidCount: bidCount,
      moment: require("moment"),
    });
  } catch (error) {
    console.error("Contract details error:", error);
    req.flash("error", "Error loading contract details: " + error.message);
    res.redirect("/seller/my-bids");
  }
};
// Download contract template for seller

// Download final certificate for seller
exports.downloadFinalCertificate = async (req, res) => {
  try {
    const { bidId } = req.params;
    const sellerId = req.session.userId;

    console.log("📥 Download seller final certificate request:", {
      bidId,
      sellerId,
    });

    const bid = await Bid.findOne({ _id: bidId, seller: sellerId });
    if (!bid) {
      req.flash("error", "Bid not found");
      return res.redirect("/seller/my-bids");
    }

    const contract = await Contract.findOne({ bid: bidId });
    if (!contract || contract.status !== "completed") {
      req.flash("error", "Certificate not available yet");
      return res.redirect("/seller/my-bids");
    }

    // Check for seller certificate first, then final contract
    if (contract.sellerCertificate && contract.sellerCertificate.url) {
      console.log(
        "✅ Redirecting to seller certificate:",
        contract.sellerCertificate.url
      );
      res.redirect(contract.sellerCertificate.url);
    } else if (contract.finalContract && contract.finalContract.url) {
      console.log(
        "✅ Redirecting to final contract:",
        contract.finalContract.url
      );
      res.redirect(contract.finalContract.url);
    } else {
      req.flash("error", "Certificate not generated yet");
      res.redirect("/seller/my-bids");
    }
  } catch (error) {
    console.error("❌ Download certificate error:", error);
    req.flash("error", "Error downloading certificate");
    res.redirect("/seller/my-bids");
  }
};

exports.downloadContractTemplate = async (req, res) => {
  try {
    console.log("=== 📥 SELLER CONTRACT DOWNLOAD START ===");

    console.log("Raw req.params:", req.params);
    console.log("Raw req.params.bidId type:", typeof req.params.bidId);
    console.log("Raw req.session.userId:", req.session.userId);

    let bidId = req.params.bidId;
    const sellerId = req.session.userId;

    // 🧠 If bidId is an object (common bug when passed incorrectly)
    if (typeof bidId === "object" && bidId?._id) {
      console.warn("⚠️ bidId is an object, extracting _id:", bidId._id);
      bidId = bidId._id.toString();
    }

    console.log("🆔 Normalized bidId:", bidId, "| Type:", typeof bidId);

    if (!mongoose.Types.ObjectId.isValid(bidId)) {
      console.error("❌ Invalid bidId format:", bidId);
      req.flash("error", "Invalid bid ID format");
      return res.redirect("/seller/my-bids");
    }

    // 🔍 Verify bid ownership
    const bid = await Bid.findOne({ _id: bidId, seller: sellerId }).populate(
      "project"
    );
    console.log("🔎 Bid lookup result:", bid ? "✅ Found" : "❌ Not Found");

    if (!bid) {
      req.flash("error", "Unauthorized or invalid bid");
      return res.redirect("/seller/my-bids");
    }

    // 🔍 Get associated contract
    const contract = await Contract.findOne({ bid: bidId });
    console.log(
      "📄 Contract lookup result:",
      contract ? "✅ Found" : "❌ Not Found"
    );

    if (!contract || !contract.sellerTemplate?.url) {
      console.error("❌ Contract template missing or not yet generated");
      req.flash("error", "Contract template not available yet");
      return res.redirect("/seller/my-bids");
    }

    const fileUrl = contract.sellerTemplate.url;
    console.log("🔗 Seller Cloudinary file URL:", fileUrl);

    // 🌍 PUBLIC FILES: redirect directly
    if (fileUrl.includes("/upload/")) {
      console.log("🌍 Detected public Cloudinary file. Redirecting directly.");
      return res.redirect(fileUrl);
    }

    // 🔐 PRIVATE FILES: Generate signed download URL
    console.log(
      "🔒 Detected private Cloudinary file, generating signed URL..."
    );

    const match = fileUrl.match(/\/v\d+\/(.+?)(?:\.pdf)?$/);

    console.log("🔍 Full match array:", match);

    if (!match) {
      console.error(
        "❌ Failed to extract public_id from Cloudinary URL:",
        fileUrl
      );
      req.flash("error", "Invalid Cloudinary file path");
      return res.redirect("/seller/my-bids");
    }
    const publicId = contract.sellerTemplate.public_id
      ? contract.sellerTemplate.public_id
      : contract.sellerTemplate.url.split("/upload/")[1]?.split(".pdf")[0];

    console.log("📂 Extracted publicId:", publicId);

    // const publicId = match[1];
    console.log("🆔 Extracted public_id:", publicId);

    const signedUrl = cloudinary.utils.private_download_url(publicId, "pdf", {
      resource_type: "raw",
      type: "authenticated",
      attachment: true,
    });

    // 👈 This is important

    console.log("✅ Signed Cloudinary private download URL:", signedUrl);

    console.log("=== ✅ SELLER CONTRACT DOWNLOAD END ===");

    return res.redirect(signedUrl);
  } catch (error) {
    console.error("❌ Download seller contract error:", error);
    req.flash("error", "Error downloading seller contract: " + error.message);
    return res.redirect("/seller/my-bids");
  }
};


//uttkarsh
// exports.downloadContract = async (req, res) => {
//   try {
//     const { bidId } = req.params;
//     const sellerId = req.session.userId;

//     if (!sellerId) {
//       req.flash("error", "Please log in to download contract");
//       return res.redirect("/auth/login");
//     }

//     const bid = await Bid.findOne({ _id: bidId, seller: sellerId });
//     if (!bid) {
//       req.flash("error", "Bid not found");
//       return res.redirect("/seller/my-bids");
//     }

//     const contract = await Contract.findOne({ bid: bidId });
//     if (!contract) {
//       req.flash("error", "Contract not found");
//       return res.redirect("/seller/my-bids");
//     }

//     // Check if seller has access to this contract
//     if (!contract.sellerSignedContract || !contract.sellerSignedContract.url) {
//       req.flash("error", "Contract not available for download");
//       return res.redirect("/seller/my-bids");
//     }

//     // Redirect to Cloudinary URL for download
//     res.redirect(contract.sellerSignedContract.url);
//   } catch (error) {
//     console.error("Download contract error:", error);
//     req.flash("error", "Error downloading contract: " + error.message);
//     res.redirect("/seller/my-bids");
//   }
// };


// exports.downloadCustomerContract = async (req, res) => {
//   try {
//     const { bidId } = req.params;
//     const sellerId = req.session.userId;

//     const bid = await Bid.findOne({ _id: bidId, seller: sellerId });
//     if (!bid) {
//       req.flash("error", "Bid not found");
//       return res.redirect("/seller/my-bids");
//     }

//     const contract = await Contract.findOne({ bid: bidId });
//     if (
//       !contract ||
//       !contract.customerSignedContract ||
//       !contract.customerSignedContract.url
//     ) {
//       req.flash("error", "Customer contract not available yet");
//       return res.redirect("/seller/my-bids");
//     }

//     console.log(
//       "🔗 Customer contract URL:",
//       contract.customerSignedContract.url
//     );

//     // ✅ FIX: Transform URL for download
//     let downloadUrl = contract.customerSignedContract.url;
//     if (downloadUrl.includes("/upload/")) {
//       downloadUrl = downloadUrl.replace("/upload/", "/upload/fl_attachment/");
//     }

//     res.setHeader(
//       "Content-Disposition",
//       `attachment; filename="customer_contract_${bidId}.pdf"`
//     );
//     res.setHeader("Content-Type", "application/pdf");
//     res.redirect(downloadUrl);
//   } catch (error) {
//     console.error("❌ Download customer contract error:", error);
//     req.flash("error", "Error downloading customer contract");
//     res.redirect("/seller/my-bids");
//   }
// };




// NEW: Update bid for round 2

//


exports.downloadContract = async (req, res) => {
  console.log("📥 downloadContract (Seller Dashboard) called");

  try {
    const { bidId } = req.params;
    const sellerId = req.session.userId;

    // 1️⃣ Auth check
    if (!sellerId) {
      req.flash("error", "Please log in to download contract");
      return res.redirect("/auth/login");
    }

    // 2️⃣ Ensure seller owns this bid
    const bid = await Bid.findOne({ _id: bidId, seller: sellerId }).populate("project");
    if (!bid) {
      req.flash("error", "Unauthorized or invalid bid access");
      return res.redirect("/seller/my-bids");
    }

    // 3️⃣ Fetch the contract
    const contract = await Contract.findOne({ bid: bidId });
    if (!contract?.sellerSignedContract?.url) {
      req.flash("error", "Seller-signed contract not available yet");
      return res.redirect("/seller/my-bids");
    }

    const fileData = contract.sellerSignedContract;
    console.log("📄 Found seller contract record:", fileData);

    // 4️⃣ Extract Cloudinary public_id (if not stored)
    let publicId = fileData.public_id;
    if (!publicId) {
      const urlPart = fileData.url.split("/upload/")[1];
      publicId = urlPart?.split(".pdf")[0];
    }

    console.log("📂 Extracted publicId:", publicId);

    // 5️⃣ Generate secure, signed Cloudinary URL for download
    const signedUrl = cloudinary.utils.private_download_url(publicId, null, {
      resource_type: "raw", // ✅ matches your upload config (PDFs, DOCs, etc.)
      type: "upload",       // ✅ your uploads are standard type=upload, not authenticated
      attachment: true,     // ✅ forces browser download instead of preview
    });

    console.log("🔗 Signed Cloudinary URL generated:", signedUrl);

    // 6️⃣ Set headers for browser download
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="seller_contract_${bidId}.pdf"`
    );
    res.setHeader("Content-Type", "application/pdf");

    console.log("✅ Redirecting to signed Cloudinary download URL...");
    return res.redirect(signedUrl);

  } catch (error) {
    console.error("❌ Download contract error:", error);
    req.flash("error", "Error downloading contract: " + error.message);
    return res.redirect("/seller/my-bids");
  }
};




exports.downloadCustomerContract = async (req, res) => {
  console.log("📥 downloadCustomerContract (Seller Dashboard) called");

  try {
    const { bidId } = req.params;
    const sellerId = req.session.userId;

    // 1️⃣ Verify seller owns this bid
    const bid = await Bid.findOne({ _id: bidId, seller: sellerId }).populate("project");
    if (!bid) {
      req.flash("error", "Unauthorized or invalid bid access");
      return res.redirect("/seller/my-bids");
    }

    // 2️⃣ Find associated contract
    const contract = await Contract.findOne({ bid: bidId });
    if (!contract?.customerSignedContract?.url) {
      req.flash("error", "Customer contract not available yet");
      return res.redirect("/seller/my-bids");
    }

    const fileData = contract.customerSignedContract;
    console.log("📄 Found customer contract record:", fileData);

    // 3️⃣ Extract correct public_id
    let publicId = fileData.public_id;
    if (!publicId) {
      const urlPart = fileData.url.split("/upload/")[1];
      publicId = urlPart?.split(".pdf")[0];
    }

    console.log("📂 Extracted publicId:", publicId);

    // 4️⃣ Generate secure Cloudinary signed URL for download
    const signedUrl = cloudinary.utils.private_download_url(publicId, null, {
      resource_type: "raw", // ✅ matches your uploader config
      type: "upload",       // ✅ 'authenticated' would fail since your uploads use 'upload'
      attachment: true,     // ✅ triggers browser download
    });

    console.log("🔗 Signed Cloudinary download URL:", signedUrl);

    // 5️⃣ Set headers for proper PDF download
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="customer_contract_${bidId}.pdf"`
    );
    res.setHeader("Content-Type", "application/pdf");

    console.log("✅ Redirecting to signed URL...");
    return res.redirect(signedUrl);

  } catch (error) {
    console.error("❌ Download customer contract error:", error);
    req.flash("error", "Error downloading customer contract: " + error.message);
    return res.redirect("/seller/my-bids");
  }
};



exports.updateBidForRound = async (req, res) => {
  try {
    const { bidId } = req.params;
    const sellerId = req.session.userId;

    if (!sellerId) {
      req.flash("error", "Please log in to update bid");
      return res.redirect("/auth/login");
    }

    const bid = await Bid.findOne({ _id: bidId, seller: sellerId })
      .populate('project');

    if (!bid) {
      req.flash("error", "Bid not found");
      return res.redirect("/seller/my-bids");
    }

    // Check if bid is active in current round and round is active
    if (!bid.isActiveInRound || bid.project.biddingRounds.currentRound !== bid.round) {
      req.flash("error", "Cannot update bid in this round");
      return res.redirect("/seller/my-bids");
    }

    // Check if round is still active
    const roundEndDate = bid.round === 1 ? 
      bid.project.biddingRounds.round1.endDate : 
      bid.project.biddingRounds.round2.endDate;
    
    if (new Date() > roundEndDate) {
      req.flash("error", "Round has ended. Cannot update bid.");
      return res.redirect("/seller/my-bids");
    }

    // Validate amount
    const bidAmount = parseFloat(req.body.amount);
    if (isNaN(bidAmount) || bidAmount < bid.project.bidSettings.startingBid) {
      req.flash(
        "error",
        `Bid amount must be a number and at least $${bid.project.bidSettings.startingBid}`
      );
      return res.redirect("/seller/my-bids");
    }

    // Update bid
    bid.amount = bidAmount;
    bid.proposal = req.body.proposal.trim();
    bid.revisionCount += 1;
    bid.lastRevisedAt = new Date();
    bid.updatedAt = new Date();

    // Add revision history
    bid.revisions.push({
      round: bid.round,
      amount: bidAmount,
      proposal: req.body.proposal.trim(),
      revisedAt: new Date()
    });

    await bid.save();

    req.flash("success", `Bid updated successfully for Round ${bid.round}!`);
    res.redirect("/seller/my-bids");
  } catch (error) {
    console.error("Update bid error:", error);
    req.flash("error", "Error updating bid: " + error.message);
    res.redirect("/seller/my-bids");
  }
};


// NEW: Update bid for specific round
exports.updateBidForRound = async (req, res) => {
  try {
    const { bidId } = req.params;
    const sellerId = req.session.userId;

    if (!sellerId) {
      req.flash("error", "Please log in to update bid");
      return res.redirect("/auth/login");
    }

    const bid = await Bid.findOne({ _id: bidId, seller: sellerId })
      .populate('project');

    if (!bid) {
      req.flash("error", "Bid not found");
      return res.redirect("/seller/my-bids");
    }

    // Check if bid is active in current round and round is active
    if (!bid.isActiveInRound || bid.project.biddingRounds.currentRound !== bid.round) {
      req.flash("error", "Cannot update bid in this round");
      return res.redirect("/seller/my-bids");
    }

    // Check if round is still active
    const now = new Date();
    let roundEndDate;
    if (bid.round === 1) {
      roundEndDate = bid.project.biddingRounds.round1.endDate;
    } else if (bid.round === 2) {
      roundEndDate = bid.project.biddingRounds.round2.endDate;
    } else {
      req.flash("error", "Cannot update bid in Round 3");
      return res.redirect("/seller/my-bids");
    }
    
    if (now > roundEndDate) {
      req.flash("error", "Round has ended. Cannot update bid.");
      return res.redirect("/seller/my-bids");
    }

    // Validate amount
    const bidAmount = parseFloat(req.body.amount);
    if (isNaN(bidAmount) || bidAmount < bid.project.bidSettings.startingBid) {
      req.flash(
        "error",
        `Bid amount must be a number and at least $${bid.project.bidSettings.startingBid}`
      );
      return res.redirect("/seller/my-bids");
    }

    // Update bid and add revision
    bid.amount = bidAmount;
    bid.proposal = req.body.proposal.trim();
    await bid.addRevision(bid.round, bidAmount, req.body.proposal.trim());

    req.flash("success", `Bid updated successfully for Round ${bid.round}!`);
    res.redirect("/seller/my-bids");
  } catch (error) {
    console.error("Update bid error:", error);
    req.flash("error", "Error updating bid: " + error.message);
    res.redirect("/seller/my-bids");
  }
};



// NEW: Manual status update
exports.updateStatuses = async (req, res) => {
  try {
    const statusAutomation = require('../services/statusAutomation');
    const result = await statusAutomation.updateAllProjectStatuses();
    
    req.flash('success', 'Status updates completed successfully!');
    res.redirect('/seller/my-bids');
  } catch (error) {
    console.error('Status update error:', error);
    req.flash('error', 'Error updating statuses: ' + error.message);
    res.redirect('/seller/my-bids');
  }
};


// UPDATED: Apply bid with round awareness
exports.postApplyBid = async (req, res) => {
  try {
    const projectId = req.params.id;
    const sellerId = req.session.userId;

    if (!sellerId) {
      req.flash("error", "Please log in to submit a bid");
      return res.redirect("/auth/login");
    }

    // Basic validation
    if (!req.body.amount || !req.body.proposal) {
      req.flash("error", "Bid amount and proposal are required");
      return res.redirect(`/seller/bid-details/${projectId}`);
    }

    // Get project
    const project = await Project.findById(projectId);
    if (!project) {
      req.flash("error", "Project not found");
      return res.redirect("/seller/find-bids");
    }

    // Check if project is approved and in round 1
    if (project.adminStatus !== 'approved' || project.biddingRounds.currentRound !== 1) {
      req.flash("error", "Project is not accepting bids at this time");
      return res.redirect("/seller/find-bids");
    }

    // Check if bidding is open for round 1
    const now = new Date();
    if (project.biddingRounds.round1.status !== 'active' || now > project.biddingRounds.round1.endDate) {
      req.flash("error", "Round 1 bidding has closed");
      return res.redirect("/seller/find-bids");
    }

    // Check for existing bid in current round
    const existingBid = await Bid.findOne({
      project: projectId,
      seller: sellerId,
      round: 1
    });

    if (existingBid) {
      req.flash("error", "You have already submitted a bid for this project in Round 1");
      return res.redirect(`/seller/bid-details/${projectId}`);
    }

    // Validate amount
    const bidAmount = parseFloat(req.body.amount);
    if (isNaN(bidAmount) || bidAmount < project.bidSettings.startingBid) {
      req.flash(
        "error",
        `Bid amount must be a number and at least $${project.bidSettings.startingBid}`
      );
      return res.redirect(`/seller/bid-details/${projectId}`);
    }

    // Create bid for round 1
    const bidData = {
      project: projectId,
      seller: sellerId,
      customer: project.customer,
      amount: bidAmount,
      proposal: req.body.proposal.trim(),
      status: "submitted",
      round: 1,
      selectionStatus: "submitted",
      revisions: [{
        round: 1,
        amount: bidAmount,
        proposal: req.body.proposal.trim(),
        revisedAt: new Date()
      }],
      bidSubmittedAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const bid = await Bid.create(bidData);

    // Add to project
    project.bids.push(bid._id);
    await project.save();

    req.flash("success", "Bid submitted successfully for Round 1!");
    res.redirect("/seller/my-bids");
  } catch (error) {
    console.error("❌ Apply bid error:", error);
    req.flash("error", "Error submitting bid: " + error.message);
    res.redirect(`/seller/bid-details/${req.params.id}`);
  }
};

// NEW: Update bid for round 2
exports.updateBidForRound2 = async (req, res) => {
  try {
    const { bidId } = req.params;
    const sellerId = req.session.userId;

    if (!sellerId) {
      req.flash("error", "Please log in to update bid");
      return res.redirect("/auth/login");
    }

    const bid = await Bid.findOne({ _id: bidId, seller: sellerId })
      .populate('project');

    if (!bid) {
      req.flash("error", "Bid not found");
      return res.redirect("/seller/my-bids");
    }

    // Check if bid is in round 2 and active
    if (bid.round !== 2 || !bid.isActiveInRound || bid.selectionStatus !== 'selected-round2') {
      req.flash("error", "Cannot update bid in this round");
      return res.redirect("/seller/my-bids");
    }

    // Check if round 2 is still active
    const now = new Date();
    const round2EndDate = bid.project.biddingRounds.round2.endDate;
    
    if (now > round2EndDate) {
      req.flash("error", "Round 2 has ended. Cannot update bid.");
      return res.redirect("/seller/my-bids");
    }

    // Validate amount
    const bidAmount = parseFloat(req.body.amount);
    if (isNaN(bidAmount) || bidAmount < bid.project.bidSettings.startingBid) {
      req.flash(
        "error",
        `Bid amount must be a number and at least $${bid.project.bidSettings.startingBid}`
      );
      return res.redirect("/seller/my-bids");
    }

    // Update bid using the new method
    await bid.updateForRound2(bidAmount, req.body.proposal.trim());

    req.flash("success", "Bid updated successfully for Round 2!");
    res.redirect("/seller/my-bids");
  } catch (error) {
    console.error("Update bid for round 2 error:", error);
    req.flash("error", "Error updating bid: " + error.message);
    res.redirect("/seller/my-bids");
  }
};

// UPDATED: Get my bids with new statuses
exports.getMyBids = async (req, res) => {
  try {
    const sellerId = req.session.userId;

    if (!sellerId) {
      req.flash("error", "Please log in to view your bids");
      return res.redirect("/auth/login");
    }

    // Force status update before showing bids
    await statusAutomation.updateAllProjectStatuses();

    const myBids = await Bid.find({ seller: sellerId })
      .populate(
        "project",
        "title category description location bidSettings timeline status progress biddingRounds"
      )
      .populate("customer", "name email phone")
      .sort({ createdAt: -1 });

    // Group bids by selection status and round
    const bidsByStatus = {
      submitted: myBids.filter((bid) => bid.selectionStatus === 'submitted'),
      selectedRound1: myBids.filter((bid) => bid.selectionStatus === 'selected-round1'),
      selectedRound2: myBids.filter((bid) => bid.selectionStatus === 'selected-round2'),
      won: myBids.filter((bid) => bid.selectionStatus === 'won'),
      lost: myBids.filter((bid) => bid.selectionStatus === 'lost'),
    };

    // Get contracts for won bids
    const wonBidIds = bidsByStatus.won.map((bid) => bid._id);
    const contracts = await Contract.find({ bid: { $in: wonBidIds } });

    // Add contract info to won bids
    bidsByStatus.won.forEach((bid) => {
      const contract = contracts.find(
        (contract) => contract.bid.toString() === bid._id.toString()
      );
      if (contract) {
        bid.contract = contract;
      }
    });

    const userData = req.session.user || { name: "Seller", email: "" };

    // Get bid count for notifications
    const bidCount = await Bid.countDocuments({
      seller: sellerId,
      selectionStatus: 'submitted'
    });

    res.render("seller/my-bids", {
      user: userData,
      currentPage: "my-bids",
      bids: bidsByStatus,
      bidCount: bidCount,
      moment: require("moment"),
    });
  } catch (error) {
    console.error("My bids error:", error);
    req.flash("error", "Error loading bids: " + error.message);
    res.redirect("/seller/dashboard");
  }
};

// UPDATED: Find bids - only show approved and active projects
exports.getFindBids = async (req, res) => {
  try {
    const sellerId = req.session.userId;

    if (!sellerId) {
      req.flash("error", "Please log in to view projects");
      return res.redirect("/auth/login");
    }

    const { state, city, category } = req.query;
    const filters = {};

    if (state) filters["location.state"] = new RegExp(state, "i");
    if (city) filters["location.city"] = new RegExp(city, "i");
    if (category) filters.category = category;

    // Only show admin-approved projects in round 1
    const activeProjects = await Project.find({
      ...filters,
      adminStatus: 'approved',
      status: 'active',
      "biddingRounds.currentRound": 1,
      "biddingRounds.round1.status": 'active'
    })
      .populate("customer", "name companyName")
      .populate("bids")
      .sort({ createdAt: -1 });

    const userData = req.session.user || { name: "Seller", email: "" };

    res.render("seller/find-bids", {
      user: userData,
      currentPage: "find-bids",
      projects: activeProjects || [],
      filters: { state, city, category },
      bidCount: await Bid.countDocuments({ seller: sellerId, selectionStatus: "submitted" }),
      moment: require("moment"),
    });
  } catch (error) {
    console.error("Find bids error:", error);
    req.flash("error", "Error loading projects: " + error.message);
    res.redirect("/seller/dashboard");
  }
};



// GET: Seller Round 2 bidding page
exports.getSellerRound2Bidding = async (req, res) => {
  try {
    const { projectId } = req.params;
    const sellerId = req.session.userId;

    const project = await Project.findById(projectId);
    if (!project) {
      req.flash("error", "Project not found");
      return res.redirect("/seller/dashboard");
    }

    // Check if seller is in the top 3 for Round 2
    const existingBid = await Bid.findOne({
      project: projectId,
      seller: sellerId,
      selectionStatus: 'selected-round2'
    });

    if (!existingBid) {
      req.flash("error", "You are not selected for Round 2 bidding");
      return res.redirect("/seller/dashboard");
    }

    // Check if Round 2 is still active
    if (project.biddingRounds.currentRound !== 2 || 
        project.biddingRounds.round2.status !== 'active') {
      req.flash("error", "Round 2 bidding is not active");
      return res.redirect("/seller/dashboard");
    }

    res.render("seller/round2-bidding", {
      user: req.session.user,
      project: project,
      bid: existingBid,
      moment: require("moment")
    });
  } catch (error) {
    console.error("Get seller round 2 bidding error:", error);
    req.flash("error", "Error loading Round 2 bidding page");
    res.redirect("/seller/dashboard");
  }
};

// POST: Update Round 2 bid
exports.updateRound2Bid = async (req, res) => {
  try {
    const { projectId } = req.params;
    const sellerId = req.session.userId;
    const { amount, proposal } = req.body;

    const project = await Project.findById(projectId);
    if (!project) {
      req.flash("error", "Project not found");
      return res.redirect("/seller/dashboard");
    }

    // Check if seller is in top 3 and Round 2 is active
    const existingBid = await Bid.findOne({
      project: projectId,
      seller: sellerId,
      selectionStatus: 'selected-round2'
    });

    if (!existingBid) {
      req.flash("error", "You are not selected for Round 2 bidding");
      return res.redirect("/seller/dashboard");
    }

    if (project.biddingRounds.currentRound !== 2 || 
        project.biddingRounds.round2.status !== 'active') {
      req.flash("error", "Round 2 bidding is not active");
      return res.redirect("/seller/dashboard");
    }

    // Check if Round 2 time hasn't expired
    if (new Date() > project.biddingRounds.round2.endDate) {
      req.flash("error", "Round 2 bidding has ended");
      return res.redirect("/seller/dashboard");
    }

    // Update the bid for Round 2
    await existingBid.updateForRound2(parseFloat(amount), proposal);

    req.flash("success", "Bid updated successfully for Round 2!");
    res.redirect("/seller/dashboard");
  } catch (error) {
    console.error("Update Round 2 bid error:", error);
    req.flash("error", "Error updating bid: " + error.message);
    res.redirect("/seller/dashboard");
  }
};

// NEW: Function to automatically complete Round 2 and select winner
exports.autoCompleteRound2 = async (projectId) => {
  try {
    const project = await Project.findById(projectId);
    if (!project || project.biddingRounds.currentRound !== 2) {
      return;
    }

    console.log(`🕒 Checking Round 2 completion for project: ${projectId}`);

    // Get all Round 2 bids that were actually submitted (not just selected)
    const round2Bids = await Bid.find({
      project: projectId,
      round: 2,
      selectionStatus: 'selected-round2'
    }).sort({ amount: -1 }); // Sort by HIGHEST amount first

    console.log(`📨 Found ${round2Bids.length} Round 2 bids for project ${projectId}`);

    if (round2Bids.length > 0) {
      // Auto-select the HIGHEST bid as winner (since you mentioned highest bid wins)
      const winningBid = round2Bids[0];
      
      console.log(`🏆 Selecting winner: ${winningBid._id} with amount: $${winningBid.amount}`);

      // Use project method to complete round 2
      await project.completeRound2(winningBid._id);
      await winningBid.markAsWon();

      // Mark other bids as lost
      await Bid.updateMany(
        {
          project: projectId,
          round: 2,
          _id: { $ne: winningBid._id },
          selectionStatus: 'selected-round2'
        },
        { 
          selectionStatus: 'lost', 
          status: 'lost',
          isActiveInRound: false
        }
      );

      console.log(`✅ Round 2 automatically completed for project ${projectId}. Winner: ${winningBid._id}`);
      
      // Initialize contract for winner
      const statusAutomation = require('../services/statusAutomation');
      await statusAutomation.initializeContractForWinner(project, winningBid, {});

      // Notify winner
      const Notice = require("../models/Notice");
      await Notice.create({
        title: `You Won! - ${project.title}`,
        content: `Congratulations! Your bid has been selected as the winner for "${project.title}". Contract process has started.`,
        targetAudience: "seller",
        specificUser: winningBid.seller,
        noticeType: "success",
        isActive: true,
        startDate: new Date(),
        endDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      });

      // Notify other bidders
      const losingBids = round2Bids.slice(1);
      for (const bid of losingBids) {
        await Notice.create({
          title: `Bid Result - ${project.title}`,
          content: `The project "${project.title}" has been awarded to another bidder.`,
          targetAudience: "seller",
          specificUser: bid.seller,
          noticeType: "info",
          isActive: true,
          startDate: new Date(),
          endDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        });
      }

    } else {
      // No bids submitted in Round 2 - project fails
      await project.markAsFailed();
      console.log(`❌ Project ${projectId} failed - no bids submitted in Round 2`);
    }
  } catch (error) {
    console.error("Auto complete Round 2 error:", error);
  }
};