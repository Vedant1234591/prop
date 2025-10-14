const multer = require('multer');
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const cloudinary = require('../config/cloudinary');

// Main Cloudinary storage configuration
const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: async (req, file) => {
    console.log('=== UPLOAD DEBUG ===');
    console.log('Request baseUrl:', req.baseUrl);
    console.log('Request path:', req.path);
    console.log('File mimetype:', file.mimetype);
    console.log('File originalname:', file.originalname);
    
    // Determine folder based on route or file type
    let folder = 'propload/misc';
    
    // Check for seller routes first
    if (req.baseUrl && req.baseUrl.includes('/seller')) {
      if (req.path.includes('update-profile-image') || req.originalUrl.includes('profile-image')) {
        folder = 'propload/profiles/seller';
        console.log('Detected seller profile image upload');
      } else if (req.path.includes('upload-document') || req.originalUrl.includes('document')) {
        folder = 'propload/seller/documents';
        console.log('Detected seller document upload');
      } else if (file.mimetype.startsWith('image/')) {
        folder = 'propload/seller/images';
        console.log('Detected seller image upload');
      } else if (file.mimetype.includes('pdf') || file.mimetype.includes('document')) {
        folder = 'propload/seller/documents';
        console.log('Detected seller document upload');
      } else {
        folder = 'propload/seller/misc';
      }
    } 
    // Check for customer routes
    else if (req.baseUrl && req.baseUrl.includes('/customer')) {
      if (req.path.includes('update-profile-image') || req.originalUrl.includes('profile-image')) {
        folder = 'propload/profiles/customer';
        console.log('Detected customer profile image upload');
      } else if (file.mimetype.startsWith('image/')) {
        folder = 'propload/projects/images';
        console.log('Detected project image upload');
      } else if (file.mimetype.includes('pdf') || 
                 file.mimetype.includes('document') || 
                 file.mimetype.includes('msword') ||
                 file.mimetype.includes('wordprocessingml')) {
        folder = 'propload/projects/documents';
        console.log('Detected project document upload');
      } else {
        folder = 'propload/projects/misc';
      }
    }
    // Check for profile routes (general)
    else if (req.baseUrl && req.baseUrl.includes('/profile')) {
      folder = 'propload/profiles';
      console.log('Detected general profile upload');
    }
    // Check for contract routes - ENHANCED
    else if (req.baseUrl && req.baseUrl.includes('/contract') || 
             req.path.includes('upload-contract') ||
             req.path.includes('customer-contract')) {
      folder = 'propload/contracts';
      console.log('Detected contract upload');
    }
    // Auth routes (registration documents)
    else if (req.baseUrl && req.baseUrl.includes('/auth')) {
      if (file.mimetype.startsWith('image/')) {
        folder = 'propload/auth/images';
      } else {
        folder = 'propload/auth/documents';
      }
      console.log('Detected auth upload');
    }

    console.log('Final folder:', folder);

    // Generate unique public_id
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 15);
    const originalName = file.originalname.split('.')[0].replace(/[^a-zA-Z0-9]/g, '_');
    const public_id = `${originalName}_${timestamp}_${random}`;

    // Base params
    const params = {
      folder: folder,
      public_id: public_id,
    };

    // Add transformations only for images
    if (file.mimetype.startsWith('image/')) {
      params.format = 'webp';
      params.transformation = [
        { width: 1200, height: 800, crop: 'limit' },
        { quality: 'auto' }
      ];
      console.log('Applied image transformations');
    }

    console.log('Final Cloudinary params:', params);
    return params;
  },
});

// File filter for all uploads
const fileFilter = (req, file, cb) => {
  console.log('File filter checking:', file.mimetype, file.originalname);
  
  // Check file types
  if (file.mimetype.startsWith('image/')) {
    console.log('✓ Image file accepted');
    cb(null, true);
  } else if (file.mimetype === 'application/pdf') {
    console.log('✓ PDF file accepted');
    cb(null, true);
  } else if (file.mimetype === 'application/msword' || 
             file.mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
    console.log('✓ Word document accepted');
    cb(null, true);
  } else {
    console.log('✗ Invalid file type rejected:', file.mimetype);
    cb(new Error('Invalid file type. Only images, PDFs, and Word documents are allowed.'), false);
  }
};

