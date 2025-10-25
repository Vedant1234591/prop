const mongoose = require("mongoose");
const Project = require("../models/Project");
const Bid = require("../models/Bid");
const User = require("../models/User");
const Notice = require("../models/Notice");
const Contract = require("../models/Contract");
const cloudinary = require("../config/cloudinary");
const moment = require("moment");
const statusAutomation = require("../services/statusAutomation");

// Dashboard - ENHANCED with automatic processing
exports.getDashboard = async (req, res) => {
  try {
    console.log("=== DASHBOARD DEBUG ===");
    console.log("Session user:", req.session.user);
    console.log("Req.user:", req.user);

    const customerId = req.session.userId;

    if (!customerId) {
      console.log("No customerId found in session");
      req.flash("error", "Please log in to access dashboard");
      return res.redirect("/auth/login");
    }

    console.log("Customer ID:", customerId);

    // ✅ Force status update before showing dashboard
    await statusAutomation.updateAllProjectStatuses();

    // Get project statistics
    const stats = await Project.aggregate([
      { $match: { customer: new mongoose.Types.ObjectId(customerId) } },
      {
        $group: {
          _id: "$status",
          count: { $sum: 1 },
        },
      },
    ]);

    // Initialize status counts with ALL possible statuses
    const statusCounts = {
      drafted: 0,
      "in-progress": 0,
      "half-partial": 0,
      "full-partial": 0,
      "half-completed": 0,
      completed: 0,
      failed: 0,
      cancelled: 0,
    };

    // Convert aggregation result to status counts
    stats.forEach((stat) => {
      if (statusCounts.hasOwnProperty(stat._id)) {
        statusCounts[stat._id] = stat.count;
      }
    });

    // Get latest bids (ONLY for this customer's projects)
    const customerProjects = await Project.find({
      customer: customerId,
    }).select("_id");
    const projectIds = customerProjects.map((p) => p._id);

    const latestBids = await Bid.find({ project: { $in: projectIds } })
      .populate("project", "title featuredImage")
      .populate("seller", "name companyName profileImage")
      .sort({ createdAt: -1 })
      .limit(10);




  const userData = req.session.user || { name: "Customer", email: "" };

    // Get latest notices for customers
    const latestNotices = await Notice.find({
      targetId :userData._id ,
      isActive: true,
      startDate: { $lte: new Date() },
      $or: [{ endDate: { $gte: new Date() } }, { endDate: null }],
    })
      .sort({ createdAt: -1 })
      .limit(10);

    // NEW: Get projects with pending contracts
    const projectsWithPendingContracts = await Project.find({
      customer: customerId,
      selectedBid: { $exists: true },
      status: "in-progress",
    }).populate("selectedBid");

    const pendingContracts = [];
    for (const project of projectsWithPendingContracts) {
      const contract = await Contract.findOne({
        project: project._id,
        status: {
          $in: ["pending-customer", "pending-seller", "pending-admin"],
        },
      });
      if (contract) {
        pendingContracts.push({
          project: project,
          contract: contract,
        });
      }
    }

    // Use session user data for the template
  

    res.render("customer/dashboard", {
      user: userData,
      currentPage: "dashboard",
      stats: statusCounts,
      latestBids: latestBids || [],
      latestNotices: latestNotices || [],
      notices: latestNotices.slice(0,5) || [],
      pendingContracts: pendingContracts || [],
      moment: moment,
    });
  } catch (error) {
    console.error("Dashboard error:", error);
    req.flash("error", "Error loading dashboard");
    res.redirect("/auth/login");
  }
};


// Enhanced getProjectDetails - Add status update and contract info
exports.getProjectDetails = async (req, res) => {
  try {
    // Force status update before showing project details
    await statusAutomation.updateAllProjectStatuses();

    const project = await Project.findById(req.params.id)
      .populate("customer")
      .populate({
        path: "bids",
        populate: {
          path: "seller",
          select: "name companyName email phone rating profileImage",

        },
      })
      .populate({
        path: "selectedBid", // ✅ This should be the ObjectId, not the full bid object
        select: "_id", // ✅ Only select the _id to avoid serialization issues
      });

    if (!project) {
      req.flash("error", "Project not found");
      return res.redirect("/customer/my-projects");
    }

    if (project.customer._id.toString() !== req.session.userId.toString()) {
      req.flash("error", "Unauthorized access");
      return res.redirect("/customer/my-projects");
    }

    // Get contract information
    const contract = await Contract.findOne({ project: req.params.id })
      .populate("seller", "name companyName email phone")
      .populate("bid", "amount proposal");

    const userData = req.session.user || { name: "Customer", email: "" };

    res.render("customer/project-details", {
      user: userData,
      currentPage: "projects",
      project,
      bids: project.bids || [],
      contract: contract || null,
      moment: moment,
    });
  } catch (error) {
    console.error("Get project details error:", error);
    req.flash("error", "Error loading project details");
    res.redirect("/customer/my-projects");
  }
};
// Get Bids Page - ENHANCED with automatic processing
exports.getBids = async (req, res) => {
  try {
    const customerId = req.session.userId;

    // ✅ Force status update before showing bids
    await statusAutomation.updateAllProjectStatuses();

    // Get customer's projects
    const customerProjects = await Project.find({
      customer: customerId,
    }).select("_id");
    const projectIds = customerProjects.map((p) => p._id);

    // Get all bids for customer's projects
    const bids = await Bid.find({ project: { $in: projectIds } })
      .populate("project", "title category featuredImage bidSettings")
      .populate("seller", "name companyName email phone rating profileImage")
      .sort({ createdAt: -1 });

    const userData = req.session.user || { name: "Customer", email: "" };

    res.render("customer/bids", {
      user: userData,
      currentPage: "bids",
      bids: bids || [],
      moment: moment,
    });
  } catch (error) {
    console.error("Get bids error:", error);
    req.flash("error", "Error loading bids");
    res.redirect("/customer/dashboard");
  }
};

// NEW: Get project bids specifically
exports.getProjectBids = async (req, res) => {
  try {
    const { projectId } = req.params;
    const customerId = req.session.userId;

    const project = await Project.findById(projectId);
    if (!project || project.customer.toString() !== customerId) {
      req.flash("error", "Project not found or unauthorized");
      return res.redirect("/customer/my-projects");
    }

    const bids = await Bid.find({ project: projectId })
      .populate("seller", "name companyName email phone rating profileImage")
      .sort({ amount: -1 });

    const userData = req.session.user || { name: "Customer", email: "" };

    res.render("customer/project-bids", {
      user: userData,
      currentPage: "projects",
      project: project,
      bids: bids,
      moment: moment,
    });
  } catch (error) {
    console.error("Get project bids error:", error);
    req.flash("error", "Error loading project bids");
    res.redirect("/customer/my-projects");
  }
};

// NEW: Get won projects with contracts
exports.getWonProjects = async (req, res) => {
  try {
    const customerId = req.session.userId;

    // Get projects where customer has selected a bid or bid was auto-won
    const wonProjects = await Project.find({
      customer: customerId,
      selectedBid: { $exists: true },
      status: { $in: ["in-progress", "completed"] },
    })
      .populate("selectedBid")
      .populate({
        path: "selectedBid",
        populate: {
          path: "seller",
          select: "name companyName email phone",
        },
      })
      .sort({ updatedAt: -1 });

    // Get contract information for each project
    const projectsWithContracts = [];
    for (const project of wonProjects) {
      const contract = await Contract.findOne({ project: project._id });
      projectsWithContracts.push({
        project: project,
        contract: contract,
      });
    }

    const userData = req.session.user || { name: "Customer", email: "" };

    res.render("customer/won-projects", {
      user: userData,
      currentPage: "won-projects",
      projects: projectsWithContracts,
      moment: moment,
    });
  } catch (error) {
    console.error("Get won projects error:", error);
    req.flash("error", "Error loading won projects");
    res.redirect("/customer/dashboard");
  }
};

// NEW: Get contract status
exports.getContractStatus = async (req, res) => {
  try {
    const { projectId } = req.params;
    const customerId = req.session.userId;

    const project = await Project.findById(projectId);
    if (!project || project.customer.toString() !== customerId) {
      req.flash("error", "Project not found or unauthorized");
      return res.redirect("/customer/my-projects");
    }

    const contract = await Contract.findOne({ project: projectId })
      .populate("seller", "name companyName")
      .populate("bid", "amount proposal");

    const userData = req.session.user || { name: "Customer", email: "" };

    res.render("customer/contract-status", {
      user: userData,
      currentPage: "projects",
      project: project,
      contract: contract,
      moment: moment,
    });
  } catch (error) {
    console.error("Get contract status error:", error);
    req.flash("error", "Error loading contract status");
    res.redirect("/customer/my-projects");
  }
};

// Get Profile Page
exports.getProfile = async (req, res) => {
  try {
    const user = await User.findById(req.session.userId);

    if (!user) {
      req.flash("error", "User not found");
      return res.redirect("/customer/dashboard");
    }

    const userData = req.session.user || { name: "Customer", email: "" };

    res.render("customer/profile", {
      user: userData,
      currentPage: "profile",
      profile: user,
    });
  } catch (error) {
    console.error("Get profile error:", error);
    req.flash("error", "Error loading profile");
    res.redirect("/customer/dashboard");
  }
};

