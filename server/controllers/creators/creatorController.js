const crypto = require('crypto');
const db = require('../../config/db');

exports.uploadToCreatorMarketplace = async (req, res) => {
    // 1. Extract the text fields sent in the FormData
    const { title, editableType } = req.body;

    try {
        // 2. Ensure Multer and Cloudinary successfully processed the file
        if (!req.file || !req.file.path) {
            return res.status(400).json({ message: "A showcase preview graphic is required." });
        }
        if (!editableType) {
            return res.status(400).json({ message: "Editable design data is required." });
        }

        // Cloudinary automatically puts the secure URL right here
        const watermarked_preview_url = req.file.path; 

        // 3. Prepare Database Fields
        const safeTitle = title || 'Atelier Sketch';
        const sku = `CRT-SKE-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
        const slug = safeTitle.toLowerCase().trim().replace(/ /g, '-').replace(/[^\w-]+/g, '') + '-' + crypto.randomBytes(2).toString('hex');
        
        const normalizedProductType = 'sketch'; 
        const normalizedLicenseType = 'commercial'; 
        const normalizedStyleCategory = 'Streetwear'; 
        const processedTags = ['sketch', 'cad', 'apparel'];

        // Because we appended editableType via FormData using JSON.stringify on the frontend,
        // it arrives here as a string. We can pass it directly to the JSONB column.
        const canvasState = editableType;

        // 4. Database Insert
        const result = await db.query(
            `INSERT INTO designs (
                id, owner_id, title, sku, slug, description,
                base_price, canvas_state, style_category, tags, 
                product_type, license_type, watermarked_preview_url, high_res_file_url,
                is_public, is_published, created_at, updated_at
            ) VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NULL, true, true, NOW(), NOW()) 
            RETURNING id, title, slug, sku, watermarked_preview_url;`,
            [
                req.user.id, safeTitle, sku, slug, "Created in Studio CAD Engine",
                0, canvasState, normalizedStyleCategory, 
                processedTags, normalizedProductType, normalizedLicenseType,
                watermarked_preview_url
            ]
        );

        res.status(201).json({ 
            status: 'success', 
            message: "Portfolio asset successfully published to the Showcase!", 
            data: result.rows[0] 
        });
        
    } catch (error) {
        console.error("Creator Database Injection Error:", error);
        
        if (error.code === '23505') {
            return res.status(400).json({ message: "Upload rejected. A portfolio item with this exact configuration already exists." });
        }
        res.status(500).json({ message: "Portfolio upload failed. Check database constraints." });
    }
};