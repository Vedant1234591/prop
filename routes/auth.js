const express = require("express");
const router = express.Router();
const authController = require("../controllers/authController");

const { upload } = require("../middleware/upload");

router.get("/", authController.getLandingPage);
router.get("/login", authController.getLogin);
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

module.exports = router;