// Update Profile Image
exports.updateProfileImage = async (req, res) => {
  try {
    if (!req.file) {
      req.flash("error", "Please select an image to upload");
      return res.redirect("/customer/profile");
    }

    const user = await User.findById(req.session.userId);

    if (!user) {
      req.flash("error", "User not found");
      return res.redirect("/customer/profile");
    }

    // Delete old profile image from Cloudinary if exists
    if (user.profileImage && user.profileImage.public_id) {
      try {
        await cloudinary.uploader.destroy(user.profileImage.public_id);
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
      width: req.file.width,
      height: req.file.height,
      uploadedAt: new Date(),
    };

    await user.save();

    // Update session user data
    req.session.user.profileImage = user.profileImage;

    req.flash("success", "Profile image updated successfully!");
    res.redirect("/customer/profile");
  } catch (error) {
    console.error("Update profile image error:", error);
    req.flash("error", "Error updating profile image: " + error.message);
    res.redirect("/customer/profile");
  }
};

// Get Messages Page
exports.getMessages = async (req, res) => {
  try {
    const userData = req.session.user || { name: "Customer", email: "" };

    res.render("customer/messages", {
      user: userData,
      currentPage: "messages",
      messages: [],
    });
  } catch (error) {
    console.error("Get messages error:", error);
    req.flash("error", "Error loading messages");
    res.redirect("/customer/dashboard");
  }
};

// Get Notices Page
exports.getNotices = async (req, res) => {
  try {
    const notices = await Notice.find({
      $or: [{ targetAudience: "all" }, { targetAudience: "customer" }],
      isActive: true,
      startDate: { $lte: new Date() },
      $or: [{ endDate: { $gte: new Date() } }, { endDate: null }],
    }).sort({ createdAt: -1 });

    const userData = req.session.user || { name: "Customer", email: "" };

    res.render("customer/notices", {
      user: userData,
      currentPage: "notices",
      notices: notices || [],
    });
  } catch (error) {
    console.error("Get notices error:", error);
    req.flash("error", "Error loading notices");
    res.redirect("/customer/dashboard");
  }
};

//get support
exports.getSupport = async (req,res)=>{
  res.render("customer/support")
}

// Project Management
exports.getAddProject = async (req, res) => {
  try {
    const userData = req.session.user || { name: "Customer", email: "" };

    res.render("customer/add-project", {
      user: userData,
      currentPage: "add-project",
      categories: [
        "electrification",
        "architecture",
        "interior-design",
        "general-construction",
      ],
    });
  } catch (error) {
    console.error("Get add project error:", error);
    req.flash("error", "Error loading project form");
    res.redirect("/customer/dashboard");
  }
};

// Get Project Form with step parameter
exports.getProjectForm = async (req, res) => {
  try {
    const { category } = req.params;
    const { step = 1 } = req.query;

    const userData = req.session.user || { name: "Customer", email: "" };

    res.render("customer/project-form", {
      user: userData,
      currentPage: "add-project",
      category,
      step: parseInt(step),
      projectData: req.session.projectData || {},
    });
  } catch (error) {
    console.error("Get project form error:", error);
    req.flash("error", "Error loading project form");
    res.redirect("/customer/add-project");
  }
};

exports.postProjectStep1 = async (req, res) => {
  try {
    const { category } = req.params;

    console.log("=== STEP 1 DEBUG ===");
    console.log("Request body:", req.body);

    // Store step 1 data in session
    req.session.projectData = {
      ...req.session.projectData,
      title: req.body.title,
      description: req.body.description,
      phone: req.body.phone,
      address: req.body.address,
      city: req.body.city,
      state: req.body.state,
      zipCode: req.body.zipCode,
      category: category,
    };

    console.log("Session data after step 1:", req.session.projectData);

    res.redirect(`/customer/project-form/${category}?step=2`);
  } catch (error) {
    console.error("Project step 1 error:", error);
    req.flash("error", "Error saving project details");
    res.redirect("back");
  }
};

exports.postProjectStep2 = async (req, res) => {
  try {
    const { category } = req.params;

    console.log("=== STEP 2 DEBUG ===");
    console.log("Request body:", req.body);
    console.log("Files:", req.files);

    // Process Cloudinary uploads
    const imageFiles = req.files?.images || [];
    const documentFiles = req.files?.documents || [];

    const processedImages = imageFiles.map((file) => ({
      public_id: file.filename,
      url: file.path,
      filename: file.originalname,
      format: file.format,
      bytes: file.size,
      width: file.width,
      height: file.height,
      createdAt: new Date(),
    }));

    const processedDocuments = documentFiles.map((file) => ({
      public_id: file.filename,
      url: file.path,
      filename: file.originalname,
      format: file.format,
      bytes: file.size,
      originalName: file.originalname,
      uploadedAt: new Date(),
    }));

    req.session.projectData = {
      ...req.session.projectData,
      requirements: req.body.requirements,
      specifications: req.body.specifications || {},
      images: processedImages,
      documents: processedDocuments,
    };

    console.log("Session data after step 2:", req.session.projectData);

    res.redirect(`/customer/project-form/${category}?step=3`);
  } catch (error) {
    console.error("Project step 2 error:", error);
    req.flash("error", "Error uploading files: " + error.message);
    res.redirect("back");
  }
};


// Bid Management
exports.selectBid = async (req, res) => {
  try {
    const { bidId } = req.params;

    const bid = await Bid.findById(bidId)
      .populate("project")
      .populate("seller");

    if (!bid) {
      req.flash("error", "Bid not found");
      return res.redirect("back");
    }

    // Check if project belongs to customer
    if (bid.project.customer.toString() !== req.session.userId.toString()) {
      req.flash("error", "Unauthorized action");
      return res.redirect("back");
    }

    // Update bid status to won
    bid.status = "won";
    bid.isSelected = true;
    await bid.save();

    // Update other bids for this project to lost
    await Bid.updateMany(
      {
        project: bid.project._id,
        _id: { $ne: bidId },
        status: "submitted",
      },
      { status: "lost" }
    );

    // Update project with selected bid and change status
    const project = await Project.findById(bid.project._id);
    project.selectedBid = bidId;
    project.status = "in-progress";
    await project.save();

    req.flash(
      "success",
      `Bid selected successfully! ${
        bid.seller.companyName || bid.seller.name
      } has been awarded the project.`
    );
    res.redirect(`/customer/project/${bid.project._id}`);
  } catch (error) {
    console.error("Bid selection error:", error);
    req.flash("error", "Error selecting bid");
    res.redirect("back");
  }
};

exports.editProject = async (req, res) => {
  try {
    const project = await Project.findById(req.params.id);

    if (!project) {
      req.flash("error", "Project not found");
      return res.redirect("/customer/my-projects");
    }

    if (project.customer.toString() !== req.session.userId.toString()) {
      req.flash("error", "Unauthorized access");
      return res.redirect("/customer/my-projects");
    }

    // FIXED: Allow both "drafted" AND "defected" projects to be edited
    if (project.status !== "drafted" && project.status !== "defected") {
      req.flash("error", "Only drafted or defected projects can be edited");
      return res.redirect("/customer/my-projects");
    }

    const userData = req.session.user || { name: "Customer", email: "" };

    res.render("customer/project-edit", {
      user: userData,
      currentPage: "projects",
      project,
      category: project.category,
      csrfToken: req.csrfToken ? req.csrfToken() : ''
    });
  } catch (error) {
    console.error("Edit project error:", error);
    req.flash("error", "Error loading project for editing");
    res.redirect("/customer/my-projects");
  }
};
exports.updateProject = async (req, res) => {
  try {
    const project = await Project.findById(req.params.id);

    if (!project) {
      req.flash("error", "Project not found");
      return res.redirect("/customer/my-projects");
    }

    if (project.customer.toString() !== req.session.userId.toString()) {
      req.flash("error", "Unauthorized access");
      return res.redirect("/customer/my-projects");
    }

    console.log('Original project status:', project.status);
    console.log('Original adminStatus:', project.adminStatus);
    console.log('Resubmit value:', req.body.resubmit);

    // Update basic fields
    project.title = req.body.title;
    project.description = req.body.description;
    project.requirements = req.body.requirements;
    
    // Update contact
    project.contact.phone = req.body.phone;
    
    // Update location
    project.location = {
      address: req.body.address,
      city: req.body.city,
      state: req.body.state,
      zipCode: req.body.zipCode
    };

    // Update specifications
    if (req.body.specifications) {
      for (const [key, value] of Object.entries(req.body.specifications)) {
        project.specifications.set(key, value);
      }
    }

    // Handle new image uploads (if using Cloudinary)
    if (req.files && req.files.images) {
      const images = Array.isArray(req.files.images) ? req.files.images : [req.files.images];
      
      for (const image of images) {
        // Upload to cloudinary or your storage service
        const result = await cloudinary.uploader.upload(image.tempFilePath, {
          folder: `projects/${project._id}`
        });
        
        project.images.push({
          url: result.secure_url,
          public_id: result.public_id
        });
      }
    }

    // Handle resubmission - FIXED LOGIC
    if (req.body.resubmit === 'true') {
      console.log('Processing resubmission...');
      project.adminStatus = 'pending';
      project.status = 'submitted'; // Changed from 'in-progress' to 'submitted'
      project.adminRemarks = ''; // Clear previous remarks
      project.resubmittedAt = new Date();
      req.flash("success", "Project updated and resubmitted for verification");
    } else {
      // Regular update - keep current status
      console.log('Regular update, maintaining status:', project.status);
      req.flash("success", "Project updated successfully");
    }

    console.log('Final project status after update:', project.status);
    console.log('Final adminStatus after update:', project.adminStatus);

    await project.save();
    res.redirect("/customer/my-projects");

  } catch (error) {
    console.error("Update project error:", error);
    
    // More detailed error logging
    if (error.name === 'ValidationError') {
      console.error('Validation errors:', error.errors);
      req.flash("error", `Validation error: ${Object.values(error.errors).map(e => e.message).join(', ')}`);
    } else {
      req.flash("error", "Error updating project");
    }
    
    res.redirect("/customer/my-projects");
  }
};
exports.deleteProject = async (req, res) => {
  try {
    const project = await Project.findById(req.params.id);

    if (!project) {
      req.flash("error", "Project not found");
      return res.redirect("/customer/my-projects");
    }

    if (project.customer.toString() !== req.session.userId.toString()) {
      req.flash("error", "Unauthorized access");
      return res.redirect("/customer/my-projects");
    }

    // Only allow deletion of drafted or defected projects
    if (project.status !== "drafted" && project.status !== "defected") {
      req.flash("error", "Only drafted or defected projects can be deleted");
      return res.redirect("/customer/my-projects");
    }

    // Delete associated images from cloudinary
    for (const image of project.images) {
      await cloudinary.uploader.destroy(image.public_id);
    }

    await Project.findByIdAndDelete(req.params.id);

    req.flash("success", "Project deleted successfully");
    res.redirect("/customer/my-projects");
  } catch (error) {
    console.error("Delete project error:", error);
    req.flash("error", "Error deleting project");
    res.redirect("/customer/my-projects");
  }
};

exports.removeImage = async (req, res) => {
  try {
    const { projectId, imageId } = req.params;
    
    const project = await Project.findById(projectId);

    if (!project) {
      req.flash("error", "Project not found");
      return res.redirect("/customer/my-projects");
    }

    if (project.customer.toString() !== req.session.userId.toString()) {
      req.flash("error", "Unauthorized access");
      return res.redirect("/customer/my-projects");
    }

    // Find the image to remove
    const imageIndex = project.images.findIndex(img => img.public_id === imageId);
    
    if (imageIndex === -1) {
      req.flash("error", "Image not found");
      return res.redirect(`/customer/edit-project/${projectId}`);
    }

    // Remove from cloudinary
    await cloudinary.uploader.destroy(imageId);
    
    // Remove from project
    project.images.splice(imageIndex, 1);
    await project.save();

    req.flash("success", "Image removed successfully");
    res.redirect(`/customer/edit-project/${projectId}`);
  } catch (error) {
    console.error("Remove image error:", error);
    req.flash("error", "Error removing image");
    res.redirect("/customer/my-projects");
  }
};

// Add Image to Project
exports.addProjectImage = async (req, res) => {
  try {
    const { projectId } = req.params;

    if (!req.file) {
      req.flash("error", "Please select an image to upload");
      return res.redirect("back");
    }

    const project = await Project.findById(projectId);

    if (
      !project ||
      project.customer.toString() !== req.session.userId.toString()
    ) {
      req.flash("error", "Project not found or unauthorized");
      return res.redirect("back");
    }

    if (project.status !== "drafted") {
      req.flash("error", "Only drafted projects can be modified");
      return res.redirect("back");
    }

    const imageData = {
      public_id: req.file.filename,
      url: req.file.path,
      filename: req.file.originalname,
      format: req.file.format,
      bytes: req.file.size,
      width: req.file.width,
      height: req.file.height,
    };

    await project.addImage(imageData);

    req.flash("success", "Image added successfully!");
    res.redirect(`/customer/project/${projectId}`);
  } catch (error) {
    console.error("Add project image error:", error);
    req.flash("error", "Error adding image: " + error.message);
    res.redirect("back");
  }
};

// Remove Image from Project
exports.removeProjectImage = async (req, res) => {
  try {
    const { projectId, publicId } = req.params;

    const project = await Project.findById(projectId);

    if (
      !project ||
      project.customer.toString() !== req.session.userId.toString()
    ) {
      req.flash("error", "Project not found or unauthorized");
      return res.redirect("back");
    }

    if (project.status !== "drafted") {
      req.flash("error", "Only drafted projects can be modified");
      return res.redirect("back");
    }

    // Delete from Cloudinary
    await cloudinary.uploader.destroy(publicId);

    // Remove from database
    await project.removeImage(publicId);

    req.flash("success", "Image removed successfully!");
    res.redirect(`/customer/project/${projectId}`);
  } catch (error) {
    console.error("Remove project image error:", error);
    req.flash("error", "Error removing image: " + error.message);
    res.redirect("back");
  }
};

// Remove Document from Project
exports.removeProjectDocument = async (req, res) => {
  try {
    const { projectId, publicId } = req.params;

    const project = await Project.findById(projectId);

    if (
      !project ||
      project.customer.toString() !== req.session.userId.toString()
    ) {
      req.flash("error", "Project not found or unauthorized");
      return res.redirect("back");
    }

    if (project.status !== "drafted") {
      req.flash("error", "Only drafted projects can be modified");
      return res.redirect("back");
    }

    // Delete from Cloudinary
    await cloudinary.uploader.destroy(publicId);

    // Remove from database
    project.documents = project.documents.filter(
      (doc) => doc.public_id !== publicId
    );
    await project.save();

    req.flash("success", "Document removed successfully!");
    res.redirect(`/customer/project/${projectId}`);
  } catch (error) {
    console.error("Remove project document error:", error);
    req.flash("error", "Error removing document: " + error.message);
    res.redirect("back");
  }
};
// In customerController.js - Enhance uploadCustomerContract function

exports.downloadContract = async (req, res) => {
  try {
    const { bidId } = req.params;

    const bid = await Bid.findById(bidId)
      .populate("project")
      .populate("seller")
      .populate("customer");

    if (!bid) {
      req.flash("error", "Bid not found");
      return res.redirect("back");
    }

    // Check if contract already exists and has final version
    const existingContract = await Contract.findOne({ bid: bidId });

    if (existingContract && existingContract.finalContract?.url) {
      return res.redirect(existingContract.finalContract.url);
    }

    if (existingContract && existingContract.customerSignedContract?.url) {
      return res.redirect(existingContract.customerSignedContract.url);
    }

    // Generate contract template
    const contractContent = this.generateContractTemplate(bid);

    // Set response headers for download
    res.setHeader("Content-Type", "text/plain");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename=contract-${bidId}.txt`
    );
    res.send(contractContent);
  } catch (error) {
    console.error("Contract download error:", error);
    req.flash("error", "Error generating contract");
    res.redirect("back");
  }
};
// Fix the uploadCustomerContract method
// FIXED: Update the uploadCustomerContract method
exports.uploadCustomerContract = async (req, res) => {
  try {
    const { bidId } = req.body;
    const customerId = req.session.userId;

    console.log("=== UPLOAD CUSTOMER CONTRACT DEBUG ===");
    console.log("Raw bidId from request:", bidId);
    console.log("Customer ID:", customerId);
    console.log("File received:", req.file);

    if (!req.file) {
      req.flash("error", "Please select a signed contract file");
      return res.redirect("back");
    }

    // ✅ FIX: Validate and extract proper bidId
    let actualBidId = bidId;

    // Check if bidId is actually a full bid object (stringified)
    if (typeof bidId === "string" && bidId.includes("ObjectId")) {
      console.log("⚠️ Detected stringified bid object, extracting _id...");

      // Extract the ObjectId from the string
      const match = bidId.match(/ObjectId\("([a-f0-9]+)"\)/);
      if (match && match[1]) {
        actualBidId = match[1];
        console.log("✅ Extracted bidId:", actualBidId);
      } else {
        throw new Error("Invalid bidId format");
      }
    }

    // Validate that actualBidId is a valid MongoDB ObjectId
    if (!mongoose.Types.ObjectId.isValid(actualBidId)) {
      console.error("❌ Invalid bidId:", actualBidId);
      req.flash("error", "Invalid bid identifier");
      return res.redirect("/customer/my-projects");
    }

    console.log("🔍 Searching for bid with ID:", actualBidId);

    const bid = await Bid.findOne({ _id: actualBidId }).populate("project");
    if (!bid) {
      console.error("❌ Bid not found with ID:", actualBidId);
      req.flash("error", "Bid not found");
      return res.redirect("/customer/my-projects");
    }

    // Check if customer owns the project
    if (bid.project.customer.toString() !== customerId) {
      req.flash("error", "Unauthorized access");
      return res.redirect("/customer/my-projects");
    }

    const contract = await Contract.findOne({ bid: actualBidId });
    if (!contract) {
      req.flash("error", "Contract not found");
      return res.redirect("/customer/my-projects");
    }

    if (contract.status !== "pending-customer") {
      req.flash("error", "Cannot upload contract at this stage");
      return res.redirect("/customer/my-projects");
    }

    // Update contract with signed document
    contract.customerSignedContract = {
      public_id: req.file.filename,
      url: req.file.path,
      filename: req.file.originalname,
      bytes: req.file.size,
      uploadedAt: new Date(),
      signatureDate: new Date(),
      uploadedBy: "customer",
    };

    // Move to next step
    contract.status = "pending-seller";
    contract.currentStep = 2;
    contract.updatedAt = new Date();

    await contract.save();

    console.log("✅ Customer contract uploaded successfully");

    // Notify seller
    const Notice = require("../models/Notice");
    await Notice.create({
      title: `Customer Contract Uploaded - ${bid.project.title}`,
      content:
        "Customer has uploaded their signed contract. You can now download the template and upload your signed contract.",
      targetAudience: "seller",
      specificUser: bid.seller,
      noticeType: "info",
      isActive: true,
      startDate: new Date(),
      endDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    });

    req.flash(
      "success",
      "Contract uploaded successfully! Seller will now upload their contract."
    );
    res.redirect(`/customer/project/${bid.project._id}`);
  } catch (error) {
    console.error("❌ Upload customer contract error:", error);
    req.flash("error", "Error uploading contract: " + error.message);
    res.redirect("back");
  }
};

exports.generateContractTemplate = (bid) => {
  // Add null checks for timeline
  const timelineText =
    bid.timeline && bid.timeline.startDate && bid.timeline.endDate
      ? `${new Date(bid.timeline.startDate).toDateString()} to ${new Date(
          bid.timeline.endDate
        ).toDateString()}`
      : "To be determined";

  return `
CONTRACT AGREEMENT

This Agreement is made on ${new Date().toDateString()} between:

Customer: ${bid.customer?.name || "Customer"}
Email: ${bid.customer?.email || "N/A"}

AND

Service Provider: ${
    bid.seller?.companyName || bid.seller?.name || "Service Provider"
  }
Email: ${bid.seller?.email || "N/A"}

PROJECT: ${bid.project?.title || "Project"}
AGREED AMOUNT: $${bid.amount || "0"}
TIMELINE: ${timelineText}

Terms and Conditions:
1. The Service Provider agrees to complete the work as described in the project requirements.
2. The Customer agrees to make payments as scheduled.
3. Both parties agree to resolve disputes through mediation.
4. This contract is binding upon both parties.

Signatures:

_________________________
Customer Signature

_________________________
Service Provider Signature

Date: ___________________
    `;
};

// View Contract
exports.viewContract = async (req, res) => {
  try {
    const { projectId } = req.params;

    const contract = await Contract.findOne({ project: projectId })
      .populate("customer", "name email")
      .populate("seller", "name companyName email")
      .populate("project", "title description requirements")
      .populate("bid", "amount proposal timeline");

    if (!contract) {
      req.flash("error", "Contract not found");
      return res.redirect(`/customer/project/${projectId}`);
    }

    const userData = req.session.user || { name: "Customer", email: "" };

    res.render("/customer/contract-view", {
      user: userData,
      currentPage: "projects",
      contract,
      moment: require("moment"),
    });
  } catch (error) {
    console.error("View contract error:", error);
    req.flash("error", "Error loading contract");
    res.redirect("back");
  }
};

// Download Certificate - NEW
exports.downloadCertificate = async (req, res) => {
  try {
    const { bidId } = req.params;
    const customerId = req.session.userId;

    const bid = await Bid.findOne({ _id: bidId, customer: customerId });
    if (!bid) {
      req.flash("error", "Bid not found");
      return res.redirect("/customer/my-projects");
    }

    if (!bid.certificateGenerated || !bid.certificateUrl) {
      req.flash("error", "Certificate not yet generated");
      return res.redirect("/customer/my-projects");
    }

    // Redirect to certificate URL
    res.redirect(bid.certificateUrl);
  } catch (error) {
    console.error("Download certificate error:", error);
    req.flash("error", "Error downloading certificate: " + error.message);
    res.redirect("/customer/my-projects");
  }
};

// Update Profile Information
exports.updateProfile = async (req, res) => {
  try {
    const { name, phone, address, city, state, zipCode, bio } = req.body;

    const user = await User.findById(req.session.userId);

    if (!user) {
      req.flash("error", "User not found");
      return res.redirect("/customer/profile");
    }

    user.name = name;
    user.phone = phone;
    user.bio = bio;
    user.address = {
      street: address,
      city: city,
      state: state,
      zipCode: zipCode,
    };

    await user.save();

    // Update session
    req.session.user.name = user.name;
    req.session.user.phone = user.phone;

    req.flash("success", "Profile updated successfully!");
    res.redirect("/customer/profile");
  } catch (error) {
    console.error("Update profile error:", error);
    req.flash("error", "Error updating profile: " + error.message);
    res.redirect("/customer/profile");
  }
};

// Change Password
exports.changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword, confirmPassword } = req.body;

    if (newPassword !== confirmPassword) {
      req.flash("error", "New passwords do not match");
      return res.redirect("/customer/profile");
    }

    if (newPassword.length < 6) {
      req.flash("error", "Password must be at least 6 characters long");
      return res.redirect("/customer/profile");
    }

    const user = await User.findById(req.session.userId);

    if (!user) {
      req.flash("error", "User not found");
      return res.redirect("/customer/profile");
    }

    // Verify current password
    const isCurrentPasswordValid = await user.comparePassword(currentPassword);
    if (!isCurrentPasswordValid) {
      req.flash("error", "Current password is incorrect");
      return res.redirect("/customer/profile");
    }

    // Update password
    user.password = newPassword;
    await user.save();

    req.flash("success", "Password changed successfully!");
    res.redirect("/customer/profile");
  } catch (error) {
    console.error("Change password error:", error);
    req.flash("error", "Error changing password: " + error.message);
    res.redirect("/customer/profile");
  }
};

// NEW: Enhanced download method with proper Cloudinary handling

// exports.downloadContractTemplate = async (req, res) => {
//   try {
//     const { bidId } = req.params;
//     const customerId = req.session.userId;

//     console.log("📥 Download contract template request:", {
//       bidId,
//       customerId,
//     });

//     // const bid = await Bid.findOne({ _id: bidId }).populate("project");
//     const bid = await Bid.findOne({ _id: bidId._id }).populate("project");
//     console.log("this is bid", bid);
//     console.log("this is customer to compare", customerId);
//     console.log(
//       "this is bid.project.customer",
//       bid.project.customer.toString()
//     );

//     console.log("clear from my side i.e. the problem in bid id is a object");
//     if (!bid || bid.project.customer.toString() !== customerId) {
//       req.flash("error", "Unauthorized access");
//       return res.redirect("/customer/my-projects");
//     }

//     // const contract = await Contract.findOne({ bid: bidId });
//     const contract = await Contract.findOne({ bid: bidId._id });
//     if (!contract) {
//       req.flash("error", "Contract not found");
//       return res.redirect("/customer/my-projects");
//     }

//     if (!contract.customerTemplate || !contract.customerTemplate.url) {
//       req.flash("error", "Contract template not available yet");
//       return res.redirect("/customer/my-projects");
//     }

//     console.log("🔗 Cloudinary URL:", contract.customerTemplate.url);

//     // ✅ FIX: Use Cloudinary download URL transformation
//     let downloadUrl = contract.customerTemplate.url;

//     // Transform the URL to force download
//     if (downloadUrl.includes("/upload/")) {
//       downloadUrl = downloadUrl.replace("/upload/", "/upload/fl_attachment/");
//     }

//     console.log("🔗 Transformed URL:", downloadUrl);

//     // Set proper headers for PDF download
//     res.setHeader(
//       "Content-Disposition",
//       `attachment; filename="contract_template_${bidId}.pdf"`
//     );
//     res.setHeader("Content-Type", "application/pdf");

//     // Redirect to the transformed Cloudinary URL
//     res.redirect(downloadUrl);
//   } catch (error) {
//     console.error("❌ Download contract template error:", error);
//     req.flash("error", "Error downloading contract template: " + error.message);
//     res.redirect("/customer/my-projects");
//   }
// };

//to debug contract template

// const cloudinary = require("../config/cloudinary"); // ✅ make sure this is configured properly

exports.downloadContractTemplate = async (req, res) => {
  try {
    const { bidId } = req.params;
    const customerId = req.session.userId;

    console.log("=== 📥 DOWNLOAD CONTRACT TEMPLATE REQUEST START ===");
    console.log("Raw req.params.bidId:", bidId);
    console.log("Customer ID from session:", customerId);

    // ✅ Handle weird bidId formats (string or object-like string)
    let extractedBidId;
    if (typeof bidId === "string") {
      const match = bidId.match(/ObjectId\("([a-f0-9]+)"\)/i);
      extractedBidId = match ? match[1] : bidId;
    } else if (bidId && typeof bidId === "object" && bidId._id) {
      extractedBidId = bidId._id.toString();
    } else {
      extractedBidId = bidId?.toString?.() || bidId;
    }

    console.log("🆔 Extracted Bid ID:", extractedBidId);

    // ✅ Fetch bid
    const bid = await Bid.findOne({ _id: extractedBidId }).populate("project");
    console.log("📄 Bid fetched:", bid ? "✅ Found" : "❌ Not Found");

    if (!bid) {
      console.log("❌ No bid found for ID:", extractedBidId);
      req.flash("error", "Bid not found");
      return res.redirect("/customer/my-projects");
    }

    console.log("📂 Bid.project:", bid.project ? "✅ Present" : "❌ Missing");
    if (bid.project) {
      console.log("🔗 bid.project.customer:", bid.project.customer);
      console.log("🧍 Customer to compare:", customerId);
      console.log(
        "Comparison Result:",
        bid.project.customer?.toString() === customerId
      );
    }

    // ✅ Access control
    if (!bid.project || bid.project.customer.toString() !== customerId) {
      console.log("🚫 Unauthorized access detected!");
      req.flash("error", "Unauthorized access");
      return res.redirect("/customer/my-projects");
    }

    // ✅ Fetch contract
    const contract = await Contract.findOne({ bid: extractedBidId });
    console.log("📄 Contract fetched:", contract ? "✅ Found" : "❌ Not Found");

    if (!contract) {
      req.flash("error", "Contract not found");
      return res.redirect("/customer/my-projects");
    }

    if (!contract.customerTemplate || !contract.customerTemplate.url) {
      console.log("❌ Contract template missing");
      req.flash("error", "Contract template not available yet");
      return res.redirect("/customer/my-projects");
    }

    const publicId = contract.customerTemplate.public_id
      ? contract.customerTemplate.public_id
      : contract.customerTemplate.url.split("/upload/")[1]?.split(".pdf")[0];

    console.log("📂 Extracted publicId:", publicId);

    // ✅ Generate signed private download URL
    const signedUrl = cloudinary.utils.private_download_url(publicId, "pdf", {
      resource_type: "raw", // Required for PDFs
      type: "authenticated", // Since file was uploaded as authenticated
      attachment: true, // Force download
    });

    console.log("🔗 Cloudinary Signed Download URL:", signedUrl);

    // ✅ Set headers for download (optional)
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="contract_template_${extractedBidId}.pdf"`
    );
    res.setHeader("Content-Type", "application/pdf");

    console.log("✅ Redirecting user to signed Cloudinary URL...");
    console.log("=== ✅ DOWNLOAD CONTRACT TEMPLATE END ===\n");

    return res.redirect(signedUrl);
  } catch (error) {
    console.error("❌ Download contract template error:", error);
    req.flash("error", "Error downloading contract template: " + error.message);
    return res.redirect("/customer/my-projects");
  }
};

