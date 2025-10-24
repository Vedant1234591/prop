const User = require("../models/User");
const Seller = require("../models/Seller");
const bcrypt = require("bcrypt");
const qs = require("qs");
// import { sendEmail } from "../services/emailService.js";
const {sendEmail} = require("../services/emailService.js")

exports.getLogin = (req, res) => {
  // const seller = req.session.userRole;
  // console.log(Seller);
  // console.log(seller);

  // req.session.userRole && console.log("debug::", req.session.userRole);
  // console.log("debug::", Seller.adminVerified);
  // If already logged in, redirect to dashboard
  if (req.session.userId) {
    if (req.session.userRole === "customer") {
      return res.redirect("/customer/dashboard");
    } else if (req.session.userRole === "seller") {
      return res.redirect("/seller/dashboard");
    } else {
      res.render("auth/login");
    }
  }
  res.render("auth/login");
};


//uttkarsh 23 oct 


// Temporary OTP store (in-memory)
const otpStore = new Map();
exports.getLogin_otp = (req,res) => {
  res.render("auth/login-otp")
}

// controllers/authController.js

exports.getVerify_otp = (req, res) => {
  const email = req.query.email; // Get email from query param
  if (!email) {
    req.flash("error", "Please enter your email first.");
    return res.redirect("/auth/login-otp");
  }
  res.render("auth/verify-otp", { email });
};

exports.postSend_otp = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      req.flash("error", "Please enter your email.");
      return res.redirect("/auth/login-otp");
    }

    // ✅ Check if user exists in DB
    const user = await User.findOne({ email }); // replace with your ORM / DB query
    if (!user) {
      req.flash("error", "Invalid Email");
      return res.redirect("/auth/login-otp");
    }

    // Generate 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    // Store OTP with 5-minute expiry
    otpStore.set(email, { otp, expires: Date.now() + 5 * 60 * 1000 });

    // Email HTML content
    const html = `
      <div style="font-family:Arial,sans-serif;padding:20px;">
        <h2>🔐 Propload Login OTP</h2>
        <p>Your one-time password (OTP) is:</p>
        <h1 style="letter-spacing:2px;">${otp}</h1>
        <p>This code will expire in <b>5 minutes</b>.</p>
        <p>If you didn't request this, please ignore this email.</p>
        <hr>
        <small>© ${new Date().getFullYear()} Propload</small>
      </div>
    `;

    // Send OTP email
    await sendEmail(email, "Your Propload Login OTP", html);

    req.flash("success", "OTP sent successfully! Check your email.");
    return res.redirect(`/auth/verify-otp?email=${encodeURIComponent(email)}`);
  } catch (error) {
    console.error("❌ Error in send-otp:", error);
    req.flash("error", "Something went wrong while sending OTP.");
    res.redirect("/auth/login-otp");
  }
};



exports.postVerify_otp = async (req, res) => {
  try {
    const { email, otp } = req.body;

    if (!email || !otp) {
      req.flash("error", "Please enter the OTP.");
      return res.redirect(`/auth/verify-otp?email=${encodeURIComponent(email || "")}`);
    }

    // Check if user exists
    const user = await User.findOne({ email });
    if (!user) {
      req.flash("error", "This email is not registered with us.");
      return res.redirect("/auth/login-otp");
    }

    // Get OTP record
    const record = otpStore.get(email);
    if (!record) {
      req.flash("error", "No OTP found for this email. Please request a new one.");
      return res.redirect("/auth/login-otp");
    }

    // Check expiry
    if (Date.now() > record.expires) {
      otpStore.delete(email);
      req.flash("error", "OTP has expired. Please request a new one.");
      return res.redirect("/auth/login-otp");
    }

    // Check OTP match
    if (record.otp !== otp) {
      req.flash("error", "Invalid OTP. Please try again.");
      return res.redirect(`/auth/verify-otp?email=${encodeURIComponent(email)}`);
    }

    // ✅ OTP verified, delete from store
    otpStore.delete(email);

    // ✅ Set session like in normal login
    req.session.userId = user._id;
    req.session.userRole = user.role;
    req.session.user = {
      _id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
    };

    // 🔄 Redirect based on role
    if (user.role === "customer") {
      return res.redirect("/customer/dashboard");
    } else if (user.role === "seller") {
      return res.redirect("/seller/dashboard");
    } else if (user.role === "admin") {
      return res.redirect("/admin/dashboard");
    } else {
      return res.redirect("/dashboard");
    }
  } catch (error) {
    console.error("❌ Error in verify-otp:", error);
    req.flash("error", "Something went wrong while verifying OTP.");
    return res.redirect(`/auth/verify-otp?email=${encodeURIComponent(req.body.email || "")}`);
  }
};






