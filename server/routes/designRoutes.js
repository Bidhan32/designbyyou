const express = require('express');
const router = express.Router();
const designCtrl = require('../controllers/designController');
const { protect } = require('../middlewares/authMiddleware');

 router.get('/load/:designId', designCtrl.loadSketch);
 router.post('/save', protect, designCtrl.saveNewSketch);
 router.patch('/update/:designId', protect, designCtrl.updateSketch);
 router.put('/ecommerce/designs/:designId/canvas', protect, designCtrl.updateSketch);
 router.post('/ecommerce/designs/:designId/ai-render', protect, designCtrl.transformSketchToApparel);
router.post('/ecommerce/designs/:designId/ai-tryon',   protect, designCtrl.virtualTryOnRender);
 router.patch('/ecommerce/designs/:designId/texture',   protect, designCtrl.saveActiveTexture);
 router.get('/ecommerce/designs/:designId/tech-pack', protect, designCtrl.generateTechPackData);
router.put('/ecommerce/designs/:designId/bom',       protect, designCtrl.updateBillOfMaterials);

 module.exports = router;