// exports.downloadContractTemplate = async (req, res) => {
//   try {
//     const { bidId } = req.params;
//     const customerId = req.session.userId;

//     console.log("=== 📥 CUSTOMER CONTRACT DOWNLOAD START ===");
//     console.log("Raw req.params.bidId:", bidId);
//     console.log("Customer ID:", customerId);

//     // 🧩 Normalize Bid ID
//     const extractedBidId =
//       typeof bidId === "string"
//         ? bidId.match(/ObjectId\("([a-f0-9]+)"\)/i)?.[1] || bidId
//         : bidId?._id?.toString?.() || bidId?.toString?.();

//     // 🔍 Fetch bid
//     const bid = await Bid.findOne({ _id: extractedBidId }).populate("project");
//     if (!bid || bid.project.customer.toString() !== customerId) {
//       console.log("🚫 Unauthorized or invalid bid");
//       req.flash("error", "Unauthorized access or invalid bid");
//       return res.redirect("/customer/my-projects");
//     }

//     // 🔍 Fetch contract
//     const contract = await Contract.findOne({ bid: extractedBidId });
//     if (!contract?.customerTemplate?.url) {
//       console.log("❌ Customer contract template missing");
//       req.flash("error", "Contract template not available yet");
//       return res.redirect("/customer/my-projects");
//     }

