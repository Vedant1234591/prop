require("dotenv").config();
const express = require("express");
const session = require("express-session");
const flash = require("express-flash");
const path = require("path");
const connectDB = require("./config/database");

const cron = require("./cron");
// In app.js - make sure you have this line
const { upload } = require("./middleware/upload");
// Connect to database
connectDB();

// Start cron jobs
cron;
const statusAutomation = require("./services/statusAutomation");

// Start status automation (add this line anywhere after imports)
statusAutomation.start();

// NEW: Import Project model for auto-processing
const Project = require("./models/Project");

const app = express();

// View engine setup
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

// Static files
app.use(express.static(path.join(__dirname, "public")));

// Body parsing middleware
app.use(express.json({ limit: "10mb" }));
// app.use(express.urlencoded({ extended: true, limit: '10mb' }));

app.use(express.urlencoded({ extended: true }));

// Session configuration
app.use(
  session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: process.env.NODE_ENV === "production",
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
    },
  })
);

// Flash messages
app.use(flash());

// Make user available to all templates
app.use((req, res, next) => {
  res.locals.user = req.user || null;
  res.locals.success = req.flash("success");
  res.locals.error = req.flash("error");
  res.locals.moment = require("moment");
  next();
});

// NEW: Global auto-processing middleware
app.use(async (req, res, next) => {
  try {
    // Run auto-processing on every request to ensure real-time status updates
    if (
      req.method === "GET" &&
      !req.path.includes("/api/") &&
      !req.path.includes("/auth/")
    ) {
      await Project.autoProcessProjects();
    }
  } catch (error) {
    console.error("Auto-processing error:", error.message);
    // Don't block the request if auto-processing fails
  }
  next();
});

// Routes
app.use("/auth", require("./routes/auth"));
app.use("/customer", require("./routes/customer"));
app.use("/seller", require("./routes/seller"));
app.use("/admin", require("./routes/admin"));

// API Routes for real-time updates
app.get("/api/latest-bids", async (req, res) => {
  try {
    const Bid = require("./models/Bid");
    let latestBids;

    if (req.user?.role === "customer") {
      latestBids = await Bid.find()
        .populate("project", "title")
        .populate("seller", "name companyName")
        .sort({ createdAt: -1 })
        .limit(10);
    } else if (req.user?.role === "seller") {
      latestBids = await Bid.find({ seller: req.user._id })
        .populate("project", "title category")
        .sort({ createdAt: -1 })
        .limit(10);
    } else {
      latestBids = [];
    }

    res.json(latestBids);
  } catch (error) {
    res.status(500).json({ error: "Error fetching bids" });
  }
});

app.get("/api/latest-notices", async (req, res) => {
  try {
    const Notice = require("./models/Notice");
    const target = req.user?.role || "all";

    const latestNotices = await Notice.find({
      $or: [{ targetAudience: "all" }, { targetAudience: target }],
      isActive: true,
    })
      .sort({ createdAt: -1 })
      .limit(10);

    res.json(latestNotices);
  } catch (error) {
    res.status(500).json({ error: "Error fetching notices" });
  }
});

// NEW: API routes for automatic bidding system
app.get("/api/project-status/:projectId", async (req, res) => {
  try {
    const Project = require("./models/Project");
    const project = await Project.findById(req.params.projectId)
      .populate("bids")
      .populate("selectedBid");

    if (!project) {
      return res.status(404).json({ error: "Project not found" });
    }

    res.json({
      projectId: project._id,
      status: project.status,
      bidSettings: project.bidSettings,
      isAcceptingBids: project.isAcceptingBids,
      totalBids: project.bids.length,
      selectedBid: project.selectedBid,
      timeUntilBidEnd: project.bidSettings.bidEndDate - new Date(),
    });
  } catch (error) {
    res.status(500).json({ error: "Error fetching project status" });
  }
});

app.get("/api/bid-status/:bidId", async (req, res) => {
  try {
    const Bid = require("./models/Bid");
    const bid = await Bid.findById(req.params.bidId).populate(
      "project",
      "title bidSettings"
    );

    if (!bid) {
      return res.status(404).json({ error: "Bid not found" });
    }

    res.json({
      bidId: bid._id,
      status: bid.status,
      amount: bid.amount,
      project: bid.project,
      canEdit:
        bid.canEdit &&
        bid.project?.bidSettings?.isActive &&
        new Date() < bid.project.bidSettings.bidEndDate,
      isWinning: bid.isSelected,
    });
  } catch (error) {
    res.status(500).json({ error: "Error fetching bid status" });
  }
});

// NEW: System status endpoint
app.get("/api/system-status", async (req, res) => {
  try {
    const Project = require("./models/Project");
    const Bid = require("./models/Bid");
    const Contract = require("./models/Contract");

    const activeProjects = await Project.countDocuments({
      "bidSettings.isActive": true,
    });
    const pendingBids = await Bid.countDocuments({
      status: "submitted",
    });
    const pendingContracts = await Contract.countDocuments({
      status: { $in: ["pending-customer", "pending-seller", "pending-admin"] },
    });

    res.json({
      activeProjects,
      pendingBids,
      pendingContracts,
      serverTime: new Date(),
      system: "running",
    });
  } catch (error) {
    res.status(500).json({ error: "Error fetching system status" });
  }
});

// Home route
app.get("/", (req, res) => {
  res.redirect("/auth");
});

// NEW: Auto-process trigger route (for manual testing)
app.get("/auto-process", async (req, res) => {
  try {
    await Project.autoProcessProjects();
    res.json({
      success: true,
      message: "Projects auto-processed successfully",
      timestamp: new Date(),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// 404 handler
app.use("*", (req, res) => {
  res.status(404).render("error", {
    message: "Page not found",
  });
});

// Error handler
app.use((err, req, res, next) => {
  console.error("Error:", err);
  res.status(500).render("error", {
    message: "Something went wrong! Please try again.",
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log("🚀 Automatic bidding system initialized");
  console.log("⏰ Auto-processing enabled on every request");
});