// In your auth controller - update postLogin function
exports.postLogin = async (req, res) => {
  try {
    const { email, password } = req.body;

    console.log("=== ADMIN LOGIN DEBUG ===");
    console.log("Email provided:", email);
    console.log(
      "Password provided length:",
      password ? password.length : "none"
    );
    console.log("Password value:", password); // Be careful with this in production

    // Find user by email
    const user = await User.findOne({ email });
    console.log(
      "User found:",
      user
        ? {
            id: user._id,
            email: user.email,
            role: user.role,
            isActive: user.isActive,
            hasPassword: !!user.password,
          }
        : "No user found"
    );

    if (!user) {
      console.log("❌ No user found with email:", email);
      req.flash("error", "Invalid email or password");
      return res.redirect("/auth/login");
    }

    // Check if user is active
    if (user.isActive === false) {
      console.log("❌ User account inactive");
      req.flash(
        "error",
        "Your account has been deactivated. Please contact support."
      );
      return res.redirect("/auth/login");
    }

    console.log("✅ User is active");
    console.log("🔑 User role:", user.role);

    // Debug password comparison
    console.log("=== PASSWORD COMPARISON DEBUG ===");
    console.log("Input password:", password);
    console.log("Stored password hash:", user.password);

    // Check password
    const isPasswordValid = await user.comparePassword(password);
    console.log("🔐 Password valid:", isPasswordValid);

    if (!isPasswordValid) {
      console.log("❌ Invalid password for user:", email);

      // Additional debug: Check if it's a bcrypt hash
      const isBcryptHash = user.password && user.password.startsWith("$2b$");
      console.log("Is bcrypt hash:", isBcryptHash);
      console.log(
        "Hash length:",
        user.password ? user.password.length : "none"
      );

      req.flash("error", "Invalid email or password");
      return res.redirect("/auth/login");
    }

    console.log("✅ Password validated successfully");

    // Set up session
    req.session.userId = user._id;
    req.session.userRole = user.role;
    req.session.user = {
      _id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
    };

    console.log("=== SESSION SETUP ===");
    console.log("Session userId:", req.session.userId);
    console.log("Session userRole:", req.session.userRole);
    console.log("Session user:", req.session.user);

    console.log("🔄 Redirecting based on role:", user.role);

    // Redirect based on role
    if (user.role === "customer") {
      res.redirect("/customer/dashboard");
    } else if (user.role === "seller") {
      res.redirect("/seller/dashboard");
    } else if (user.role === "admin") {
      res.redirect("/admin/dashboard");
    } else {
      res.redirect("/dashboard");
    }
  } catch (error) {
    console.error("💥 Login error:", error);
    console.error("Error stack:", error.stack);
    req.flash("error", "An error occurred during login");
    res.redirect("/auth/login");
  }
};
// Update getLandingPage to handle admin redirect
// exports.getLandingPage = (req, res) => {
//   if (req.session.userId) {
//     const role = req.session.userRole;
//     if (role === "customer") {
//       return res.redirect("/customer/dashboard");
//     } else if (role === "seller") {
//       return res.redirect("/seller/dashboard");
//     } else if (role === "admin") {
//       return res.redirect("/admin/dashboard");
//     }
//   }
//   res.render("index");
// };