//     const fileUrl = contract.customerTemplate.url;
//     console.log("🔗 Customer template URL:", fileUrl);

//     // ✅ If it's a public file, redirect directly
//     if (fileUrl.includes("/upload/")) {
//       console.log("🌍 Public Cloudinary file detected — redirecting directly.");
//       return res.redirect(fileUrl);
//     }

//     // 🔐 Otherwise, generate signed private URL for older authenticated files
//     const match = fileUrl.match(/\/v\d+\/(.+)\.pdf$/);
//     if (!match) {
//       console.error("❌ Invalid Cloudinary file path");
//       req.flash("error", "Invalid Cloudinary file path");
//       return res.redirect("/customer/my-projects");
//     }

//     const publicId = match[1];
//     const signedUrl = cloudinary.utils.private_download_url(publicId, "pdf", {
//       resource_type: "raw",
//       type: "authenticated",
//       attachment: true,
//     });

//     console.log("✅ Signed private download URL:", signedUrl);
//     return res.redirect(signedUrl);
//   } catch (error) {
//     console.error("❌ Download customer contract error:", error);
//     req.flash("error", "Error downloading contract template");
//     return res.redirect("/customer/my-projects");
//   }
// };

// const { Bid, Contract } = require("../models"); // adjust import paths as needed

