// controllers/sellerController.js
const Project = require("../models/Project");
const Bid = require("../models/Bid");
const User = require("../models/User");
const Notice = require("../models/Notice");
const Contract = require("../models/Contract");
const Agreement = require('../models/Agreement');
const Seller = require("../models/Seller");
const cloudinary = require("../config/cloudinary");
// Add these imports at the top
const moment = require("moment");

// const cloudinary = require("../config/cloudinary");
const mongoose = require("mongoose");

// Import status automation
const statusAutomation = require("../services/statusAutomation");

// Seller Dashboard - Enhanced with real-time updates
exports.pendingPage = async (req, res) => {
  res.render("seller/pending");
};

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

  const office = seller.officeLocations.find((loc) => loc.primary);



console.log("=== SELLER PROFILE DEBUG ===", JSON.stringify(office, null, 2));

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


exports.serveSellerDocument = async (req, res) => {
  console.log("dfghjkldfghjk",req.params)
}


// NEW: Function to automatically complete Round 2 and select winner
// exports.autoCompleteRound2 = async (projectId) => {
//   try {
//     const project = await Project.findById(projectId);
//     if (!project || project.biddingRounds.currentRound !== 2) {
//       return;
//     }

//     console.log(`🕒 Checking Round 2 completion for project: ${projectId}`);

//     // Get all Round 2 bids that were actually submitted (not just selected)
//     const round2Bids = await Bid.find({
//       project: projectId,
//       round: 2,
//       selectionStatus: 'selected-round2'
//     }).sort({ amount: -1 }); // Sort by HIGHEST amount first

//     console.log(`📨 Found ${round2Bids.length} Round 2 bids for project ${projectId}`);

//     if (round2Bids.length > 0) {
//       // Auto-select the HIGHEST bid as winner (since you mentioned highest bid wins)
//       const winningBid = round2Bids[0];
      
//       console.log(`🏆 Selecting winner: ${winningBid._id} with amount: $${winningBid.amount}`);

//       // Use project method to complete round 2
//       await project.completeRound2(winningBid._id);
//       await winningBid.markAsWon();

//       // Mark other bids as lost
//       await Bid.updateMany(
//         {
//           project: projectId,
//           round: 2,
//           _id: { $ne: winningBid._id },
//           selectionStatus: 'selected-round2'
//         },
//         { 
//           selectionStatus: 'lost', 
//           status: 'lost',
//           isActiveInRound: false
//         }
//       );

//       console.log(`✅ Round 2 automatically completed for project ${projectId}. Winner: ${winningBid._id}`);
      
//       // Initialize contract for winner
//       const statusAutomation = require('../services/statusAutomation');
//       await statusAutomation.initializeContractForWinner(project, winningBid, {});

//       // Notify winner
//       const Notice = require("../models/Notice");
//       await Notice.create({
//         title: `You Won! - ${project.title}`,
//         content: `Congratulations! Your bid has been selected as the winner for "${project.title}". Contract process has started.`,
//         targetAudience: "seller",
//         specificUser: winningBid.seller,
//         noticeType: "success",
//         isActive: true,
//         startDate: new Date(),
//         endDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
//       });

//       // Notify other bidders
//       const losingBids = round2Bids.slice(1);
//       for (const bid of losingBids) {
//         await Notice.create({
//           title: `Bid Result - ${project.title}`,
//           content: `The project "${project.title}" has been awarded to another bidder.`,
//           targetAudience: "seller",
//           specificUser: bid.seller,
//           noticeType: "info",
//           isActive: true,
//           startDate: new Date(),
//           endDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
//         });
//       }

//     } else {
//       // No bids submitted in Round 2 - project fails
//       await project.markAsFailed();
//       console.log(`❌ Project ${projectId} failed - no bids submitted in Round 2`);
//     }
//   } catch (error) {
//     console.error("Auto complete Round 2 error:", error);
//   }
// };

// exports.autoCompleteRound2 = async (projectId) => {
//   try {
//     const Project = mongoose.model('Project');
//     const Bid = mongoose.model('Bid');
    
//     const project = await Project.findById(projectId);
//     if (!project || project.biddingRounds.currentRound !== 2) {
//       console.log(`Project ${projectId} not found or not in Round 2`);
//       return;
//     }

//     console.log(`🕒 Auto-completing Round 2 for project: ${projectId}`);

//     // Use the project's completeRound2 method directly
//     await project.completeRound2();
    
//     // If project was successfully awarded, initialize contract
//     if (project.status === 'awarded' && project.finalWinner.bid) {
//       const winningBid = await Bid.findById(project.finalWinner.bid);
//       if (winningBid) {
//         const statusAutomation = require('../services/statusAutomation');
//         await statusAutomation.initializeContractForWinner(project, winningBid, {});

//         // Notify winner
//         const Notice = require("../models/Notice");
//         await Notice.create({
//           title: `You Won! - ${project.title}`,
//           content: `Congratulations! Your bid has been selected as the winner for "${project.title}". Contract process has started.`,
//           targetAudience: "seller",
//           specificUser: winningBid.seller,
//           noticeType: "success",
//           isActive: true,
//           startDate: new Date(),
//           endDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
//         });

