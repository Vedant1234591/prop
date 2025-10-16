const cloudinary = require("cloudinary").v2;
require("dotenv").config();

// ✅ Configure Cloudinary first
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true,
});

// ✅ Generate the signed private download URL (for authenticated, raw PDFs)
const downloadUrl = cloudinary.utils.private_download_url(
  "propload/contract-templates/seller_contract_68f0ccb7a81d1b18b301815c_1760611560863", // 👈 no ".pdf"
  "pdf",
  {
    resource_type: "raw", // 👈 Required for PDFs and other non-images
    type: "authenticated", // 👈 Required for protected files
    attachment: true, // 👈 Forces browser download
  }
);

console.log("✅ Signed Download URL:", downloadUrl);

// res.redirect(downloadUrl);

module.exports = cloudinary;

// const cloudinary = require("cloudinary").v2;
// require("dotenv").config();

// cloudinary.config({
//   cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
//   api_key: process.env.CLOUDINARY_API_KEY,
//   api_secret: process.env.CLOUDINARY_API_SECRET,
//   secure: true,
// });

// function generateContractDownloadUrl(
//   contractType,
//   bidId,
//   isAuthenticated = false
// ) {
//   const publicId = `propload/contract-templates/${contractType}_contract_${bidId}_<timestamp>`;
//   const options = {
//     resource_type: "raw",
//     attachment: true,
//     type: isAuthenticated ? "authenticated" : "upload",
//   };
//   return cloudinary.utils.private_download_url(publicId, "pdf", options);
// }

// module.exports = {
//   cloudinary,
//   generateContractDownloadUrl,
// };

// config/cloudinary.js
// config/cloudinary.js

// require("dotenv").config();
// const cloudinary = require("cloudinary").v2;

// // ✅ Configure Cloudinary once globally
// cloudinary.config({
//   cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
//   api_key: process.env.CLOUDINARY_API_KEY,
//   api_secret: process.env.CLOUDINARY_API_SECRET,
//   secure: true,
// });

// // ✅ Debug check to ensure proper setup
// console.log("✅ Cloudinary configured successfully");
// console.log(
//   "🧠 Cloudinary uploader test:",
//   typeof cloudinary.uploader.upload_stream
// );

// // ✅ Export ONLY the real Cloudinary instance
// module.exports = cloudinary;