// const { generateCustomerContractUrl } = require("../utils/cloudinaryUtils");

// exports.downloadContractTemplate = async (req, res) => {
//   try {
//     const { bidId } = req.params;
//     const customerId = req.session.userId;

//     console.log("=== 📥 CUSTOMER CONTRACT DOWNLOAD START ===");
//     console.log("Raw req.params.bidId:", bidId);
//     console.log("Customer ID:", customerId);

//     // 🧩 Normalize Bid ID
//     const extractedBidId =
//       typeof bidId === "string"
//         ? bidId.match(/ObjectId\("([a-f0-9]+)"\)/i)?.[1] || bidId
//         : bidId?._id?.toString?.() || bidId?.toString?.();

//     // 🔍 Fetch bid and ensure it belongs to this customer
//     const bid = await Bid.findOne({ _id: extractedBidId }).populate("project");
//     if (
//       !bid ||
//       !bid.project ||
//       bid.project.customer.toString() !== customerId
//     ) {
//       console.log("🚫 Unauthorized or invalid bid");
//       req.flash("error", "Unauthorized access or invalid bid");
//       return res.redirect("/customer/my-projects");
//     }

//     // 🔍 Fetch associated contract
//     const contract = await Contract.findOne({ bid: extractedBidId });
//     if (!contract?.customerTemplate?.url) {
//       console.log("❌ Customer contract template missing");
//       req.flash("error", "Contract template not available yet");
//       return res.redirect("/customer/my-projects");
//     }

//     const fileUrl = contract.customerTemplate.url;
//     console.log("🔗 Customer template Cloudinary URL:", fileUrl);

//     // ✅ If it's public, redirect directly
//     if (fileUrl.includes("/upload/")) {
//       console.log("🌍 Public Cloudinary file detected — redirecting directly.");
//       return res.redirect(fileUrl);
//     }

//     // 🔐 Otherwise, extract public_id for signed private access
//     const match = fileUrl.match(/\/v\d+\/(.+)\.pdf$/);
//     if (!match) {
//       console.error("❌ Invalid Cloudinary file path");
//       req.flash("error", "Invalid Cloudinary file path");
//       return res.redirect("/customer/my-projects");
//     }

//     const publicId = match[1];
//     console.log("🆔 Extracted public_id:", publicId);

//     // ✅ Use helper to generate signed URL
//     const signedUrl = generateCustomerContractUrl(publicId);

//     console.log("✅ Signed private download URL:", signedUrl);
//     console.log("=== ✅ CUSTOMER CONTRACT DOWNLOAD END ===\n");

//     return res.redirect(signedUrl);
//   } catch (error) {
//     console.error("❌ Download customer contract error:", error);
//     req.flash("error", "Error downloading contract template");
//     return res.redirect("/customer/my-projects");
//   }
// };





// NEW: Submit project for admin verification
exports.submitForVerification = async (req, res) => {
  try {
    const { projectId } = req.params;
    const customerId = req.session.userId;

    const project = await Project.findById(projectId);
    
    if (!project || project.customer.toString() !== customerId) {
      req.flash("error", "Project not found or unauthorized");
      return res.redirect("/customer/my-projects");
    }

    if (project.adminStatus !== 'pending' && project.adminStatus !== 'rejected') {
      req.flash("error", "Project cannot be submitted for verification");
      return res.redirect("/customer/my-projects");
    }

    project.adminStatus = 'pending';
    project.status = 'pending';
    await project.save();

    // Notify admin
    const Notice = require("../models/Notice");
    await Notice.create({
      title: `Project Submitted for Verification - ${project.title}`,
      content: `Project "${project.title}" has been submitted for admin verification.`,
      targetAudience: "admin",
      noticeType: "info",
      isActive: true,
      startDate: new Date(),
      endDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    });

    req.flash("success", "Project submitted for admin verification successfully!");
    res.redirect("/customer/my-projects");
  } catch (error) {
    console.error("Submit for verification error:", error);
    req.flash("error", "Error submitting project for verification");
    res.redirect("/customer/my-projects");
  }
};

// NEW: Get top 10 bids for round 1 selection

// NEW: Get round 2 bids for winner selection
exports.getRound2Bids = async (req, res) => {
  try {
    const { projectId } = req.params;
    const customerId = req.session.userId;

    const project = await Project.findById(projectId);
    if (!project || project.customer.toString() !== customerId) {
      req.flash("error", "Project not found or unauthorized");
      return res.redirect("/customer/my-projects");
    }

    if (project.biddingRounds.currentRound !== 2.5) {
      req.flash("error", "Round 2 not completed yet");
      return res.redirect(`/customer/project/${projectId}`);
    }

    const round2Bids = await Bid.find({
      project: projectId,
      round: 2,
      selectionStatus: 'top3'
    })
    .populate("seller", "name companyName email phone rating profileImage yearsOfExperience specialization companyDocuments")
    .sort({ amount: -1 });

    const userData = req.session.user || { name: "Customer", email: "" };

    res.render("customer/round2-selection", {
      user: userData,
      currentPage: "projects",
      project: project,
      bids: round2Bids,
      moment: require("moment")
    });
  } catch (error) {
    console.error("Get round 2 bids error:", error);
    req.flash("error", "Error loading round 2 bids");
    res.redirect("/customer/my-projects");
  }
};




// NEW: Manual status update
exports.updateStatuses = async (req, res) => {
  try {
    const statusAutomation = require('../services/statusAutomation');
    const result = await statusAutomation.updateAllProjectStatuses();
    
    req.flash('success', 'Status updates completed successfully!');
    res.redirect('/customer/my-projects');
  } catch (error) {
    console.error('Status update error:', error);
    req.flash('error', 'Error updating statuses: ' + error.message);
    res.redirect('/customer/my-projects');
  }
};



// UPDATED: Submit project for verification
// exports.postProjectStep3 = async (req, res) => {
//   try {
//     const { category } = req.params;
//     const customerId = req.session.userId;

//     console.log("=== PROJECT STEP 3 DEBUG ===");
//     console.log("Session projectData:", req.session.projectData);
//     console.log("Request body:", req.body);
//     console.log("Customer ID:", customerId);

//     if (!req.session.projectData) {
//       req.flash("error", "Project data not found. Please start over.");
//       return res.redirect("/customer/add-project");
//     }

//     // Validate required fields
//     const requiredFields = [
//       "startingBid",
//       "bidEndDate",
//       "startDate",
//       "endDate",
//     ];
//     const missingFields = requiredFields.filter((field) => !req.body[field]);

