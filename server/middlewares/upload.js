const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const multer = require('multer');

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_NAME,
  api_key: process.env.CLOUDINARY_KEY,
  api_secret: process.env.CLOUDINARY_SECRET
});

// 1. Profile/Preview Storage (Optimized & Compressed)
const previewStorage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'designbyyou_previews',
    allowed_formats: ['jpg', 'png', 'jpeg'],
    transformation: [
      { width: 1200, height: 1200, crop: 'limit' },
      { quality: 'auto:good' },
      { fetch_format: 'auto' }
    ],
  },
});

// 2. High-Res Storage (No Compression - The product itself)
const highResStorage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'designbyyou_assets',
    resource_type: 'auto',
  },
});

const uploadPreview = multer({ 
  storage: previewStorage,
  limits: { fileSize: 5 * 1024 * 1024 } 
});

const uploadDesign = multer({ 
  storage: highResStorage,
  limits: { fileSize: 25 * 1024 * 1024 } // 25MB limits
});

module.exports = { uploadPreview, uploadDesign };