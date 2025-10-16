// utils/cloudinaryUtils.js
const cloudinary = require("../config/cloudinary");

// ✅ Generic helper to generate signed download URLs
function generateSignedDownloadUrl(
  publicId,
  format = "pdf",
  accessMode = "authenticated"
) {
  if (!publicId) throw new Error("❌ Missing Cloudinary publicId");

  return cloudinary.utils.private_download_url(publicId, format, {
    resource_type: "raw", // required for PDFs or docs
    type: accessMode, // "authenticated" for private, "upload" for public
    attachment: true, // force browser download
  });
}

// ✅ Customer-specific helper
function generateCustomerContractUrl(publicId) {
  console.log("📜 Generating Customer contract URL for:", publicId);
  return generateSignedDownloadUrl(publicId, "pdf", "upload");
}

// ✅ Seller-specific helper
function generateSellerContractUrl(publicId) {
  console.log("📜 Generating Seller contract URL for:", publicId);
  return generateSignedDownloadUrl(publicId, "pdf", "upload");
}

module.exports = {
  generateSignedDownloadUrl,
  generateCustomerContractUrl,
  generateSellerContractUrl,
};
