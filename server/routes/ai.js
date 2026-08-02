const express = require('express');
const axios = require('axios');
const Fashn = require('fashn').default; // Official Fashn AI SDK
const router = express.Router();

// Initialize the Fashn Client
const fashnClient = new Fashn({ 
    apiKey: process.env.FASHN_API_KEY 
});

// ---------------------------------------------------------
// 🚀 1. TRIPO3D API: Generate 3D Model (.glb) from Sketch
// ---------------------------------------------------------
router.post('/generate-3d', async (req, res) => {
    try {
        const { base64Image } = req.body;
        if (!base64Image) return res.status(400).json({ error: "No image provided." });

        // Tripo3D requires the image to be hosted or passed as a Data URI.
        // For production, it's best to upload to an S3 bucket first, but Data URIs work for testing.
        const imageDataUri = base64Image.startsWith('data:image') 
            ? base64Image 
            : `data:image/png;base64,${base64Image}`;

        // 1. Submit the Image-to-3D Task
        const taskResponse = await axios.post('https://api.tripo3d.ai/v2/openapi/task', {
            type: "image_to_model",
            file: {
                type: "png",
                file_token: imageDataUri // Tripo accepts Data URIs or uploaded file tokens
            },
            model_version: "v3.1-20240919" // Latest Tripo engine
        }, {
            headers: {
                'Authorization': `Bearer ${process.env.TRIPO_API_KEY}`,
                'Content-Type': 'application/json'
            }
        });

        const taskId = taskResponse.data.data.task_id;

        // 2. Poll for Completion (Tripo is async, usually takes 10-15 seconds)
        let isComplete = false;
        let glbUrl = null;

        while (!isComplete) {
            await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds

            const statusResponse = await axios.get(`https://api.tripo3d.ai/v2/openapi/task/${taskId}`, {
                headers: { 'Authorization': `Bearer ${process.env.TRIPO_API_KEY}` }
            });

            const status = statusResponse.data.data.status;
            
            if (status === 'success') {
                isComplete = true;
                glbUrl = statusResponse.data.data.result.model.url;
            } else if (status === 'failed') {
                throw new Error("Tripo3D generation failed.");
            }
        }

        return res.status(200).json({ success: true, glbUrl });

    } catch (error) {
        console.error("Tripo3D API Error:", error?.response?.data || error.message);
        res.status(500).json({ success: false, error: "Failed to synthesize 3D garment." });
    }
});

// ---------------------------------------------------------
// 🚀 2. FASHN.AI API: Photorealistic Virtual Try-On
// ---------------------------------------------------------
router.post('/virtual-try-on', async (req, res) => {
    try {
        const { modelImageUrl, garmentBase64 } = req.body;

        if (!modelImageUrl || !garmentBase64) {
            return res.status(400).json({ error: "Missing model image or garment sketch." });
        }

        // Fashn requires hosted URLs or Data URIs.
        const garmentDataUri = garmentBase64.startsWith('data:image') 
            ? garmentBase64 
            : `data:image/png;base64,${garmentBase64}`;

        // Send to Fashn's 'tryon-max' flagship endpoint
        const response = await fashnClient.predictions.run({
            model_name: 'tryon-max', // Fashn's premium model
            inputs: {
                model_image: modelImageUrl,    // e.g., A photo of the user or a standard fashion model
                garment_image: garmentDataUri, // The 2D sketch from your canvas
                category: 'tops',              // Auto-detects, but 'tops', 'bottoms', or 'dresses' helps
                nsfw_filter: true
            }
        });

        // The API returns the generated editorial image URL
        const tryOnImageUrl = response.output[0];

        return res.status(200).json({ 
            success: true, 
            tryOnImageUrl 
        });

    } catch (error) {
        console.error("Fashn.ai API Error:", error.message);
        res.status(500).json({ success: false, error: "Failed to generate virtual try-on." });
    }
});

module.exports = router;