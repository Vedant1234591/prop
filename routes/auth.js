const express = require("express");
const router = express.Router();
const authController = require("../controllers/authController");

const { upload } = require("../middleware/upload");

router.get("/", authController.getLandingPage);
router.get("/login", authController.getLogin);
router.get("/about", authController.getAbout);
router.get("/contact-us", authController.getContact);

//otp for login
router.get("/login-otp", authController.getLogin_otp);
router.post("/send-otp", authController.postSend_otp);
router.get("/verify-otp", authController.getVerify_otp);
router.post("/verify-otp", authController.postVerify_otp);



router.post("/login", authController.postLogin);
router.get("/register", authController.getRegister);
router.post("/register", authController.postRegister);
router.get("/seller-register", authController.sellerRegisterForm);
router.post(
  "/seller-register",
  upload.fields([
    { name: "Aadhaar", maxCount: 1 },
    { name: "Pancard", maxCount: 1 },
    { name: "taxAssessments[0][documents]", maxCount: 5 },
  ]),
  authController.postSellerData
);
router.post("/logout", authController.logout);




router.get("/terms",authController.getTerms)
router.get("/privacy",authController.getPrivacy)
router.get("/shipping",authController.getShipping)
router.get("/refund",authController.getRefund)





module.exports = router;
