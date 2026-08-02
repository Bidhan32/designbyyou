// routes/creatorRoutes.js
const express = require('express');
const router = express.Router();

const creatorCtrl = require('../controllers/creators/creatorController');
const { protect } = require('../middlewares/authMiddleware');
const { uploadPreview } = require('../middlewares/upload'); // Adjust path to where your multer setup is

router.post(
    '/marketplace/upload',
    protect, 
    // Put Multer back! It will intercept 'preview', send it to Cloudinary, and attach req.file
    uploadPreview.single('preview'), 
    creatorCtrl.uploadToCreatorMarketplace
);

module.exports = router;