//         console.log(`✅ Contract initialized and notifications sent for project ${projectId}`);
//       }
//     }

//     console.log(`🎉 Round 2 auto-completion finished for project ${projectId}`);
    
//   } catch (error) {
//     console.error("Auto complete Round 2 error:", error);
//   }
// };
// exports.autoCompleteRound2 = async (projectId) => {
//   try {
//     const Project = mongoose.model('Project');
//     const Bid = mongoose.model('Bid');
//     const statusAutomation = require('../services/statusAutomation'); // ADD THIS
    
//     const project = await Project.findById(projectId);
//     if (!project || project.biddingRounds.currentRound !== 2) {
//       console.log(`Project ${projectId} not found or not in Round 2`);
//       return;
//     }

//     console.log(`🕒 Auto-completing Round 2 for project: ${projectId}`);

//     // Use the project's completeRound2 method directly
//     await project.completeRound2();
    
//     // Get updated project to check status
//     const updatedProject = await Project.findById(projectId);
    
//     // If project was successfully awarded, initialize contract
//     if (updatedProject.status === 'awarded' && updatedProject.finalWinner && updatedProject.finalWinner.bid) {
//       const winningBid = await Bid.findById(updatedProject.finalWinner.bid).populate('seller');
//       if (winningBid) {
//         await statusAutomation.initializeContractForWinner(updatedProject, winningBid, {});

//         // Notify winner
//         const Notice = require("../models/Notice");
//         await Notice.create({
//           title: `You Won! - ${updatedProject.title}`,
//           content: `Congratulations! Your bid has been selected as the winner for "${updatedProject.title}". Contract process has started. Please wait for customer to upload their signed contract first.`,
//           targetAudience: "seller",
//           specificUser: winningBid.seller,
//           noticeType: "success",
//           isActive: true,
//           startDate: new Date(),
//           endDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
//         });

//         console.log(`✅ Contract initialized and notifications sent for project ${projectId}`);
//       }
//     }

//     console.log(`🎉 Round 2 auto-completion finished for project ${projectId}`);
    
//   } catch (error) {
//     console.error("Auto complete Round 2 error:", error);
//   }
// };
exports.autoCompleteRound2 = async (projectId) => {
  try {
    const Project = mongoose.model('Project');
    
    const project = await Project.findById(projectId);
    if (!project || project.biddingRounds.currentRound !== 2) {
      console.log(`Project ${projectId} not found or not in Round 2`);
      return;
    }

    console.log(`🕒 Auto-completing Round 2 for project: ${projectId}`);

    // Use the project's completeRound2 method directly - it will handle everything via statusAutomation
    await project.completeRound2();
    
    console.log(`🎉 Round 2 auto-completion finished for project ${projectId}`);
    
  } catch (error) {
    console.error("Auto complete Round 2 error:", error);
  }
};






// Get waiting queue page
exports.getWaitingQueue = async (req, res) => {
  try {
    const { bidId } = req.params;
    const sellerId = req.session.userId;

    const bid = await Bid.findById(bidId)
      .populate('project')
      .populate('seller');

    if (!bid || bid.seller._id.toString() !== sellerId) {
      req.flash("error", "Bid not found or unauthorized");
      return res.redirect("/seller/my-bids");
    }

    if (!bid.isInWaitingQueue) {
      req.flash("error", "This bid is not in the waiting queue");
      return res.redirect("/seller/my-bids");
    }

    const userData = req.session.user || { name: "Seller", email: "" };
    const bidCount = await Bid.countDocuments({ 
      seller: sellerId, 
      selectionStatus: "submitted" 
    });

    res.render("seller/waiting-queue", {
      user: userData,
      currentPage: "my-bids",
      bid: bid,
      bidCount: bidCount,
      moment: require("moment"),
      csrfToken: req.csrfToken ? req.csrfToken() : ''
    });
  } catch (error) {
    console.error("Get waiting queue error:", error);
    req.flash("error", "Error loading waiting queue details");
    res.redirect("/seller/my-bids");
  }
};




// Get notifications
exports.getNotifications = async (req, res) => {
  try {
    const sellerId = req.session.userId;

    const notices = await Notice.find({
      $or: [
        { targetAudience: "seller" },
        { specificUser: sellerId },
        { targetId: sellerId }
      ],
      isActive: true,
      startDate: { $lte: new Date() },
      $or: [{ endDate: { $gte: new Date() } }, { endDate: null }],
    })
    .sort({ createdAt: -1 });

    const userData = req.session.user || { name: "Seller", email: "" };

    res.render("seller/notifications", {
      user: userData,
      currentPage: "notifications",
      notices: notices || [],
      moment: require("moment")
    });
  } catch (error) {
    console.error("Get notifications error:", error);
    req.flash("error", "Error loading notifications");
    res.redirect("/seller/dashboard");
  }
};

// ============ BID MANAGEMENT & STATUS ============





// Get My Bids with Enhanced Status Handling


// ============ ROUND 1 BIDDING ============

// Get Round 1 Bidding Form

// ============ DEFECTED BID RESUBMISSION ============


