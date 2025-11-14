const PDFDocument = require("pdfkit");
const fs = require("fs");
const path = require("path");
const cloudinary = require("../config/cloudinary");

class PDFGenerator {
  constructor() {
    this.templates = {
      customer: this.generateCustomerContract.bind(this),
      seller: this.generateSellerContract.bind(this),
      certificate: this.generateCertificate.bind(this),
    };
  }

  // Generate customer contract
  async generateCustomerContract(bid, project, customer, seller) {
    return new Promise(async (resolve, reject) => {
      try {
        const doc = new PDFDocument({ margin: 50 });
        const chunks = [];

        doc.on("data", (chunk) => chunks.push(chunk));
        doc.on("end", async () => {
          try {
            const pdfBuffer = Buffer.concat(chunks);
            // Upload to Cloudinary
            const result = await new Promise((resolve, reject) => {
              const stream = cloudinary.uploader.upload_stream(
                {
                  resource_type: "raw",
                  folder: "propload/contract-templates",
                  public_id: `customer_contract_${bid._id}_${Date.now()}`,
                  format: "pdf",
                  access_mode: "public",
                  type: "authenticated",
                },
                (error, result) => {
                  if (error) reject(error);
                  else resolve(result);
                }
              );
              stream.end(pdfBuffer);
            });
            resolve(result);
          } catch (error) {
            reject(error);
          }
        });

        // Contract content
        this.addCustomerContractContent(doc, bid, project, customer, seller);
        doc.end();
      } catch (error) {
        reject(error);
      }
    });
  }

  
  
  async generateSellerContract(bid, project, customer, seller) {
    return new Promise(async (resolve, reject) => {
      try {
        const doc = new PDFDocument({ margin: 50 });
        const chunks = [];

        doc.on("data", (chunk) => chunks.push(chunk));
        doc.on("end", async () => {
          try {
            const pdfBuffer = Buffer.concat(chunks);

            // ✅ Upload to Cloudinary (PUBLIC & RAW)
            const result = await new Promise((resolve, reject) => {
              const stream = cloudinary.uploader.upload_stream(
                {
                  resource_type: "raw",
                  folder: "propload/contract-templates",
                  public_id: `seller_contract_${bid._id}_${Date.now()}`,
                  format: "pdf",
                  type: "authenticated", // ✅ keep this for private access
                  access_mode: "authenticated", // ✅ match customer setup
                },
                (error, result) => {
                  if (error) reject(error);
                  else resolve(result);
                }
              );
              stream.end(pdfBuffer);
            });

           
            resolve(result);
          } catch (error) {
            console.error("❌ Error uploading seller contract:", error);
            reject(error);
          }
        });

        // ✍️ Add content to the contract
        this.addSellerContractContent(doc, bid, project, customer, seller);
        doc.end();
      } catch (error) {
        console.error("❌ Error generating seller contract:", error);
        reject(error);
      }
    });
  }

  // In the generateCertificate method, make sure it returns the Cloudinary result
  async generateCertificate(bid, project, customer, seller) {
    return new Promise(async (resolve, reject) => {
      try {
        const doc = new PDFDocument({ margin: 50, size: "A4" });
        const chunks = [];

        doc.on("data", (chunk) => chunks.push(chunk));
        doc.on("end", async () => {
          try {
            const pdfBuffer = Buffer.concat(chunks);

            // Upload to Cloudinary with proper error handling
            const result = await new Promise((resolve, reject) => {
              const uploadStream = cloudinary.uploader.upload_stream(
                {
                  resource_type: "raw",
                  folder: "propload/certificates",
                  public_id: `completion_certificate_${bid._id}_${Date.now()}`,
                  format: "pdf",
                  access_mode: "public",
                  type: "authenticated",
                },
                (error, result) => {
                  if (error) {
                    console.error("❌ Cloudinary upload error:", error);
                    reject(error);
                  } else {
                    console.log(
                      "✅ Certificate uploaded to Cloudinary:",
                      result.secure_url
                    );
                    resolve(result);
                  }
                }
              );

              uploadStream.end(pdfBuffer);
            });

            resolve(result);
          } catch (error) {
            console.error("❌ Certificate upload error:", error);
            reject(error);
          }
        });

        // Add certificate content
        this.addCertificateContent(doc, bid, project, customer, seller);
        doc.end();
      } catch (error) {
        console.error("❌ Certificate generation error:", error);
        reject(error);
      }
    });
  }
  // Customer contract content
  addCustomerContractContent(doc, bid, project, customer, seller) {
    // Header
    doc
      .fontSize(20)
      .font("Helvetica-Bold")
      .text("CONTRACT AGREEMENT - CUSTOMER", { align: "center" });
    doc.moveDown();

    // Parties
    doc
      .fontSize(12)
      .font("Helvetica")
      .text(
        `This Agreement is made on ${new Date().toLocaleDateString()} between:`,
        { align: "left" }
      );
    doc.moveDown();

    doc.font("Helvetica-Bold").text("CUSTOMER:");
    doc
      .font("Helvetica")
      .text(`Name: ${customer.name}`)
      .text(`Email: ${customer.email}`)
      .text(`Phone: ${customer.phone || "N/A"}`);

    doc.moveDown();
    doc.font("Helvetica-Bold").text("SERVICE PROVIDER:");
    doc
      .font("Helvetica")
      .text(`Company: ${seller.companyName || seller.name}`)
      .text(`Email: ${seller.email}`)
      .text(`Phone: ${seller.phone || "N/A"}`);

    doc.moveDown();
    doc.font("Helvetica-Bold").text("PROJECT DETAILS:");
    doc
      .font("Helvetica")
      .text(`Title: ${project.title}`)
      .text(`Description: ${project.description}`)
      .text(`Category: ${project.category}`)
      .text(`Location: ${project.location.city}, ${project.location.state}`)
      .text(`Contract Value: $${bid.amount}`);

    // Terms and Conditions
    doc.moveDown();
    doc.font("Helvetica-Bold").text("TERMS AND CONDITIONS:");
    const terms = [
      "1. The Service Provider agrees to complete the work as described in the project requirements.",
      "2. The Customer agrees to make payments as per the agreed schedule.",
      "3. Both parties agree to resolve disputes through mediation.",
      "4. This contract is binding upon both parties after admin approval.",
      "5. Project timeline must be adhered to by both parties.",
      "6. Any changes must be approved in writing by both parties.",
    ];

    terms.forEach((term) => {
      doc.font("Helvetica").text(term, { indent: 20, continued: false });
    });

    // Signatures
    doc.moveDown(2);
    this.addSignatureSection(doc, "CUSTOMER SIGNATURE");
  }