//     if (missingFields.length > 0) {
//       req.flash(
//         "error",
//         `Missing required fields: ${missingFields.join(", ")}`
//       );
//       return res.redirect(`/customer/project-form/${category}?step=3`);
//     }

//     // Parse datetime-local values
//     let bidEndDate = new Date(req.body.bidEndDate);
//     let startDate = new Date(req.body.startDate);
//     let endDate = new Date(req.body.endDate);

//     const now = new Date();

//     console.log("Date validation:", {
//       bidEndDate,
//       startDate,
//       endDate,
//       now,
//       bidEndDateValid: bidEndDate > now,
//       startDateValid: startDate > now,
//       endDateValid: endDate > startDate,
//     });

//     // Date validation
//     if (bidEndDate <= now) {
//       req.flash("error", "Bid end date must be in the future.");
//       return res.redirect(`/customer/project-form/${category}?step=3`);
//     }

//     if (startDate <= now) {
//       req.flash("error", "Project start date must be in the future.");

//       console.log("category",category)
//       return res.redirect(`/customer/project-form/${category}?step=3`);
//     }

//     if (endDate <= startDate) {
//       req.flash("error", "Project end date must be after start date.");
//       return res.redirect(`/customer/project-form/${category}?step=3`);
//     }

//     // Calculate duration in days
//     const durationMs = endDate - startDate;
//     const durationDays = Math.ceil(durationMs / (1000 * 60 * 60 * 24));

//     // Convert specifications to Map
//     const specificationsMap = new Map();
//     if (req.session.projectData.specifications) {
//       Object.entries(req.session.projectData.specifications).forEach(
//         ([key, value]) => {
//           if (value && value.trim() !== "") {
//             specificationsMap.set(key, value.trim());
//           }
//         }
//       );
//     }

//     // Prepare project data with proper structure for new workflow
//     const projectData = {
//       title: req.session.projectData.title?.trim(),
//       description: req.session.projectData.description?.trim(),
//       category: category,
//       customer: customerId,
//       status: 'pending', // Set to pending for admin verification
//       adminStatus: 'pending', // Explicitly set adminStatus
//       timeline: {
//         startDate: startDate,
//         endDate: endDate,
//         duration: durationDays,
//       },
//       bidSettings: {
//         startingBid: parseFloat(req.body.startingBid),
//         bidEndDate: bidEndDate,
//         isActive: false, // Will be activated after admin approval
//         autoSelectWinner: req.body.autoSelectWinner === "true",
//       },
//       location: {
//         address: req.session.projectData.address?.trim(),
//         city: req.session.projectData.city?.trim(),
//         state: req.session.projectData.state?.trim(),
//         zipCode: req.session.projectData.zipCode?.trim(),
//       },
//       contact: {
//         phone: req.session.projectData.phone?.trim(),
//         email: req.session.user?.email || "",
//       },
//       requirements: req.session.projectData.requirements?.trim(),
//       specifications: specificationsMap,
//       images: req.session.projectData.images || [],
//       documents: req.session.projectData.documents || [],
//       isPublic: false, // Will be made public after admin approval
//       biddingRounds: {
//         round1: {
//           startDate: null, // Will be set after admin approval
//           endDate: bidEndDate,
//           status: 'pending',
//           selectedBids: []
//         },
//         round2: {
//           startDate: null,
//           endDate: null,
//           status: 'pending',
//           selectedBids: []
//         },
//         currentRound: 1
//       }
//     };

//     console.log("Final project data to save:", projectData);

//     // Validate project data before saving
//     if (!projectData.title || !projectData.description) {
//       req.flash("error", "Project title and description are required.");
//       return res.redirect(`/customer/project-form/${category}?step=3`);
//     }

//     // Create the project
//     const project = new Project(projectData);
//     await project.save();

//     console.log("Project created successfully:", project._id);

//     // Notify admin
//     const Notice = require("../models/Notice");
//     await Notice.create({
//       title: `New Project Submitted - ${project.title}`,
//       content: `A new project "${project.title}" has been submitted for verification.`,
//       targetAudience: "admin",
//       noticeType: "info",
//       isActive: true,
//       startDate: new Date(),
//       endDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
//     });

//     // Clear session data
//     delete req.session.projectData;

//     req.flash(
//       "success",
//       'Project submitted successfully for admin verification! You will be notified once approved.'
//     );
//     res.redirect("/customer/my-projects");
//   } catch (error) {
//     console.error("Project creation error:", error);

//     // More detailed error logging
//     if (error.name === "ValidationError") {
//       const errors = Object.values(error.errors).map((err) => err.message);
//       console.log("Validation errors:", errors);
//       req.flash("error", `Validation error: ${errors.join(", ")}`);
//     } else if (error.code === 11000) {
//       req.flash("error", "A project with similar details already exists.");
//     } else {
//       req.flash("error", "Error creating project: " + error.message);
//     }

//     res.redirect(`/customer/project-form/${category}?step=3`);
//   }
// };

exports.postProjectStep3 = async (req, res) => {
  // ✅ Make category accessible everywhere (even inside catch)
  const category =
    req.params.category ||
    req.body.category ||
    req.query.category ||
    req.session.projectData?.category ||
    "general"; // fallback if missing

  try {
    const customerId = req.session.userId;

    console.log("=== PROJECT STEP 3 DEBUG ===");
    console.log("Session projectData:", req.session.projectData);
    console.log("Request body:", req.body);
    console.log("Customer ID:", customerId);
    console.log("Category:", category);

    if (!req.session.projectData) {
      req.flash("error", "Project data not found. Please start over.");
      return res.redirect("/customer/add-project");
    }

    // Validate required fields
    const requiredFields = ["startingBid", "bidEndDate", "startDate", "endDate"];
    const missingFields = requiredFields.filter((field) => !req.body[field]);

    if (missingFields.length > 0) {
      req.flash("error", `Missing required fields: ${missingFields.join(", ")}`);
      return res.redirect(`/customer/project-form/${category}?step=3`);
    }

    const bidEndDate = new Date(req.body.bidEndDate);
    const startDate = new Date(req.body.startDate);
    const endDate = new Date(req.body.endDate);
    const now = new Date();

    if (bidEndDate <= now) {
      req.flash("error", "Bid end date must be in the future.");
      return res.redirect(`/customer/project-form/${category}?step=3`);
    }

    if (startDate <= now) {
      req.flash("error", "Project start date must be in the future.");
      return res.redirect(`/customer/project-form/${category}?step=3`);
    }

    if (endDate <= startDate) {
      req.flash("error", "Project end date must be after start date.");
      return res.redirect(`/customer/project-form/${category}?step=3`);
    }

    const durationDays = Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24));

    const specificationsMap = new Map();
    if (req.session.projectData.specifications) {
      Object.entries(req.session.projectData.specifications).forEach(([key, value]) => {
        if (value && value.trim() !== "") specificationsMap.set(key, value.trim());
      });
    }

    // ✅ Use 'submitted' (valid enum value)
    const projectData = {
      title: req.session.projectData.title?.trim(),
      description: req.session.projectData.description?.trim(),
      category,
      customer: customerId,
      status: "submitted", // ✅ FIXED here
      adminStatus: "pending", // ✅ still okay
      timeline: { startDate, endDate, duration: durationDays },
      bidSettings: {
        startingBid: parseFloat(req.body.startingBid),
        bidEndDate,
        isActive: false,
        autoSelectWinner: req.body.autoSelectWinner === "true",
      },
      location: {
        address: req.session.projectData.address?.trim(),
        city: req.session.projectData.city?.trim(),
        state: req.session.projectData.state?.trim(),
        zipCode: req.session.projectData.zipCode?.trim(),
      },
      contact: {
        phone: req.session.projectData.phone?.trim(),
        email: req.session.user?.email || "",
      },
      requirements: req.session.projectData.requirements?.trim(),
      specifications: specificationsMap,
      images: req.session.projectData.images || [],
      documents: req.session.projectData.documents || [],
      isPublic: false,
      biddingRounds: {
        round1: { startDate: null, endDate: bidEndDate, status: "pending", selectedBids: [] },
        round2: { startDate: null, endDate: null, status: "pending", selectedBids: [] },
        currentRound: 1,
      },
    };

    if (!projectData.title || !projectData.description) {
      req.flash("error", "Project title and description are required.");
      return res.redirect(`/customer/project-form/${category}?step=3`);
    }

    const project = new Project(projectData);
    await project.save();

    console.log("✅ Project created successfully:", project._id);

    const Notice = require("../models/Notice");
    await Notice.create({
      title: `New Project Submitted - ${project.title}`,
      content: `A new project "${project.title}" has been submitted for verification.`,
      targetAudience: "admin",
      noticeType: "info",
      isActive: true,
      startDate: new Date(),
      endDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    });

    delete req.session.projectData;
    req.flash("success", "Project submitted successfully for admin verification!");
    res.redirect("/customer/my-projects");
  } catch (error) {
    console.error("❌ Project creation error:", error);

    if (error.name === "ValidationError") {
      const errors = Object.values(error.errors).map((err) => err.message);
      req.flash("error", `Validation error: ${errors.join(", ")}`);
    } else if (error.code === 11000) {
      req.flash("error", "A project with similar details already exists.");
    } else {
      req.flash("error", "Error creating project: " + error.message);
    }

    // ✅ No crash here because category always defined
    res.redirect(`/customer/project-form/${category}?step=3`);
  }
};