// ============ ROUND 2 BIDDING ============

// Get Round 2 Bidding Form


// ============ REAL-TIME STATUS UPDATES ============

// Manual status update for seller
exports.updateStatuses = async (req, res) => {
  try {
    const sellerId = req.session.userId;
    const statusAutomation = require('../services/statusAutomation');
    
    // Update all project statuses
    await statusAutomation.updateAllProjectStatuses();
    
    // Handle expired resubmissions for this seller
    const expiredBids = await Bid.find({
      seller: sellerId,
      selectionStatus: 'defected',
      resubmissionDeadline: { $lte: new Date() }
    });
    
    for (const bid of expiredBids) {
      await bid.autoMarkAsLostIfExpired();
    }

    req.flash('success', 'Status updates completed successfully!');
    res.redirect('/seller/my-bids');
  } catch (error) {
    console.error('Status update error:', error);
    req.flash('error', 'Error updating statuses: ' + error.message);
    res.redirect('/seller/my-bids');
  }
};

// ============ BID DETAILS VIEW ============

// Get Bid Details with Enhanced Status





// exports.getMyBids = async (req, res) => {
//   try {
//     const sellerId = req.session.userId;

//     if (!sellerId) {
//       req.flash("error", "Please log in to view your bids");
//       return res.redirect("/auth/login");
//     }

//     // Force status update before showing bids
//     await statusAutomation.updateAllProjectStatuses();

//     // Handle expired resubmissions
//     const expiredDefectedBids = await Bid.findExpiredDefectedBids();
//     for (const bid of expiredDefectedBids) {
//       await bid.autoMarkAsLostIfExpired();
//     }

//     const myBids = await Bid.find({ seller: sellerId })
//       .populate({
//         path: "project",
//         select: "title category description location bidSettings timeline status progress biddingRounds adminStatus round1Selections"
//       })
//       .populate("customer", "name email phone")
//       .sort({ createdAt: -1 });

//     console.log(`📊 Found ${myBids.length} total bids for seller ${sellerId}`);

//     // Enhanced grouping with proper multi-round status handling
//     const bidsByStatus = {
//       submitted: myBids.filter(bid => 
//         bid.selectionStatus === 'submitted' && 
//         bid.status === 'submitted' &&
//         bid.isActiveInRound !== false &&
//         bid.round === 1
//       ),
      
//       defected: myBids.filter(bid => 
//         bid.selectionStatus === 'defected' &&
//         bid.agreementResponses?.status === 'defected' &&
//         // Only show defected bids that can still be resubmitted
//         (bid.agreementResponses.defectCount < bid.agreementResponses.maxDefectCount) &&
//         // Check if resubmission deadline hasn't passed
//         (!bid.resubmissionDeadline || new Date(bid.resubmissionDeadline) > new Date())
//       ),
      
//       waitingQueue: myBids.filter(bid => 
//         bid.selectionStatus === 'waiting-queue' && 
//         bid.isInWaitingQueue === true &&
//         bid.isActiveInRound !== false
//       ),
      
//       selectedRound1: myBids.filter(bid => 
//         bid.selectionStatus === 'selected-round1' && 
//         bid.isActiveInRound !== false &&
//         bid.round === 1
//       ),
      
//       selectedRound2: myBids.filter(bid => 
//         bid.selectionStatus === 'selected-round2' && 
//         bid.isActiveInRound !== false &&
//         bid.round === 2
//       ),
      
//       won: myBids.filter(bid => 
//         bid.selectionStatus === 'won' || 
//         bid.status === 'won'
//       ),
      
//       lost: myBids.filter(bid => 
//         (bid.selectionStatus === 'lost' || bid.status === 'lost') &&
//         bid.agreementResponses?.status !== 'defected'
//       )
//     };

//     // Get contracts for won bids
//     const wonBidIds = bidsByStatus.won.map(bid => bid._id);
//     const contracts = await Contract.find({ bid: { $in: wonBidIds } })
//       .populate('customer', 'name email')
//       .populate('seller', 'name companyName')
//       .populate('project', 'title');

//     // Add contract info to won bids
//     bidsByStatus.won.forEach(bid => {
//       const contract = contracts.find(
//         contract => contract.bid && contract.bid.toString() === bid._id.toString()
//       );
//       if (contract) {
//         bid.contract = contract;
//       }
//     });

//     const userData = req.session.user || { name: "Seller", email: "" };

//     // Get bid count for notifications (active bids only)
//     const bidCount = await Bid.countDocuments({
//       seller: sellerId,
//       selectionStatus: { 
//         $in: ['submitted', 'selected-round1', 'selected-round2', 'waiting-queue'] 
//       },
//       status: { $ne: 'lost' }
//     });

//     console.log('📈 Bid counts by status:', {
//       submitted: bidsByStatus.submitted.length,
//       defected: bidsByStatus.defected.length,
//       waitingQueue: bidsByStatus.waitingQueue.length,
//       selectedRound1: bidsByStatus.selectedRound1.length,
//       selectedRound2: bidsByStatus.selectedRound2.length,
//       won: bidsByStatus.won.length,
//       lost: bidsByStatus.lost.length
//     });