  // Seller contract content
  addSellerContractContent(doc, bid, project, customer, seller) {
    // Header
    doc
      .fontSize(20)
      .font("Helvetica-Bold")
      .text("CONTRACT AGREEMENT - SERVICE PROVIDER", { align: "center" });
    doc.moveDown();

    // Parties
    doc
      .fontSize(12)
      .font("Helvetica")
      .text(
        `This Agreement is made on ${new Date().toLocaleDateString()} between:`,
        { align: "left" }
      );
    doc.moveDown();

    doc.font("Helvetica-Bold").text("SERVICE PROVIDER:");
    doc
      .font("Helvetica")
      .text(`Company: ${seller.companyName || seller.name}`)
      .text(`Email: ${seller.email}`)
      .text(`Phone: ${seller.phone || "N/A"}`)
      .text(`Tax ID: ${seller.taxId || "N/A"}`);

    doc.moveDown();
    doc.font("Helvetica-Bold").text("CUSTOMER:");
    doc
      .font("Helvetica")
      .text(`Name: ${customer.name}`)
      .text(`Email: ${customer.email}`);

    doc.moveDown();
    doc.font("Helvetica-Bold").text("SERVICE PROVIDER COMMITMENTS:");
    const commitments = [
      "1. Provide all necessary materials and labor to complete the project.",
      "2. Maintain proper insurance coverage throughout the project.",
      "3. Comply with all local building codes and regulations.",
      "4. Provide regular progress updates to the customer.",
      "5. Complete work within the agreed timeline.",
      "6. Maintain a safe work environment.",
    ];

    commitments.forEach((commitment) => {
      doc.font("Helvetica").text(commitment, { indent: 20, continued: false });
    });

    // Signatures
    doc.moveDown(2);
    this.addSignatureSection(doc, "SERVICE PROVIDER SIGNATURE");
  }

  // Certificate content
  addCertificateContent(doc, bid, project, customer, seller) {
    // Decorative border
    doc.rect(30, 30, doc.page.width - 60, doc.page.height - 60).stroke();

    // Title
    doc
      .fontSize(28)
      .font("Helvetica-Bold")
      .text("CERTIFICATE OF COMPLETION", { align: "center" });
    doc.moveDown();

    doc
      .fontSize(18)
      .font("Helvetica")
      .text("This certifies that", { align: "center" });
    doc.moveDown();

    // Seller name
    doc
      .fontSize(22)
      .font("Helvetica-Bold")
      .text(seller.companyName || seller.name, { align: "center" });
    doc.moveDown();

    doc
      .fontSize(16)
      .font("Helvetica")
      .text("has successfully completed the project", { align: "center" });
    doc.moveDown();

    // Project title
    doc
      .fontSize(20)
      .font("Helvetica-Bold")
      .text(`"${project.title}"`, { align: "center" });
    doc.moveDown(2);

    // Details
    doc
      .fontSize(12)
      .font("Helvetica")
      .text(`Project Value: $${bid.amount}`, { align: "center" })
      .text(`Completion Date: ${new Date().toLocaleDateString()}`, {
        align: "center",
      })
      .text(`Category: ${project.category.toUpperCase()}`, { align: "center" });

    doc.moveDown(3);

    // Signatures
    const centerX = doc.page.width / 2;

    // Admin signature
    doc
      .fontSize(10)
      .font("Helvetica")
      .text("_________________________", centerX - 150, doc.y, {
        width: 300,
        align: "center",
      })
      .text("Authorized Signatory", centerX - 150, doc.y, {
        width: 300,
        align: "center",
      })
      .text("Propload Administration", centerX - 150, doc.y, {
        width: 300,
        align: "center",
      });
  }

  addSignatureSection(doc, title) {
    doc
      .fontSize(10)
      .font("Helvetica")
      .text("_________________________", { align: "left" })
      .text(title, { align: "left" })
      .text("Date: ___________________", { align: "left" });
  }

  // Generate contract based on type
  async generateContract(type, bid, project, customer, seller) {
    if (!this.templates[type]) {
      throw new Error(`Invalid contract type: ${type}`);
    }

    return await this.templates[type](bid, project, customer, seller);
  }
}

module.exports = new PDFGenerator();

