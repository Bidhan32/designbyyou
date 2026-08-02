const express = require('express');
const router = express.Router();

// 🚀 THE FIX: We are now explicitly requiring 'creatorshowcasecontroller'
const showcaseController = require('../controllers/creators/creatorshowcaseController'); 

const { protect, authorize } = require('../middlewares/authMiddleware');

// 🚀 STRICT ROLE GUARDRAILS
// Ensures only authenticated users with the 'creator' role can pull this premium data
router.use(protect);
router.use(authorize('creator', 'designer'));

/**
 * @route   GET /api/v1/showcase/pipeline
 * @desc    Get all published showcase assets (powers the Masonry grid)
 * @access  Private (Creator Only)
 */
router.get('/pipeline', showcaseController.getShowcase);

/**
 * @route   GET /api/v1/showcase/item/:slug
 * @desc    Get single showcase asset details by its slug
 * @access  Private (Creator Only)
 */
router.get('/item/:slug', showcaseController.getShowcaseItem);

module.exports = router;