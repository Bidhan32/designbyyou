// controllers/designerPitchController.js
const db = require('../config/db');

/**
 * PITCH TO A CREATOR POST
 * Inserts a row into designer_pitches
 */
exports.submitPitch = async (req, res) => {
    const designer_id = req.user.id;
    const { post_id, pitch_text, bid_amount } = req.body;

    try {
        // Check if pitch already exists to prevent duplicates
        const existing = await db.query(
            `SELECT id FROM designer_pitches WHERE post_id = $1 AND designer_id = $2`,
            [post_id, designer_id]
        );

        if (existing.rows.length > 0) {
            return res.status(400).json({ message: "You have already pitched to this creator post." });
        }

        const result = await db.query(
            `INSERT INTO designer_pitches (
                id, post_id, designer_id, pitch_text, bid_amount, status, created_at
            ) VALUES (gen_random_uuid(), $1, $2, $3, $4, 'pending', NOW())
            RETURNING *`,
            [post_id, designer_id, pitch_text, bid_amount]
        );

        res.status(201).json({ status: 'success', data: result.rows[0] });
    } catch (err) {
        console.error("Submit Pitch Error:", err);
        res.status(500).json({ message: "Failed to submit your job pitch." });
    }
};

/**
 * GET MY PITCHES
 * Returns list of pitches submitted by this specific designer
 */
exports.getMyPitches = async (req, res) => {
    const designer_id = req.user.id;

    try {
        const result = await db.query(
            `SELECT p.*, cp.title as post_title, cp.budget_max 
             FROM designer_pitches p
             JOIN creator_posts cp ON p.post_id = cp.id
             WHERE p.designer_id = $1
             ORDER BY p.created_at DESC`,
            [designer_id]
        );

        res.status(200).json({ status: 'success', data: result.rows[0] });
    } catch (err) {
        console.error("Get My Pitches Error:", err);
        res.status(500).json({ message: "Failed to gather pitch logs." });
    }
};