exports.getLandingPage = (req, res) => {
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

  const blogs = [
    {
      img: "/images/landing/project-1.jpg",
      title: "Blog 1",
      summary: "Summary of blog 1",
      link: "/content/blog-1",
    },
    {
      img: "/images/landing/project-4.jpg",
      title: "Blog 2",
      summary: "Summary of blog 2",
      link: "/content/blog-2",
    },
    {
      img: "/images/landing/project-3.jpg",
      title: "Blog 3",
      summary: "Summary of blog 3",
      link: "/content/blog-3",
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

  res.render("index", { carouselItems, services, blogs, testimonials });
};

exports.getRegister = (req, res) => {
  // If already logged in, redirect to dashboard
  if (req.session.userId) {
    if (req.session.userRole === "customer") {
      return res.redirect("/customer/dashboard");
    } else {
      return res.redirect("/seller/dashboard");
    }
  }

  const role = req.query.role || "customer";
  res.render("auth/register", { role });
};

exports.postRegister = async (req, res) => {
  try {
    const { name, email, password, confirmPassword, role, phone, companyName } =
      req.body;

    console.log("=== REGISTRATION ATTEMPT ===");
    console.log("Role:", role);
    console.log("Email:", email);

    // Validation
    if (password !== confirmPassword) {
      req.flash("error", "Passwords do not match");
      return res.redirect(`/auth/register?role=${role}`);
    }

    if (password.length < 6) {
      req.flash("error", "Password must be at least 6 characters long");
      return res.redirect(`/auth/register?role=${role}`);
    }

    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      req.flash("error", "User already exists with this email");
      return res.redirect(`/auth/register?role=${role}`);
    }

    // Create user
    const userData = {
      name,
      email,
      password,
      role,
      phone,
    };

    // Add companyName only for sellers
    if (role === "seller" && companyName) {
      userData.companyName = companyName;
    }
    if (role !== "seller") {
      const user = await User.create(userData);
      console.log("User created successfully:", user.email);

      req.session.userId = user._id;
      req.session.userRole = user.role;
      req.session.user = {
        _id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
      };
    }

    if (role === "seller") {
      req.session.seller = userData;
      console.log("Seller session ID set:", req.session.sellerId);
    }

    console.log(
      "Registration successful, redirecting to:",
      `/${role}/dashboard`
    );

    // Redirect based on role
    if (role === "customer") {
      res.redirect("/customer/dashboard");
    } else {
      res.render("auth/seller-register");
    }
  } catch (error) {
    console.error("Registration error:", error);

    // Handle duplicate email error
    if (error.code === 11000) {
      req.flash("error", "User already exists with this email");
    } else if (error.name === "ValidationError") {
      const messages = Object.values(error.errors).map((err) => err.message);
      req.flash("error", messages.join(", "));
    } else {
      req.flash("error", "Error creating user account");
    }

    res.redirect(`/auth/register?role=${req.body.role}`);
  }
};

exports.sellerRegisterForm = async (req, res) => {
  res.render("auth/seller-register");
};

exports.postSellerData = async (req, res) => {
  try {
    console.log("=== 🧾 SELLER REGISTRATION STEP 2 ===");

    // ✅ 1️⃣ Check session
    if (!req.session.seller) {
      console.log("❌ No seller session found");
      req.flash("error", "Session expired. Please register again.");
      return res.redirect("/auth/register?role=seller");
    }

    const sessionSeller = req.session.seller;

    // ✅ 2️⃣ Extract flat fields from form
    const {
      BusinessType,
      BusinessName,
      BusinessDetails,
      PersonalDetails,
      officeName,
      state,
      district,
      city,
      pinCode,
      fullAddress,
      gstin,
      primary,
      pan,
      itrType,
      assessmentYear,
      ackNumber,
      profitGainFromBusiness,
      grossReceipts,
    } = req.body;

    console.log("📦 Received seller form data:", req.body);

    // ✅ 3️⃣ Create user first (if not already)
    let user;
    if (!req.session.userId) {
      user = await User.create({
        name: sessionSeller.name,
        email: sessionSeller.email,
        password: sessionSeller.password, // ✅ plain password
        role: "seller",
        phone: sessionSeller.phone,
        companyName: sessionSeller.companyName,
      });

      req.session.userId = user._id;
      req.session.userRole = "seller";
      console.log("✅ New user created:", user.email);
    } else {
      user = await User.findById(req.session.userId);
      console.log("ℹ️ Existing user found:", user?.email);
    }

    // ✅ 4️⃣ Handle uploads (Cloudinary)
    const AadhaarFile = req.files?.Aadhaar?.[0];
    const PancardFile = req.files?.Pancard?.[0];

    if (!AadhaarFile || !PancardFile) {
      req.flash("error", "Aadhaar and PAN card are required.");
      return res.redirect("/auth/seller-register");
    }

    const Aadhaar = {
      public_id: AadhaarFile.filename,
      secure_url: AadhaarFile.path,
      format: AadhaarFile.format,
      resource_type: AadhaarFile.resource_type,
      bytes: AadhaarFile.size,
      created_at: new Date(),
    };

    const Pancard = {
      public_id: PancardFile.filename,
      secure_url: PancardFile.path,
      format: PancardFile.format,
      resource_type: PancardFile.resource_type,
      bytes: PancardFile.size,
      created_at: new Date(),
    };

    // ✅ 5️⃣ Tax document uploads (optional)
    let taxDocs = [];
    if (req.files?.taxDocuments) {
      taxDocs = req.files.taxDocuments.map((doc) => ({
        public_id: doc.filename,
        secure_url: doc.path,
        format: doc.format,
        resource_type: doc.resource_type,
        bytes: doc.size,
        created_at: new Date(),
      }));
    }

    // ✅ 6️⃣ Fix assessment year format (auto convert)
    let formattedYear = (assessmentYear || "").trim();
    if (/^\d{2}-\d{2}$/.test(formattedYear)) {
      formattedYear = `20${formattedYear}`; // e.g., 23-24 → 2023-24
    }

    // ✅ 7️⃣ Build data objects manually
    const officeLocations = [
      {
        officeName,
        address: { state, district, city, pinCode, fullAddress },
        gstin,
        primary: primary === "on" || primary === true,
      },
    ];

    const taxAssessments = [
      {
        pan,
        itrType,
        assessmentYear: formattedYear,
        ackNumber,
        profitGainFromBusiness: Number(profitGainFromBusiness) || 0,
        grossReceipts: Number(grossReceipts) || 0,
        documents: taxDocs,
      },
    ];

    // ✅ 8️⃣ Create Seller record
    const seller = await Seller.create({
      userId: user._id,
      BusinessType,
      BusinessName,
      BusinessDetails: Array.isArray(BusinessDetails)
        ? BusinessDetails
        : [BusinessDetails],
      PersonalDetails: Array.isArray(PersonalDetails)
        ? PersonalDetails
        : [PersonalDetails],
      Aadhaar,
      Pancard,
      officeLocations,
      taxAssessments,
    });

    console.log("✅ Seller registered successfully:", seller._id);

    // ✅ 9️⃣ Save session and redirect

    console.log(user._id);
    req.session.userId = user._id;
    req.session.user = user;

    req.session.save();
    console.log(user._id);

    req.flash("success", "Seller registration completed successfully!");
    return res.redirect("/seller/dashboard");
  } catch (error) {
    console.error("❌ Seller registration error:", error);
    req.flash(
      "error",
      `Error during seller registration: ${error.message || error}`
    );
    return res.redirect("/auth/seller-register");
  }
};

exports.logout = (req, res) => {
  console.log("Logging out user:", req.session.userId);
  req.session.destroy((err) => {
    if (err) {
      console.error("Error destroying session:", err);
    }
    res.redirect("/");
  });
};



exports.getTerms = (req,res)=>{
  res.render("auth/terms")

}


exports.getPrivacy = (req,res)=>{
  res.render("auth/privacy")

}

exports.getShipping = (req,res)=>{
  res.render("auth/shipping")

}

exports.getRefund = (req,res)=>{
  res.render("auth/refund")

}



module.exports = exports;
