const express = require('express');
const router = express.Router();

// Import your showcase controller
const showcaseController = require('../controllers/showcaseController');

// ==========================================
// 1. STATIC ROUTES (Must go first!)
// ==========================================

// Fetch the main gallery pipeline for the Masonry Grid
// (Make sure the controller function matches whatever you named it, e.g., getPipeline, getShowcase, etc.)
router.get('/pipeline', showcaseController.getShowcasePipeline); 


// ==========================================
// 2. DYNAMIC ROUTES (Must go at the bottom!)
// ==========================================

// Fetch a specific asset's cinematic details using its URL slug
router.get('/pipeline/:slug', showcaseController.getAssetBySlug);


module.exports = router;