// NEW: Edit and resubmit rejected project
exports.editAndResubmitProject = async (req, res) => {
  try {
    const { projectId } = req.params;
    const customerId = req.session.userId;

    const project = await Project.findById(projectId);
    
    if (!project || project.customer.toString() !== customerId) {
      req.flash("error", "Project not found or unauthorized");
      return res.redirect("/customer/my-projects");
    }

    if (project.adminStatus !== 'rejected') {
      req.flash("error", "Only rejected projects can be edited and resubmitted");
      return res.redirect("/customer/my-projects");
    }

    // Use the new method from Project model to resubmit
    await project.resubmitForVerification();

    // Notify admin
    const Notice = require("../models/Notice");
    await Notice.create({
      title: `Project Resubmitted - ${project.title}`,
      content: `Project "${project.title}" has been edited and resubmitted for verification.`,
      targetAudience: "admin",
      noticeType: "info",
      isActive: true,
      startDate: new Date(),
      endDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    });

    req.flash("success", "Project edited and resubmitted for verification successfully!");
    res.redirect("/customer/my-projects");
  } catch (error) {
    console.error("Edit and resubmit project error:", error);
    req.flash("error", "Error resubmitting project for verification");
    res.redirect("/customer/my-projects");
  }
};

// // UPDATED: Get my projects with new statuses
// exports.getMyProjects = async (req, res) => {
//   try {
//     const customerId = req.session.userId;
    
//     if (!customerId) {
//       req.flash("error", "Please log in to view your projects");
//       return res.redirect("/auth/login");
//     }

//     const projects = await Project.find({ customer: customerId })
//       .sort({ createdAt: -1 })
//       .populate("bids")
//       .populate({
//         path: "selectedBid",
//         populate: {
//           path: "seller",
//           select: "name companyName email phone rating profileImage",
//         },
//       })
//       .select("title description adminStatus adminRemarks category status location timeline bidSettings featuredImage images bids selectedBid createdAt biddingRounds");

//     // Get contracts for projects
//     const projectsWithContracts = [];
//     for (const project of projects) {
//       const contract = await Contract.findOne({
//         project: project._id,
//       }).populate("seller", "name companyName");

//       projectsWithContracts.push({
//         ...project.toObject(),
//         contract: contract,
//       });
//     }

//     const userData = req.session.user || { name: "Customer", email: "" };

//     const customerProjects = await Project.find({
//       customer: customerId,
//     }).select("_id");
//     const projectIds = customerProjects.map((p) => p._id);
//     const bidCount = await Bid.countDocuments({
//       project: { $in: projectIds },
//       status: "submitted",
//     });

//     res.render("customer/my-projects", {
//       user: userData,
//       currentPage: "projects",
//       projects: projectsWithContracts || [],
//       bidCount: bidCount,
//       messageCount: 0,
//       moment: require("moment"),
//     });
//   } catch (error) {
//     console.error("Get my projects error:", error);
//     req.flash("error", "Error loading projects: " + error.message);
//     res.redirect("/customer/dashboard");
//   }
// };


exports.getMyProjects = async (req, res) => {
    try {
        const customerId = req.session.userId;
        console.log('🔍 Loading projects for customer:', customerId);

        // ✅ Fetch all non-deleted projects for this customer
        const projects = await Project.find({ 
            customer: customerId,
            status: { $ne: 'deleted' }  // optional safeguard
        })
            .populate('selectedBid')
            .populate('bids')
            .sort({ createdAt: -1 });

        console.log(`📋 Found ${projects.length} projects for customer`);

        const projectsWithContracts = await Promise.all(
            projects.map(async (project) => {
                let contract = null;
                let projectStatus = project.status;

                if (project.selectedBid) {
                    contract = await Contract.findOne({ bid: project.selectedBid._id })
                        .populate('customer', 'name email')
                        .populate('seller', 'name companyName email')
                        .populate('bid', 'amount proposal');

                    if (contract && contract.status === 'completed') {
                        projectStatus = 'completed';
                    }
                }

                return {
                    ...project.toObject(),
                    contract,
                    displayStatus: projectStatus,
                    isCompleted: projectStatus === 'completed',
                    hasContract: !!contract
                };
            })
        );

        const stats = {
            total: projects.length,
            active: projectsWithContracts.filter(p => p.displayStatus === 'active' || p.displayStatus === 'in-progress').length,
            pending: projectsWithContracts.filter(p => p.displayStatus === 'pending').length,
            completed: projectsWithContracts.filter(p => p.displayStatus === 'completed').length
        };

        const userData = req.session.user || { name: "Customer", email: "" };

        res.render('customer/my-projects', {
            user: userData,
            currentPage: 'my-projects',
            projects: projectsWithContracts,
            stats,
            moment: require('moment')
        });

    } catch (error) {
        console.error('❌ Get my projects error:', error);
        req.flash('error', 'Error loading projects: ' + error.message);
        res.redirect('/customer/dashboard');
    }
};



// NEW: Get round 1 selection page
// NEW: Get round 1 selection page
exports.getRound1Selection = async (req, res) => {
  try {
    const { projectId } = req.params;
    const customerId = req.session.userId;

    const project = await Project.findById(projectId);
    if (!project || project.customer.toString() !== customerId) {
      req.flash("error", "Project not found or unauthorized");
      return res.redirect("/customer/my-projects");
    }

    // Check if round 1 is completed and we're in selection phase
    if (project.biddingRounds.currentRound !== 1.5) {
      req.flash("error", "Round 1 bidding not completed yet");
      return res.redirect(`/customer/project/${projectId}`);
    }

    // FIXED: Get bids that were selected in round 1 (top 10)
    const topBids = await Bid.find({ 
      project: projectId,
      round: 1,
      selectionStatus: 'selected-round1' // CHANGED: from 'submitted' to 'selected-round1'
    })
    .populate("seller", "name companyName email phone rating profileImage yearsOfExperience specialization companyDocuments")
    .sort({ amount: -1 });

    console.log(`🔍 Found ${topBids.length} selected bids for project ${projectId}`);

    // Debug: Check what bids are available
    const allBids = await Bid.find({ project: projectId });
    console.log(`🔍 All bids for project ${projectId}:`, allBids.map(bid => ({
      id: bid._id,
      seller: bid.seller,
      amount: bid.amount,
      round: bid.round,
      selectionStatus: bid.selectionStatus,
      status: bid.status
    })));

    const userData = req.session.user || { name: "Customer", email: "" };

    res.render("customer/round1-selection", {
      user: userData,
      currentPage: "projects",
      project: project,
      bids: topBids,
      moment: require("moment")
    });
  } catch (error) {
    console.error("Get round 1 selection error:", error);
    req.flash("error", "Error loading round 1 selection");
    res.redirect("/customer/my-projects");
  }
};

// NEW: Select top 3 for round 2
exports.selectTop3 = async (req, res) => {
  try {
    const { projectId } = req.params;
    const { selectedBids } = req.body;
    const customerId = req.session.userId;

    console.log(`🎯 Selecting top 3 for project ${projectId}:`, selectedBids);

    const project = await Project.findById(projectId);
    if (!project || project.customer.toString() !== customerId) {
      req.flash("error", "Project not found or unauthorized");
      return res.redirect("/customer/my-projects");
    }

    if (!selectedBids || !Array.isArray(selectedBids) || selectedBids.length > 3) {
      req.flash("error", "Please select exactly 3 bids");
      return res.redirect(`/customer/project/${projectId}/round1-selection`);
    }

    // Validate that the selected bids are actually from the top 10
    const validBids = await Bid.find({
      _id: { $in: selectedBids },
      project: projectId,
      selectionStatus: 'selected-round1'
    });

    if (validBids.length > 3) {
      req.flash("error", "Invalid bid selection. Please select from the available top 10 bids.");
      return res.redirect(`/customer/project/${projectId}/round1-selection`);
    }

    // FIXED: Use the project method to select top 3
    await project.selectTop3(selectedBids);

    // FIXED: Update bids status using the Bid model methods
    for (const bidId of selectedBids) {
      const bid = await Bid.findById(bidId);
      if (bid) {
        await bid.markAsSelectedRound2();
      }
    }

    // Notify selected sellers
    const Notice = require("../models/Notice");
    for (const bidId of selectedBids) {
      const bid = await Bid.findById(bidId).populate('seller');
      if (bid && bid.seller) {
        await Notice.create({
          title: `Selected for Round 2 - ${project.title}`,
          content: `Congratulations! Your bid has been selected for Round 2. You can update your bid within the next 24 hours.`,
          targetAudience: "seller",
          specificUser: bid.seller._id,
          noticeType: "success",
          isActive: true,
          startDate: new Date(),
          endDate: new Date(Date.now() + 24 * 60 * 60 * 1000),
        });
        console.log(`📢 Notification sent to seller: ${bid.seller.name || bid.seller.companyName}`);
      }
    }

    req.flash("success", "Top 3 bids selected successfully! Round 2 has started for 24 hours.");
    res.redirect(`/customer/project/${projectId}`);
  } catch (error) {
    console.error("Select top 3 error:", error);
    req.flash("error", "Error selecting top 3 bids: " + error.message);
    res.redirect("/customer/my-projects");
  }
};
// NEW: Select winning bid
exports.selectWinner = async (req, res) => {
  try {
    const { projectId } = req.params;
    const { winningBidId } = req.body;
    const customerId = req.session.userId;

    const project = await Project.findById(projectId);
    if (!project || project.customer.toString() !== customerId) {
      req.flash("error", "Project not found or unauthorized");
      return res.redirect("/customer/my-projects");
    }

    // Validate winning bid
    const winningBid = await Bid.findOne({
      _id: winningBidId,
      project: projectId,
      round: 2,
      selectionStatus: 'selected-round2'
    });

    if (!winningBid) {
      req.flash("error", "Invalid winning bid selection");
      return res.redirect(`/customer/project/${projectId}/round2-selection`);
    }

    // Use the new method from Project model
    await project.completeRound2(winningBidId);

    // Update winning bid
    await winningBid.markAsWon();

    // Mark other bids as lost
    await Bid.updateMany(
      {
        project: projectId,
        round: 2,
        _id: { $ne: winningBidId },
        selectionStatus: 'selected-round2'
      },
      { selectionStatus: 'lost' }
    );

    // Initialize contract using statusAutomation
    const statusAutomation = require('../services/statusAutomation');
    await statusAutomation.initializeContractForWinner(project, winningBid, {});

    req.flash("success", `Winning bid selected successfully! Contract process has started with ${winningBid.seller.companyName || winningBid.seller.name}`);
    res.redirect(`/customer/project/${projectId}`);
  } catch (error) {
    console.error("Select winner error:", error);
    req.flash("error", "Error selecting winning bid");
    res.redirect("/customer/my-projects");
  }
};