// Main upload configuration
const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
    files: 15 // Maximum 15 files total
  }
});

// Profile image upload (specific for profile images)
const uploadProfileImage = multer({
  storage: new CloudinaryStorage({
    cloudinary: cloudinary,
    params: {
      folder: 'propload/profiles',
      format: 'webp',
      transformation: [
        { width: 500, height: 500, crop: 'fill', gravity: 'face' },
        { quality: 'auto' }
      ]
    }
  }),
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      console.log('✓ Profile image accepted');
      cb(null, true);
    } else {
      console.log('✗ Profile image rejected - not an image');
      cb(new Error('Only image files are allowed for profile pictures'), false);
    }
  },
  limits: {
    fileSize: 2 * 1024 * 1024, // 2MB for profile images
    files: 1
  }
});

// Images only upload
const uploadImages = multer({
  storage: new CloudinaryStorage({
    cloudinary: cloudinary,
    params: {
      folder: 'propload/projects/images',
      format: 'webp',
      transformation: [
        { width: 1200, height: 800, crop: 'limit' },
        { quality: 'auto' }
      ]
    }
  }),
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      console.log('✓ Project image accepted');
      cb(null, true);
    } else {
      console.log('✗ Project image rejected - not an image');
      cb(new Error('Only image files are allowed'), false);
    }
  },
  limits: {
    fileSize: 5 * 1024 * 1024,
    files: 10
  }
});

// Documents only upload
const uploadDocuments = multer({
  storage: new CloudinaryStorage({
    cloudinary: cloudinary,
    params: {
      folder: 'propload/documents'
    }
  }),
  fileFilter: (req, file, cb) => {
    const allowedTypes = [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'image/jpeg',
      'image/png',
      'image/jpg'
    ];
    if (allowedTypes.includes(file.mimetype)) {
      console.log('✓ Document accepted:', file.mimetype);
      cb(null, true);
    } else {
      console.log('✗ Document rejected:', file.mimetype);
      cb(new Error('Only PDF, Word documents, and images are allowed'), false);
    }
  },
  limits: {
    fileSize: 10 * 1024 * 1024,
    files: 5
  }
});

// Single file upload
const uploadSingle = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024
  }
});

// Contract documents upload - ENHANCED
const uploadContracts = multer({
  storage: new CloudinaryStorage({
    cloudinary: cloudinary,
    params: {
      folder: 'propload/contracts',
      // NEW: Better organization for contracts
      public_id: (req, file) => {
        const timestamp = Date.now();
        const type = req.path.includes('customer') ? 'customer' : 'seller';
        const projectId = req.body.projectId || 'unknown';
        return `contract_${type}_${projectId}_${timestamp}`;
      }
    }
  }),
  fileFilter: (req, file, cb) => {
    const allowedTypes = [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'image/jpeg',
      'image/png'
    ];
    if (allowedTypes.includes(file.mimetype)) {
      console.log('✓ Contract document accepted');
      cb(null, true);
    } else {
      console.log('✗ Contract document rejected');
      cb(new Error('Only PDF, Word documents, and images are allowed for contracts'), false);
    }
  },
  limits: {
    fileSize: 10 * 1024 * 1024,
    files: 3
  }
});

// NEW: Bid attachments upload (specific for bid proposals)
const uploadBidAttachments = multer({
  storage: new CloudinaryStorage({
    cloudinary: cloudinary,
    params: {
      folder: 'propload/bid-attachments',
      public_id: (req, file) => {
        const timestamp = Date.now();
        const projectId = req.params.id || 'unknown';
        return `bid_attachment_${projectId}_${timestamp}`;
      }
    }
  }),
  fileFilter: fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024,
    files: 5
  }
});

module.exports = {
  upload,
  uploadImages,
  uploadDocuments,
  uploadSingle,
  uploadProfileImage,
  uploadContracts,
  uploadBidAttachments // NEW
};