//     res.render("seller/my-bids", {
//       user: userData,
//       currentPage: "my-bids",
//       bids: bidsByStatus,
//       bidCount: bidCount,
//       moment: require("moment"),
//       csrfToken: req.csrfToken ? req.csrfToken() : ''
//     });

//   } catch (error) {
//     console.error("❌ My bids error:", error);
//     req.flash("error", "Error loading bids: " + error.message);
//     res.redirect("/seller/dashboard");
//   }
// };
exports.getMyBids = async (req, res) => {
  try {
    const sellerId = req.session.userId;

    if (!sellerId) {
      req.flash("error", "Please log in to view your bids");
      return res.redirect("/auth/login");
    }

    // Force status update before showing bids
    await statusAutomation.updateAllProjectStatuses();

    // Handle expired resubmissions
    const expiredDefectedBids = await Bid.findExpiredDefectedBids();
    for (const bid of expiredDefectedBids) {
      await bid.autoMarkAsLostIfExpired();
    }

    const myBids = await Bid.find({ seller: sellerId })
      .populate({
        path: "project",
        select: "title category description location bidSettings timeline status progress biddingRounds adminStatus round1Selections"
      })
      .populate("customer", "name email phone")
      .sort({ createdAt: -1 });

    console.log(`📊 Found ${myBids.length} total bids for seller ${sellerId}`);

    // Enhanced grouping with proper multi-round status handling
    const bidsByStatus = {
      submitted: myBids.filter(bid => 
        bid.selectionStatus === 'submitted' && 
        bid.status === 'submitted' &&
        bid.isActiveInRound !== false &&
        bid.round === 1
      ),
      
      defected: myBids.filter(bid => 
        bid.selectionStatus === 'defected' &&
        bid.agreementResponses?.status === 'defected'
      ),
      
      waitingQueue: myBids.filter(bid => 
        bid.selectionStatus === 'waiting-queue' && 
        bid.isInWaitingQueue === true &&
        bid.isActiveInRound !== false
      ),
      
      selectedRound1: myBids.filter(bid => 
        bid.selectionStatus === 'selected-round1' && 
        bid.isActiveInRound !== false &&
        bid.round === 1
      ),
      
      selectedRound2: myBids.filter(bid => 
        bid.selectionStatus === 'selected-round2' && 
        bid.isActiveInRound !== false &&
        bid.round === 2
      ),
      
      won: myBids.filter(bid => 
        bid.selectionStatus === 'won' || 
        bid.status === 'won'
      ),
      
      lost: myBids.filter(bid => 
        (bid.selectionStatus === 'lost' || bid.status === 'lost') &&
        bid.agreementResponses?.status !== 'defected'
      )
    };

    // Get contracts for won bids - FIXED QUERY
    const wonBidIds = bidsByStatus.won.map(bid => bid._id);
    const contracts = await Contract.find({ 
      bid: { $in: wonBidIds },
      seller: sellerId // Ensure seller can only see their contracts
    })
      .populate('customer', 'name email')
      .populate('seller', 'name companyName')
      .populate('project', 'title')
      .populate('bid', 'amount proposal');

    console.log(`📄 Found ${contracts.length} contracts for ${wonBidIds.length} won bids`);

    // Add contract info to won bids
    bidsByStatus.won.forEach(bid => {
      const contract = contracts.find(
        contract => contract.bid && contract.bid._id.toString() === bid._id.toString()
      );
      if (contract) {
        bid.contract = contract;
        console.log(`📋 Bid ${bid._id} - Contract status: ${contract.status}`);
      } else {
        console.log(`❌ No contract found for won bid: ${bid._id}`);
      }
    });

    const userData = req.session.user || { name: "Seller", email: "" };

    // Get bid count for notifications (active bids only)
    const bidCount = await Bid.countDocuments({
      seller: sellerId,
      selectionStatus: { 
        $in: ['submitted', 'selected-round1', 'selected-round2', 'waiting-queue'] 
      },
      status: { $ne: 'lost' }
    });

    console.log('📈 Bid counts by status:', {
      submitted: bidsByStatus.submitted.length,
      defected: bidsByStatus.defected.length,
      waitingQueue: bidsByStatus.waitingQueue.length,
      selectedRound1: bidsByStatus.selectedRound1.length,
      selectedRound2: bidsByStatus.selectedRound2.length,
      won: bidsByStatus.won.length,
      lost: bidsByStatus.lost.length
    });

    res.render("seller/my-bids", {
      user: userData,
      currentPage: "my-bids",
      bids: bidsByStatus,
      bidCount: bidCount,
      moment: require("moment"),
      csrfToken: req.csrfToken ? req.csrfToken() : ''
    });

  } catch (error) {
    console.error("❌ My bids error:", error);
    req.flash("error", "Error loading bids: " + error.message);
    res.redirect("/seller/dashboard");
  }
};
// Get Round 1 Bidding Form - FIXED
exports.getRound1BiddingForm = async (req, res) => {
  try {
    const { projectId } = req.params;
    const sellerId = req.session.userId;

    console.log('=== GET ROUND 1 FORM ===');
    console.log('Project ID:', projectId);
    console.log('Seller ID:', sellerId);

    const project = await Project.findById(projectId);
    if (!project) {
      req.flash("error", "Project not found");
      return res.redirect("/seller/find-bids");
    }

    // Check if project is approved and in round 1
    if (project.adminStatus !== 'approved' || project.biddingRounds.currentRound !== 1) {
      req.flash("error", "Project is not accepting Round 1 bids");
      return res.redirect("/seller/find-bids");
    }

    // Check for existing bid
    const existingBid = await Bid.findOne({
      project: projectId,
      seller: sellerId,
      round: 1
    });

    console.log('Existing bid found:', existingBid ? existingBid._id : 'None');

    // Get agreements for project category - FIXED QUERY
    let agreements = await Agreement.findOne({ 
      category: project.category,
      isActive: true 
    });
    
    console.log('Agreements found:', agreements ? agreements.clauses.length : 'None');

    // Create default agreements if they don't exist
    if (!agreements) {
      console.log('Creating default agreements for category:', project.category);
      agreements = new Agreement({
        category: project.category,
        clauses: Agreement.getDefaultClauses(project.category)
      });
      await agreements.save();
      console.log('Default agreements created');
    }

    const userData = req.session.user || { name: "Seller", email: "" };

    // Get bid count for notifications
    const bidCount = await Bid.countDocuments({
      seller: sellerId,
      selectionStatus: "submitted"
    });

    res.render("seller/round1-bidding-form", {
      user: userData,
      currentPage: "find-bids",
      project: project,
      agreements: agreements,
      existingBid: existingBid,
      bidCount: bidCount,
      moment: moment,
      csrfToken: req.csrfToken ? req.csrfToken() : ''
    });
  } catch (error) {
    console.error("Get round 1 bidding form error:", error);
    req.flash("error", "Error loading bidding form: " + error.message);
    res.redirect("/seller/find-bids");
  }
};
// Submit Round 1 Bid - FIXED STATUS UPDATES
exports.submitRound1Bid = async (req, res) => {
  try {
    const { projectId } = req.params;
    const sellerId = req.session.userId;
    const { amount, proposal, agreementResponses } = req.body;

    console.log('=== SUBMIT ROUND 1 BID ===');
    console.log('Project ID:', projectId);
    console.log('Seller ID:', sellerId);

    const project = await Project.findById(projectId);
    if (!project) {
      req.flash("error", "Project not found");
      return res.redirect("/seller/find-bids");
    }

    // Validate project status
    if (project.adminStatus !== 'approved' || 
        project.biddingRounds.currentRound !== 1 || 
        project.biddingRounds.round1.status !== 'active') {
      req.flash("error", "Project is not accepting Round 1 bids");
      return res.redirect("/seller/find-bids");
    }

    // Check if bidding time hasn't ended
    if (new Date() > project.biddingRounds.round1.endDate) {
      req.flash("error", "Round 1 bidding has ended");
      return res.redirect("/seller/find-bids");
    }

    // Get agreements for validation
    let agreements = await Agreement.findOne({ 
      category: project.category,
      isActive: true 
    });
    
    if (!agreements) {
      agreements = new Agreement({
        category: project.category,
        clauses: Agreement.getDefaultClauses(project.category)
      });
      await agreements.save();
    }

    // Check for existing bid
    let bid = await Bid.findOne({
      project: projectId,
      seller: sellerId,
      $or: [
        { round: 1 },
        { round: { $exists: false } }
      ]
    });

    console.log('Existing bid check:', bid ? 'Found' : 'Not found');

    if (bid && bid.agreementResponses?.submitted) {
      req.flash("error", "You have already submitted a bid for this project");
      return res.redirect("/seller/my-bids");
    }

    // Validate amount
    const bidAmount = parseFloat(amount);
    if (isNaN(bidAmount) || bidAmount < project.bidSettings.startingBid) {
      req.flash("error", `Bid amount must be at least $${project.bidSettings.startingBid}`);
      return res.redirect(`/seller/project/${projectId}/bid`);
    }

    // Validate proposal
    if (!proposal || proposal.trim().length < 100) {
      req.flash("error", "Proposal must be at least 100 characters long");
      return res.redirect(`/seller/project/${projectId}/bid`);
    }

    // PROCESS AGREEMENT RESPONSES - FIXED LOGIC
    const processedResponses = [];
    
    if (agreementResponses && typeof agreementResponses === 'object') {
      console.log('Processing agreement responses...');
      
      for (const [clauseId, responseData] of Object.entries(agreementResponses)) {
        console.log('Processing clause:', clauseId, responseData);
        
        // Skip if it's not a proper clause ID format
        if (!mongoose.Types.ObjectId.isValid(clauseId)) {
          console.log('Invalid clause ID:', clauseId);
          continue;
        }

        // Find the clause in agreements to validate it exists
        const clause = agreements.clauses.find(c => c._id.toString() === clauseId);
        if (!clause) {
          console.log('Clause not found in agreement:', clauseId);
          continue;
        }

        const agreed = responseData.agreed === 'true' || responseData.agreed === true;
        const remarks = responseData.remarks || '';

        console.log(`Clause ${clauseId}: agreed=${agreed}, remarks=${remarks}`);

        // Validate that if it's a required clause and disagreed, remarks are provided
        if (clause.required && !agreed && (!remarks || remarks.trim() === '')) {
          req.flash("error", `Remarks are required for disagreed clause: ${clause.title}`);
          return res.redirect(`/seller/project/${projectId}/bid`);
        }

        processedResponses.push({
          clauseId: new mongoose.Types.ObjectId(clauseId),
          agreed: agreed,
          remarks: remarks,
          submittedAt: new Date()
        });
      }
    }

    console.log('Processed responses count:', processedResponses.length);

    // Validate that all required clauses are responded to
    const requiredClauses = agreements.clauses.filter(clause => clause.required);
    const respondedRequiredClauses = processedResponses.filter(response => {
      const clause = requiredClauses.find(c => c._id.toString() === response.clauseId.toString());
      return clause !== undefined;
    });

    console.log('Required clauses:', requiredClauses.length);
    console.log('Responded required clauses:', respondedRequiredClauses.length);

    if (respondedRequiredClauses.length !== requiredClauses.length) {
      req.flash("error", "Please respond to all required agreement clauses");
      return res.redirect(`/seller/project/${projectId}/bid`);
    }

    // Create or update bid - FIXED BID CREATION
    if (!bid) {
      console.log('Creating new bid...');
      bid = new Bid({
        project: projectId,
        seller: sellerId,
        customer: project.customer,
        amount: bidAmount,
        proposal: proposal.trim(),
        round: 1,
        status: "submitted",
        selectionStatus: "submitted",
        isActiveInRound: true,
        bidSubmittedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date()
      });
    } else {
      console.log('Updating existing bid...');
      bid.amount = bidAmount;
      bid.proposal = proposal.trim();
      bid.status = "submitted";
      bid.selectionStatus = "submitted";
      bid.isActiveInRound = true;
      bid.round = 1;
      bid.updatedAt = new Date();
    }

    // Set agreement responses - FIXED STRUCTURE
    bid.agreementResponses = {
      submitted: true,
      responses: processedResponses,
      submittedAt: new Date(),
      status: 'pending',
      defectCount: 0,
      maxDefectCount: 3,
      defectHistory: []
    };

    // Add initial revision
    bid.revisions = bid.revisions || [];
    bid.revisions.push({
      round: 1,
      amount: bidAmount,
      proposal: proposal.trim(),
      agreementResponses: processedResponses,
      revisedAt: new Date(),
      revisionType: 'initial'
    });

    bid.revisionCount = (bid.revisionCount || 0) + 1;
    bid.lastRevisedAt = new Date();

    // SAVE THE BID
    console.log('Saving bid...');
    await bid.save();
    console.log('✅ Bid saved successfully:', bid._id);

    // Add to project bids if not already added
    if (!project.bids.includes(bid._id)) {
      project.bids.push(bid._id);
      await project.save();
      console.log('✅ Bid added to project');
    }

    req.flash("success", "Bid submitted successfully for Round 1!");
    res.redirect("/seller/my-bids");

  } catch (error) {
    console.error("Submit round 1 bid error:", error);
    console.error("Error details:", error.stack);
    req.flash("error", "Error submitting bid: " + error.message);
    res.redirect(`/seller/project/${projectId}/bid`);
  }
};
// Get Defected Bid Resubmission Form
exports.getDefectedBidResubmission = async (req, res) => {
  try {
    const { bidId } = req.params;
    const sellerId = req.session.userId;

    const bid = await Bid.findById(bidId)
      .populate('project')
      .populate({
        path: 'agreementResponses.responses.clauseId',
        model: 'Agreement'
      });

    if (!bid || bid.seller.toString() !== sellerId) {
      req.flash("error", "Bid not found or unauthorized");
      return res.redirect("/seller/my-bids");
    }

    if (bid.agreementResponses?.status !== 'defected') {
      req.flash("error", "This bid does not require resubmission");
      return res.redirect("/seller/my-bids");
    }

    // Check if deadline passed
    if (bid.isResubmissionDeadlinePassed && bid.isResubmissionDeadlinePassed()) {
      req.flash("error", "Resubmission deadline has passed");
      return res.redirect("/seller/my-bids");
    }

    // Check max defect count
    if (bid.agreementResponses.defectCount >= bid.agreementResponses.maxDefectCount) {
      req.flash("error", "Maximum resubmission attempts reached");
      return res.redirect("/seller/my-bids");
    }

    // Get agreements
    const agreements = await Agreement.findOne({ category: bid.project.category });

    const userData = req.session.user || { name: "Seller", email: "" };

    // Get bid count for notifications
    const bidCount = await Bid.countDocuments({
      seller: sellerId,
      selectionStatus: "submitted"
    });

    res.render("seller/defected-bid-resubmission", {
      user: userData,
      currentPage: "my-bids",
      bid: bid,
      agreements: agreements,
      bidCount: bidCount,
      moment: moment,
      csrfToken: req.csrfToken ? req.csrfToken() : ''
    });
  } catch (error) {
    console.error("Get defected bid resubmission error:", error);
    req.flash("error", "Error loading resubmission form: " + error.message);
    res.redirect("/seller/my-bids");
  }
};

