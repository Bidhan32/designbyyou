const axios = require('axios');
const db = require('../config/db');

exports.transformSketchToApparel = async (req, res) => {
    try {
        const { designId } = req.params;
        const { prompt, sketchDataUrl } = req.body; // sketchDataUrl passes the base64 code string from Fabric.js
        const designerId = req.user.id;

        // 1. Double check access parameters to confirm ownership of the row
        const designCheck = await db.query(
            `SELECT id FROM designs WHERE id = $1 AND owner_id = $2`,
            [designId, designerId]
        );

        if (designCheck.rows.length === 0) {
            return res.status(403).json({ message: "Unauthorized access modification request." });
        }

        // 2. Dispatch the raw sketch vector lines to the Fal.ai ControlNet engine
        const aiResponse = await axios.post('https://queue.fal.run/fal-ai/controlnet/scribble', {
            image_url: sketchDataUrl,
            prompt: `${prompt}, premium clothing product photography, high fashion studio lighting, lookbook presentation material, crisp alignment, 8k resolution`,
            negative_prompt: "blurry, pixelated, deformed shapes, asymmetric sleeves, bad seams, drawing paper background, low resolution textures",
            guidance_scale: 7.5,
            controlnet_conditioning_scale: 0.9 // Keeps the generated garment matching the exact lines drawn by the designer
        }, {
            headers: {
                'Authorization': `Key ${process.env.FAL_KEY}`,
                'Content-Type': 'application/json'
            }
        });

        // Resolve query parameters to pull generated asset path
        const generatedGarmentUrl = aiResponse.data.images[0].url;

        // 3. Update database row records with the completed high-res production image link
        await db.query(
            `UPDATE designs 
             SET high_res_file_url = $1, updated_at = NOW() 
             WHERE id = $2`,
            [generatedGarmentUrl, designId]
        );

        res.status(200).json({
            status: 'success',
            message: "Apparel asset synthesized smoothly.",
            renderUrl: generatedGarmentUrl
        });

    } catch (err) {
        console.error("AI Sketch Synthesis Crash:", err.response?.data || err.message);
        res.status(500).json({ message: "The generation engine encountered an error rendering these sketch coordinates." });
    }
};