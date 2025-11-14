require("dotenv").config();
const express = require("express");
const session = require("express-session");

const path = require("path");
const Contact = require("./models/Contact");
const Feedback = require("./models/Feedback");
const connectDB = require("./config/database");



const blogController = require('./controllers/blogController');const flash = require("express-flash");
const app = express();

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



// View engine setup
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

// Static files
app.use(express.static(path.join(__dirname, "public")));

// Body parsing middleware
app.use(express.json({ limit: "10mb" }));
// app.use(express.urlencoded({ extended: true, limit: '10mb' }));

app.use(express.urlencoded({ extended: true }));
// Handle contact form submission
// Handle contact form submission


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

// ===== FEEDBACK ROUTES =====

// Show feedback form page
app.get("/feedback", (req, res) => {
  res.render("feedback", {
    currentRoute: "/feedback"
  });
});
app.get("/all-feedbacks", async (req, res) => {
  try {
    // Get all approved feedbacks
    const feedbacks = await Feedback.find({ status: "approved" })
      .sort({ createdAt: -1 })
      .lean();

    // Format dates for display
    const formattedFeedbacks = feedbacks.map(feedback => ({
      ...feedback,
      formattedDate: new Date(feedback.createdAt).toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric"
      })
    }));
    
    res.render("all-feedbacks", {
      feedbacks: formattedFeedbacks,
      currentRoute: "/all-feedbacks"
    });
  } catch (error) {
    console.error("Error rendering all feedbacks page:", error);
    res.status(500).render("error", { 
      message: "Error loading feedbacks page" 
    });
  }
});

// Handle feedback form submission
app.post("/feedback", async (req, res) => {
  try {
    const { name, email, phone, subject, message, rating, category, userType } = req.body;

    // Validate required fields
    if (!name || !email || !subject || !message || !rating) {
      req.flash("error", "Please fill all required fields");
      return res.redirect("/feedback");
    }

    // Validate rating
    const ratingNum = parseInt(rating);
    if (ratingNum < 1 || ratingNum > 5) {
      req.flash("error", "Please provide a valid rating between 1 and 5");
      return res.redirect("/feedback");
    }

    // Create new feedback submission (auto-approved)
    const feedback = new Feedback({
      name: name.trim(),
      email: email.trim(),
      phone: phone ? phone.trim() : "",
      subject: subject.trim(),
      message: message.trim(),
      rating: ratingNum,
      category: category || "general",
      userType: userType || "visitor",
      status: "approved" // Auto-approve for public display
    });

    await feedback.save();

    req.flash("success", "Thank you for your feedback! We appreciate your input.");
    res.redirect("/");

  } catch (error) {
    console.error("Error submitting feedback:", error);
    req.flash("error", "There was an error submitting your feedback. Please try again.");
    res.redirect("/feedback");
  }
});

// Show all feedbacks page
// Show all feedbacks page

app.post("/contact-us", async  (req, res) => {
  try {
    const { name, email, phone, subject, message } = req.body;

    // Validate required fields
    if (!name || !email || !subject || !message) {
      req.flash('error', 'Please fill all required fields');
      return res.redirect('/auth/contact-us');
    }

    // Create new contact submission
    const contact = new Contact({
      name: name.trim(),
      email: email.trim(),
      phone: phone ? phone.trim() : '',
      subject: subject.trim(),
      message: message.trim()
    });

    await contact.save();

    req.flash('success', 'Thank you for your message! We will get back to you soon.');
    res.redirect('/');

  } catch (error) {
    console.error('Error submitting contact form:', error);
    req.flash('error', 'There was an error submitting your message. Please try again.');
    res.redirect('/auth/contact-us');
  }
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
app.get("/", async  (req, res) => {
  if (req.session.userId) {
    const role = req.session.userRole;
    console.log("new debug", role.adminVerified);
    if (role === "customer") {
      return res.redirect("/customer/dashboard");
    } else if (role === "seller") {
      return res.redirect("/seller/dashboard");
    } else if (role === "admin") {
      return res.redirect("/admin/dashboard");
    }
  }
      const blogs = await blogController.getHomepageBlogs(req, res);
  // NEW: Get latest 3 feedbacks
  let feedbacks = [];
  try {
    feedbacks = await Feedback.find({ status: "approved" })
      .sort({ createdAt: -1 })
      .limit(3)
      .lean();

    // Format dates for display
    feedbacks = feedbacks.map(feedback => ({
      ...feedback,
      formattedDate: new Date(feedback.createdAt).toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric"
      })
    }));
  } catch (error) {
    console.error("Error fetching homepage feedbacks:", error);
    feedbacks = [];
  }

  // Define variables for EJS template
  const carouselItems = [
    {
      img: "/images/landing/carousel-1.webp",
      title: "Let's Build Your Dream Home",
      desc: "Work with expert builders to bring your vision to life.",
      contactLink: "/contact",
      registerLink: "/create_project/Construction",
    },
    {
      img: "/images/landing/carousel-2.webp",
      title: "Let's Power Up Your Project",
      desc: "Get reliable electrification solutions from top professionals.",
      contactLink: "/contact",
      registerLink: "/create_project/Electrification",
    },
    {
      img: "/images/landing/carousel-3.webp",
      title: "Let's Design Your Perfect Space",
      desc: "Collaborate with leading architects to create stunning designs.",
      contactLink: "/contact",
      registerLink: "/create_project/Architecture",
    },
    {
      img: "/images/landing/carousel-4.webp",
      title: "Let's Transform Your Interiors",
      desc: "Personalize your home with creative interior design solutions.",
      contactLink: "/contact",
      registerLink: "/create_project/Interior",
    },
  ];

  const services = [
    {
      img: "/images/landing/service-1.webp",
      title: "General Construction",
      desc: "Build the perfect structure with expert contractors.",
      link: "/create_project/Construction",
    },
    {
      img: "/images/landing/service-2.webp",
      title: "Electrification",
      desc: "Power your project with certified electrical professionals.",
      link: "/create_project/Electrification",
    },
    {
      img: "/images/landing/service-3.webp",
      title: "Architecture Design",
      desc: "Custom architectural solutions to bring your vision to life.",
      link: "/create_project/Architecture",
    },
    {
      img: "/images/landing/service-4.webp",
      title: "Interior Design",
      desc: "Creative interior solutions for your home.",
      link: "/create_project/Interior",
    },
  ];

  

  const testimonials = [
    {
      review: "Amazing platform!",
      name: "John Doe",
      profession: "Builder",
      img: "/images/landing/1.png",
      rating: 5,
    },
    {
      review: "Saved my time and money.",
      name: "Jane Smith",
      profession: "Architect",
      img: "/images/landing/5.png",
      rating: 4,
    },
  ];

  res.render("index", { carouselItems, services, blogs,feedbacks, testimonials });
});
app.get('/blogs', async (req, res) => {
  try {
    const blogs = await blogController.getAllBlogs(req, res);
    res.render('blogs', {
      blogs,
      currentRoute: '/blogs'
    });
  } catch (error) {
    console.error('Error rendering blogs page:', error);
    res.status(500).render('error', { message: 'Server Error' });
  }
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
