const db = require('../config/db');

/**
 * 1. FETCH THE MASONRY GALLERY PIPELINE
 */
exports.getShowcasePipeline = async (req, res) => {
    try {
        // Fetch all published designs
        const result = await db.query(
            `SELECT d.*, 
                    u.id as designer_id, 
                    u.full_name as designer_name, 
                    u.profile_image_url as designer_avatar 
             FROM designs d
             JOIN users u ON d.owner_id = u.id
             WHERE d.is_published = true
             ORDER BY d.created_at DESC`
        );

        res.status(200).json({ status: 'success', data: result.rows });
    } catch (error) {
        console.error("Error fetching showcase pipeline:", error);
        res.status(500).json({ message: "Failed to retrieve the design archive." });
    }
};

/**
 * 2. FETCH SPECIFIC ASSET FOR THE CINEMATIC EXHIBITION PAGE
 */
exports.getAssetBySlug = async (req, res) => {
    try {
        const { slug } = req.params;
        
        const result = await db.query(
            `SELECT d.*, 
                    u.id as designer_id,
                    u.full_name as designer_name, 
                    u.profile_image_url as designer_avatar 
             FROM designs d
             JOIN users u ON d.owner_id = u.id
             WHERE d.slug = $1 AND d.is_published = true`,
            [slug]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ message: "Asset not found or is currently hidden in the archives." });
        }

        res.status(200).json({ status: 'success', data: result.rows[0] });
    } catch (error) {
        console.error("Error fetching exhibition asset by slug:", error);
        res.status(500).json({ message: "Failed to retrieve the masterpiece." });
    }
};