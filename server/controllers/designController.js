// server/controllers/designController.js
// Ensure your database dependency is imported correctly at the top
// const db = require('../config/db'); 
// const axios = require('axios');

// ==========================================
// 1. CORE WORKSPACE HANDLERS (Previously Missing)
// ==========================================

/**
 * GET /api/v1/workspace/load/:designId
 */
exports.loadSketch = async (req, res) => {
    try {
        const { designId } = req.params;
        
        // TODO: Replace this placeholder with your actual original load query logic
        const result = await db.query(`SELECT * FROM designs WHERE id = $1`, [designId]);
        
        if (result.rows.length === 0) {
            return res.status(404).json({ message: "Workspace profile not found." });
        }

        res.status(200).json({ status: 'success', data: result.rows[0] });
    } catch (err) {
        console.error("Load Sketch Error:", err);
        res.status(500).json({ message: "Failed to hydrate layout canvas." });
    }
};

/**
 * POST /api/v1/workspace/save
 */
exports.saveNewSketch = async (req, res) => {
    try {
        const { title, product_type, canvas_state } = req.body;
        const owner_id = req.user.id;

        // TODO: Replace this placeholder with your actual original insert query logic
        const result = await db.query(
            `INSERT INTO designs (title, product_type, canvas_state, owner_id, created_at, updated_at)
             VALUES ($1, $2, $3, $4, NOW(), NOW()) RETURNING *`,
            [title || 'Untitled Sketch', product_type || 'apparel', canvas_state, owner_id]
        );

        res.status(201).json({ status: 'success', data: result.rows[0] });
    } catch (err) {
        console.error("Save New Sketch Error:", err);
        res.status(500).json({ message: "Failed to initialize cloud layout layer." });
    }
};

/**
 * PUT /api/v1/workspace/ecommerce/designs/:designId/canvas
 * PATCH /api/v1/workspace/update/:designId
 */
exports.updateSketch = async (req, res) => {
    try {
        const { designId } = req.params;
        const { canvas_state } = req.body;
        const owner_id = req.user.id;

        // TODO: Replace this placeholder with your actual original update query logic
        const result = await db.query(
            `UPDATE designs 
                SET canvas_state = $1, updated_at = NOW() 
              WHERE id = $2 AND owner_id = $3 RETURNING *`,
            [canvas_state, designId, owner_id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ message: "Design workspace matrix not found or unauthorized." });
        }

        res.status(200).json({ status: 'success', data: result.rows[0] });
    } catch (err) {
        console.error("Update Sketch Error:", err);
        res.status(500).json({ message: "Failed to synchronize design vector states." });
    }
};

/**
 * POST /api/v1/workspace/ecommerce/designs/:designId/ai-render
 */
exports.transformSketchToApparel = async (req, res) => {
    try {
        const { designId } = req.params;
        const { prompt, sketchDataUrl } = req.body;

        // TODO: Re-paste your original Fal.ai transform code here!
        
        res.status(200).json({ status: 'success', renderUrl: "https://via.placeholder.com/500" });
    } catch (err) {
        console.error("AI Transform Error:", err);
        res.status(500).json({ message: "AI pipeline rendering fault." });
    }
};


// ==========================================
// 2. NEW PREMIUM FASHION EXTENSIONS
// ==========================================

/**
 * POST /api/v1/workspace/ecommerce/designs/:designId/ai-tryon
 */
exports.virtualTryOnRender = async (req, res) => {
    try {
        const { designId } = req.params;
        const { sketchDataUrl, modelBgUrl, modelPrompt } = req.body;
        const designerId = req.user.id;
 
        // 1. Ownership check
        const designCheck = await db.query(
            `SELECT id FROM designs WHERE id = $1 AND owner_id = $2`,
            [designId, designerId]
        );
 
        if (designCheck.rows.length === 0) {
            return res.status(403).json({ message: "Unauthorized access modification request." });
        }
 
        if (!sketchDataUrl || !modelBgUrl || !modelPrompt) {
            return res.status(400).json({
                message: "sketchDataUrl, modelBgUrl, and modelPrompt are all required."
            });
        }
 
        // 2. Stamp dispatch timestamp immediately
        await db.query(
            `UPDATE designs
                SET tryon_model_bg_url  = $1,
                    tryon_model_prompt  = $2,
                    tryon_dispatched_at = NOW(),
                    updated_at          = NOW()
              WHERE id = $3`,
            [modelBgUrl, modelPrompt, designId]
        );
 
        // 3. Dispatch to Fal.ai IP-Adapter
        const aiResponse = await axios.post('https://queue.fal.run/fal-ai/ip-adapter-face-id', {
            ip_adapter_image_url: sketchDataUrl,  // garment reference
            image_url: modelBgUrl,                // runway/backdrop compositional base
 
            prompt: `${modelPrompt}, wearing the garment from the reference image, ` +
                    'editorial high-fashion photography, 8k resolution, hyper-realistic fabric texture, ' +
                    'professional studio lighting, Vogue runway aesthetic, crisp seams',
            negative_prompt: 'cartoon, illustration, blurry, deformed, duplicate, extra limbs, ' +
                             'ugly, low quality, watermark, text, drawing paper background',
 
            num_inference_steps: 35,
            guidance_scale: 7.0,
            ip_adapter_scale: 0.6,   // 0 = ignore garment ref, 1 = copy exactly
            strength: 0.75,          // how much the backdrop init image steers composition
        }, {
            headers: {
                'Authorization': `Key ${process.env.FAL_KEY}`,
                'Content-Type': 'application/json'
            }
        });
 
        const tryonUrl = aiResponse.data.images[0].url;
 
        // 4. Persist completed result
        await db.query(
            `UPDATE designs
                SET tryon_high_res_file_url = $1,
                    tryon_completed_at      = NOW(),
                    updated_at              = NOW()
              WHERE id = $2`,
            [tryonUrl, designId]
        );
 
        res.status(200).json({
            status: 'success',
            message: 'Virtual try-on render completed.',
            tryonUrl
        });
 
    } catch (err) {
        console.error("AI Virtual Try-On Crash:", err.response?.data || err.message);
        res.status(500).json({
            message: "The try-on pipeline encountered an error compositing the model scene."
        });
    }
};
 