// Resubmit Defected Bid
exports.resubmitDefectedBid = async (req, res) => {
  try {
    const { bidId } = req.params;
    const sellerId = req.session.userId;
    const { amount, proposal } = req.body;

    console.log('=== RESUBMIT DEFECTED BID ===');
    console.log('Bid ID:', bidId);

    const bid = await Bid.findById(bidId);
    if (!bid || bid.seller.toString() !== sellerId) {
      req.flash("error", "Bid not found or unauthorized");
      return res.redirect("/seller/my-bids");
    }

    if (bid.agreementResponses.status !== 'defected') {
      req.flash("error", "This bid does not require resubmission");
      return res.redirect("/seller/my-bids");
    }

    // Check if deadline passed
    if (bid.isResubmissionDeadlinePassed && bid.isResubmissionDeadlinePassed()) {
      req.flash("error", "Resubmission deadline has passed. You can no longer resubmit this bid.");
      return res.redirect("/seller/my-bids");
    }

    if (bid.agreementResponses.defectCount >= bid.agreementResponses.maxDefectCount) {
      req.flash("error", "Maximum resubmission attempts reached");
      return res.redirect("/seller/my-bids");
    }

    // Validate amount
    const bidAmount = parseFloat(amount);
    const project = await Project.findById(bid.project);
    if (isNaN(bidAmount) || bidAmount < project.bidSettings.startingBid) {
      req.flash("error", `Bid amount must be at least $${project.bidSettings.startingBid}`);
      return res.redirect(`/seller/bid/${bidId}/defected-resubmission`);
    }

    // Process agreement responses
    const processedResponses = [];
    const agreementResponses = req.body.agreementResponses;
    
    if (agreementResponses && typeof agreementResponses === 'object') {
      for (const [clauseId, response] of Object.entries(agreementResponses)) {
        if (clauseId.startsWith('custom_')) continue;

        processedResponses.push({
          clauseId,
          agreed: response.agreed === 'true',
          remarks: response.remarks || '',
          supportingDocs: [],
          submittedAt: new Date()
        });
      }
    }

    // Resubmit the bid using model method
    await bid.resubmitAfterDefect(bidAmount, proposal.trim(), processedResponses);

    // Update project selection status
    const projectUpdate = await Project.findById(bid.project);
    await projectUpdate.handleResubmission(bidId, {
      amount: bidAmount,
      proposal: proposal.trim(),
      agreementResponses: processedResponses
    });

    req.flash("success", "Bid resubmitted successfully! Waiting for customer review.");
    res.redirect("/seller/my-bids");
  } catch (error) {
    console.error("Resubmit defected bid error:", error);
    req.flash("error", "Error resubmitting bid: " + error.message);
    res.redirect("/seller/my-bids");
  }
};