// Download Customer Certificate
// exports.downloadCustomerCertificate = async (req, res) => {
//     try {
//         const { bidId } = req.params;
//         const customerId = req.session.userId;

//         const bid = await Bid.findById(bidId).populate('project');
//         if (!bid || bid.project.customer.toString() !== customerId) {
//             req.flash('error', 'Unauthorized access');
//             return res.redirect('/customer/my-projects');
//         }

//         const contract = await Contract.findOne({ bid: bidId });
//         if (!contract?.customerCertificate?.url) {
//             req.flash('error', 'Customer certificate not available');
//             return res.redirect('/customer/my-projects');
//         }

//         res.redirect(contract.customerCertificate.url);
//     } catch (err) {
//         console.error(err);
//         req.flash('error', 'Error downloading customer certificate');
//         res.redirect('/customer/my-projects');
//     }
// };


// const axios = require('axios');

// exports.downloadCustomerCertificate = async (req, res) => {
//   try {
//     const { bidId } = req.params;
//     const customerId = req.session.userId;

//     const bid = await Bid.findById(bidId).populate('project');
//     if (!bid || bid.project.customer.toString() !== customerId) {
//       req.flash('error', 'Unauthorized access');
//       return res.redirect('/seller/my-bids');
//     }

//     const contract = await Contract.findOne({ bid: bidId });
//     if (!contract?.customerCertificate?.url) {
//       req.flash('error', 'Certificate not available');
//       return res.redirect('/seller/my-bids');
//     }

//     // Convert to raw URL if uploaded via image/upload
//     const fileUrl = contract.customerCertificate.url.replace('/image/upload/', '/raw/upload/');
//     console.log("Streaming from:", fileUrl);

//     const response = await axios.get(fileUrl, { responseType: 'stream' });
//     res.setHeader('Content-Disposition', `attachment; filename="${contract.customerCertificate.filename}"`);
//     res.setHeader('Content-Type', 'application/pdf');
//     response.data.pipe(res);

//   } catch (err) {
//     console.error('Download error:', err);
//     req.flash('error', 'Failed to download certificate');
//     res.redirect('/seller/my-bids');
//   }
// };

exports.downloadCustomerCertificate = async (req, res) => {
  try {
    const { bidId } = req.params;
    const customerId = req.session.userId;
    console.log("📌 Starting downloadCustomerCertificate");
    console.log("Bid ID:", bidId);
    console.log("Customer ID (session):", customerId);

    const bid = await Bid.findById(bidId).populate('project');
    console.log("Bid fetched:", bid ? "✅ Found" : "❌ Not found");

    if (!bid || !bid.project) {
      console.error("❌ Bid or project not found");
      req.flash('error', 'Bid or project not found');
      return res.redirect('/seller/my-bids');
    }

    if (bid.project.customer.toString() !== customerId) {
      console.error("❌ Unauthorized access: Project customer mismatch");
      req.flash('error', 'Unauthorized access');
      return res.redirect('/seller/my-bids');
    }

    const contract = await Contract.findOne({ bid: bidId });
    console.log("Contract fetched:", contract ? "✅ Found" : "❌ Not found");

    if (!contract?.customerCertificate?.url) {
      console.error("❌ Customer certificate not available");
      req.flash('error', 'Certificate not available');
      return res.redirect('/seller/my-bids');
    }

    // Convert to raw URL if uploaded via image/upload
    // const fileUrl = contract.customerCertificate.url.replace('/image/upload/', '/raw/upload/');
    // console.log("Streaming file from URL:", fileUrl);
    // console.log("Expected filename:", contract.customerCertificate.filename);
 const fileUrl = contract.customerSignedContract.url.replace('/image/upload/', '/raw/upload/');
    console.log("Streaming from raw URL:", fileUrl);
    const axios = require('axios');
    const response = await axios.get(fileUrl, { responseType: 'stream' });
    console.log("✅ Cloudinary stream response received");

    res.setHeader('Content-Disposition', `attachment; filename="${contract.customerCertificate.filename}"`);
    res.setHeader('Content-Type', 'application/pdf');

    response.data.on('error', (streamErr) => {
      console.error("❌ Error while streaming PDF:", streamErr);
      req.flash('error', 'Error streaming certificate');
      return res.redirect('/seller/my-bids');
    });

    response.data.pipe(res);
    console.log("📌 Streaming started successfully");

  } catch (err) {
    console.error('❌ Download error caught in catch block:', err);
    req.flash('error', 'Failed to download certificate');
    res.redirect('/seller/my-bids');
  }
};



// Download Seller Certificate
exports.downloadSellerCertificate = async (req, res) => {
    try {
        const { bidId } = req.params;
        const customerId = req.session.userId;

        const bid = await Bid.findById(bidId).populate('project');
        if (!bid || bid.project.customer.toString() !== customerId) {
            req.flash('error', 'Unauthorized access');
            return res.redirect('/customer/my-projects');
        }

        const contract = await Contract.findOne({ bid: bidId });
        if (!contract?.sellerCertificate?.url) {
            req.flash('error', 'Seller certificate not available');
            return res.redirect('/customer/my-projects');
        }

        res.redirect(contract.sellerCertificate.url);
    } catch (err) {
        console.error(err);
        req.flash('error', 'Error downloading seller certificate');
        res.redirect('/customer/my-projects');
    }
};

// Download Final Certificate
exports.downloadFinalCertificate = async (req, res) => {
    try {
        const { bidId } = req.params;
        const customerId = req.session.userId;

        const bid = await Bid.findById(bidId).populate('project');
        if (!bid || bid.project.customer.toString() !== customerId) {
            req.flash('error', 'Unauthorized access');
            return res.redirect('/customer/my-projects');
        }

        const contract = await Contract.findOne({ bid: bidId });
        if (!contract?.finalCertificate?.url) {
            req.flash('error', 'Final certificate not available');
            return res.redirect('/customer/my-projects');
        }

        res.redirect(contract.finalCertificate.url);
    } catch (err) {
        console.error(err);
        req.flash('error', 'Error downloading final certificate');
        res.redirect('/customer/my-projects');
    }
};







// Download Customer Contract
exports.downloadCustomerContract = async (req, res) => {

  console.log("Debugging downloading customer contract")
    try {
        const { bidId } = req.params;
        const customerId = req.session.userId;

  console.log("Debugging downloading customer contract 1")


        const bid = await Bid.findOne({ _id: bidId }).populate('project');
        if (!bid || bid.project.customer.toString() !== customerId) {
            req.flash('error', 'Unauthorized access');
            return res.redirect('/customer/my-projects');
        }

        const contract = await Contract.findOne({ bid: bidId });
        if (!contract || !contract.customerSignedContract?.url) {
            req.flash('error', 'Customer contract not available');
            return res.redirect('/customer/my-projects');
        }

        console.log("The url",contract.customerSignedContract.url)

        res.redirect(contract.customerSignedContract.url);
    } catch (error) {
        console.error('❌ Download customer contract error:', error);
        req.flash('error', 'Error downloading customer contract');
  console.log("Debugging downloading customer contract 2")

        res.redirect('/customer/my-projects');
    }
};

// Download Seller Contract
exports.downloadSellerContract = async (req, res) => {
    try {
        const { bidId } = req.params;
        const customerId = req.session.userId;

        const bid = await Bid.findOne({ _id: bidId }).populate('project');
        if (!bid || bid.project.customer.toString() !== customerId) {
            req.flash('error', 'Unauthorized access');
            return res.redirect('/customer/my-projects');
        }

        const contract = await Contract.findOne({ bid: bidId });
        if (!contract || !contract.sellerSignedContract?.url) {
            req.flash('error', 'Seller contract not available');
            return res.redirect('/customer/my-projects');
        }

        res.redirect(contract.sellerSignedContract.url);
    } catch (error) {
        console.error('❌ Download seller contract error:', error);
        req.flash('error', 'Error downloading seller contract');
        res.redirect('/customer/my-projects');
    }
};



// Download Final Certificate
// exports.downloadFinalCertificate = async (req, res) => {
//     try {
//         const { bidId } = req.params;
//         const customerId = req.session.userId;

//         const bid = await Bid.findOne({ _id: bidId }).populate('project');
//         if (!bid || bid.project.customer.toString() !== customerId) {
//             req.flash('error', 'Unauthorized access');
//             return res.redirect('/customer/my-projects');
//         }

//         const contract = await Contract.findOne({ bid: bidId });
//         if (!contract || !contract.finalCertificate?.url) {
//             req.flash('error', 'Final certificate not available');
//             return res.redirect('/customer/my-projects');
//         }

//         res.redirect(contract.finalCertificate.url);
//     } catch (error) {
//         console.error('❌ Download final certificate error:', error);
//         req.flash('error', 'Error downloading final certificate');
//         res.redirect('/customer/my-projects');
//     }
// };






module.exports = exports;














