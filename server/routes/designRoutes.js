const express = require('express');
const router = express.Router();
const designCtrl = require('../controllers/designController');
const { protect } = require('../middlewares/authMiddleware');

// Every legacy workspace endpoint contains private project data.
router.use(protect);
 router.get('/load/:designId', designCtrl.loadSketch);
 router.post('/save', designCtrl.saveNewSketch);
 router.patch('/update/:designId', designCtrl.updateSketch);
 router.put('/ecommerce/designs/:designId/canvas', designCtrl.updateSketch);
 router.post('/ecommerce/designs/:designId/ai-render', designCtrl.transformSketchToApparel);
router.post('/ecommerce/designs/:designId/ai-tryon', designCtrl.virtualTryOnRender);
 router.patch('/ecommerce/designs/:designId/texture', designCtrl.saveActiveTexture);
 router.get('/ecommerce/designs/:designId/tech-pack', designCtrl.generateTechPackData);
router.put('/ecommerce/designs/:designId/bom', designCtrl.updateBillOfMaterials);

 module.exports = router;