/**
 * PATCH /api/v1/workspace/ecommerce/designs/:designId/texture
 */
exports.saveActiveTexture = async (req, res) => {
    const { designId } = req.params;
    const { textureKey } = req.body;
    const owner_id = req.user.id;
 
    try {
        const result = await db.query(
            `UPDATE designs
                SET active_texture_key = $1,
                    updated_at         = NOW()
              WHERE id = $2 AND owner_id = $3
            RETURNING id, active_texture_key`,
            [textureKey, designId, owner_id]
        );
 
        if (result.rows.length === 0) {
            return res.status(404).json({
                message: "Design workspace matrix not found or unauthorized editing attempt."
            });
        }
 
        res.status(200).json({ status: 'success', data: result.rows[0] });
    } catch (error) {
        console.error("Save Active Texture Error:", error);
        res.status(500).json({ message: "Failed to persist texture selection." });
    }
};

// server/controllers/designController.js

/**
 * GET /api/v1/workspace/ecommerce/designs/:designId/tech-pack
 * Compiles structural measurement data and vector data summaries for manufacturing handoffs.
 */
exports.generateTechPackData = async (req, res) => {
    const { designId } = req.params;
    const userId = req.user.id;

    try {
        const designQuery = await db.query(
            `SELECT id, title, sku, canvas_state, tech_pack_data, bill_of_materials, owner_id 
             FROM designs WHERE id = $1`, [designId]
        );

        if (designQuery.rows.length === 0) {
            return res.status(404).json({ message: "Workspace profile not located." });
        }

        const design = designQuery.rows[0];

        // Ensure user owns this sketch profile file
        if (design.owner_id !== userId) {
            return res.status(403).json({ message: "Access tracking restriction error." });
        }

        // Structural construction payload formatting
        const techPackPayload = {
            meta: {
                design_id: design.id,
                title: design.title,
                sku: design.sku || 'PENDING-GEN',
                compiled_at: new Date()
            },
            specifications: design.tech_pack_data || {},
            materials_inventory: design.bill_of_materials || []
        };

        res.status(200).json({ status: 'success', techPack: techPackPayload });
    } catch (err) {
        console.error("Tech Pack compilation exception:", err);
        res.status(500).json({ message: "Failed to assemble structural manufacturing configuration data." });
    }
};

/**
 * PUT /api/v1/workspace/ecommerce/designs/:designId/bom
 * Updates the Bill of Materials log panel to map zippers, lining fabric pricing, and thread costs.
 */
exports.updateBillOfMaterials = async (req, res) => {
    const { designId } = req.params;
    const { materialsArray } = req.body; // Array of material objects
    const userId = req.user.id;

    try {
        // Calculate dynamic cost sum
        const totalEstimatedCost = materialsArray.reduce((acc, current) => {
            const qty = parseFloat(current.quantity) || 0;
            const unitPrice = parseFloat(current.unit_cost) || 0;
            return acc + (qty * unitPrice);
        }, 0);

        const result = await db.query(
            `UPDATE designs
                SET bill_of_materials = $1,
                    total_estimated_production_cost = $2,
                    updated_at = NOW()
              WHERE id = $3 AND owner_id = $4
            RETURNING id, bill_of_materials, total_estimated_production_cost`,
            [JSON.stringify(materialsArray), totalEstimatedCost, designId, userId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ message: "Design profile target unlocated or modification unauthorized." });
        }

        res.status(200).json({ status: 'success', data: result.rows[0] });
    } catch (err) {
        console.error("BOM pipeline save error:", err);
        res.status(500).json({ message: "Failed to synchronize physical materials tracking rows." });
    }
};