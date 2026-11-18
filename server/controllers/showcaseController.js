const db = require('../config/db');

const visibleDesigns = `SELECT d.id, d.slug, d.title, d.description, d.style_category,
    d.tags, d.watermarked_preview_url, d.created_at, d.is_public, d.is_published,
    u.id AS owner_id, u.role AS owner_role,
    CASE WHEN u.role = 'designer' THEN u.id END AS designer_id,
    u.full_name AS designer_name, u.profile_image_url AS designer_avatar
  FROM designs d JOIN users u ON d.owner_id = u.id
  WHERE d.is_public AND d.is_published
    AND (u.role = 'creator' OR (u.role = 'designer' AND u.approval_status = 'approved'))`;

/**
 * 1. FETCH THE MASONRY GALLERY PIPELINE
 */
exports.getShowcasePipeline = async (req, res) => {
    try {
        // Fetch all published designs
        const result = await db.query(
            `${visibleDesigns}
             AND ($1::text IS NULL OR (u.role = 'designer' AND u.id::text = $1))
             ORDER BY d.created_at DESC`,
            [req.query.designer_id ?? null]
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
            `${visibleDesigns} AND d.slug = $1`,
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