// Get Round 2 Bidding Form
exports.getRound2BiddingForm = async (req, res) => {
  try {
    const { projectId } = req.params;
    const sellerId = req.session.userId;

    console.log('🔄 Loading Round 2 bidding form for project:', projectId);

    const project = await Project.findById(projectId);
    if (!project) {
      req.flash("error", "Project not found");
      return res.redirect("/seller/my-bids");
    }

    // Check if project is in Round 2
    if (project.biddingRounds.currentRound !== 2) {
      console.log('❌ Project not in Round 2, current round:', project.biddingRounds.currentRound);
      req.flash("error", "Round 2 bidding not active");
      return res.redirect("/seller/my-bids");
    }

    // Check if Round 2 is still active
    if (new Date() > project.biddingRounds.round2.endDate) {
      req.flash("error", "Round 2 bidding has ended");
      return res.redirect("/seller/my-bids");
    }

    // Check if seller is selected for Round 2
    const bid = await Bid.findOne({
      project: projectId,
      seller: sellerId,
      selectionStatus: 'selected-round2'
    });

    if (!bid) {
      console.log('❌ Seller not selected for Round 2');
      req.flash("error", "You are not selected for Round 2");
      return res.redirect("/seller/my-bids");
    }

    const userData = req.session.user || { name: "Seller", email: "" };

    res.render("seller/round2-bidding-form", {
      user: userData,
      currentPage: "my-bids",
      project: project,
      bid: bid,
      bidCount: await Bid.countDocuments({ seller: sellerId, selectionStatus: "submitted" }),
      moment: require("moment"),
      csrfToken: req.csrfToken ? req.csrfToken() : ''
    });
  } catch (error) {
    console.error("Get round 2 bidding form error:", error);
    req.flash("error", "Error loading round 2 bidding form");
    res.redirect("/seller/my-bids");
  }
};
// Submit Round 2 Bid
exports.submitRound2Bid = async (req, res) => {
  try {
    const { projectId } = req.params;
    const sellerId = req.session.userId;
    const { amount, proposal } = req.body;

    const project = await Project.findById(projectId);
    if (!project) {
      req.flash("error", "Project not found");
      return res.redirect("/seller/my-bids");
    }

    // Check if project is in Round 2 and active
    if (project.biddingRounds.currentRound !== 2 || project.biddingRounds.round2.status !== 'active') {
      req.flash("error", "Round 2 bidding not active");
      return res.redirect("/seller/my-bids");
    }

    // Check if Round 2 time hasn't expired
    if (new Date() > project.biddingRounds.round2.endDate) {
      req.flash("error", "Round 2 bidding has ended");
      return res.redirect("/seller/my-bids");
    }

    // Check if seller is selected for Round 2
    const bid = await Bid.findOne({
      project: projectId,
      seller: sellerId,
      selectionStatus: 'selected-round2'
    });

    if (!bid) {
      req.flash("error", "You are not selected for Round 2");
      return res.redirect("/seller/my-bids");
    }

    // Validate amount
    const bidAmount = parseFloat(amount);
    if (isNaN(bidAmount) || bidAmount < project.bidSettings.startingBid) {
      req.flash("error", `Bid amount must be at least $${project.bidSettings.startingBid}`);
      return res.redirect(`/seller/project/${projectId}/round2-bidding`);
    }

    // Submit Round 2 bid using model method
    await bid.updateForRound2(bidAmount, proposal?.trim() || bid.proposal);

    req.flash("success", "Round 2 bid updated successfully!");
    res.redirect("/seller/my-bids");
  } catch (error) {
    console.error("Submit round 2 bid error:", error);
    req.flash("error", "Error submitting round 2 bid: " + error.message);
    res.redirect("/seller/my-bids");
  }
};
exports.getBidDetails = async (req, res) => {
  try {
    const { id } = req.params;
    const sellerId = req.session.userId;

    console.log("=== BID DETAILS DEBUG ===");
    console.log("Request params:", req.params);
    console.log("Bid ID from URL:", id);
    console.log("Seller ID from session:", sellerId);
    console.log("Session user:", req.session.user);

    if (!sellerId) {
      console.log("No seller ID in session");
      req.flash("error", "Please log in to view bid details");
      return res.redirect("/auth/login");
    }

    if (!id) {
      console.log("No bid ID provided");
      req.flash("error", "Bid ID is required");
      return res.redirect("/seller/my-bids");
    }

    // Check if it's a valid MongoDB ID
    if (!mongoose.Types.ObjectId.isValid(id)) {
      console.log("Invalid bid ID format:", id);
      req.flash("error", "Invalid bid ID format");
      return res.redirect("/seller/my-bids");
    }

    // Try to find the bid with multiple approaches for debugging
    console.log("Attempting to find bid with ID:", id);
    
    // Approach 1: Find by ID only (for debugging)
    const anyBid = await Bid.findById(id);
    console.log("Bid found (no seller filter):", anyBid ? "YES" : "NO");
    
    if (anyBid) {
      console.log("Bid details:", {
        id: anyBid._id,
        seller: anyBid.seller,
        project: anyBid.project,
        status: anyBid.status
      });
    }

    // Approach 2: Find with seller filter (what we actually want)
    const bid = await Bid.findOne({
      _id: id,
      seller: sellerId
    })
    .populate('project')
    .populate('seller', '_id name email')
    .populate('customer', 'name email phone companyName')
    .populate('agreementResponses.responses.clauseId');

    console.log("Bid found with seller filter:", bid ? "YES" : "NO");

    if (!bid) {
      console.log("Bid not found or unauthorized access");
      console.log("Looking for bid ID:", id);
      console.log("With seller ID:", sellerId);
      
      // Additional debug: Check if sellerId exists in users
      const User = require('../models/User');
      const seller = await User.findById(sellerId);
      console.log("Seller user exists:", seller ? "YES" : "NO");
      
      req.flash("error", "Bid not found or you don't have permission to view it");
      return res.redirect("/seller/my-bids");
    }

    console.log("Bid successfully found:", {
      id: bid._id,
      projectTitle: bid.project?.title,
      seller: bid.seller?._id,
      status: bid.status
    });

    // Get agreements for the project category
    const agreements = await Agreement.findOne({ category: bid.project.category });
    console.log("Agreements found:", agreements ? "YES" : "NO");

    // Get contract for this bid
    const contract = await Contract.findOne({ 
      bid: id 
    }).populate('customer seller');

    console.log(`Contract for bid ${id}:`, contract ? contract.status : 'No contract');

    // Attach contract to bid for EJS template
    bid.contract = contract;

    const userData = req.session.user || { name: "Seller", email: "" };

    // Get bid count for notifications
    const bidCount = await Bid.countDocuments({
      seller: sellerId,
      status: "submitted",
    });

    console.log("=== SUCCESS: Rendering bid details page ===");
    
    res.render("seller/bid-details", {
      user: userData,
      currentPage: "my-bids",
      project: bid.project,
      bid: bid,
      agreements: agreements,
      bidCount: bidCount,
      moment: require("moment"),
    });

  } catch (error) {
    console.error("❌ BID DETAILS ERROR:", error);
    console.error("Error stack:", error.stack);
    req.flash("error", "Error loading bid details: " + error.message);
    res.redirect("/seller/my-bids");
  }
};