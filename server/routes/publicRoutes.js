const express = require('express');
const router = express.Router();
const db = require('../config/db'); // Your database pool configuration

router.get('/designers', async (req, res) => {
    try {
        // We perform an INNER JOIN to merge core identities with professional details
        const queryText = `
            SELECT 
                u.id,
                u.full_name,
                u.profile_image_url,
                dp.bio,
                dp.avg_rating
            FROM users u
            INNER JOIN designer_profiles dp ON u.id = dp.user_id
            WHERE u.role = $1 AND u.approval_status = $2
        `;

        // Filter for users who are 'designer' and are explicitly 'approved'
        // Note: Change 'approved' if your custom USER-DEFINED status string differs
        const targetDesigners = await db.query(queryText, ['designer', 'approved']);
        
        // Map database fields to the exact variable names your React component loops through
        const formattedDesigners = targetDesigners.rows.map(designer => ({
            id: designer.id,
            // Fallback to full_name + " Studio" since studio_name isn't a native schema column
            studio_name: designer.full_name ? `${designer.full_name} Studio` : "Independent Studio",
            // Fallback placeholder values to ensure the UI items map without errors
            specialty: "Visual Designer", 
            bio: designer.bio || "Custom streaming packages and premium digital production assets.",
            starting_price: "75.00" // Hardcoded template value since pricing isn't in your designer_profiles layout
        }));
        
        return res.status(200).json({
            status: "success",
            data: formattedDesigners
        });

    } catch (error) {
        // This will print the precise runtime error on your terminal backend console logs
        console.error("💥 Database Query Failed:", error.message);
        
        return res.status(500).json({ 
            status: "error",
            message: "Failed to compile public designer catalog matrix." 
        });
    }
});

router.get('/designers/:id', async (req, res) => {
    try {
        const designerId = req.params.id;

        // Query joining users data with their profile details
        const queryText = `
            SELECT 
                u.id,
                u.full_name,
                u.email,
                u.profile_image_url,
                dp.bio,
                dp.portfolio_url,
                dp.avg_rating,
                dp.total_completed_bookings
            FROM users u
            INNER JOIN designer_profiles dp ON u.id = dp.user_id
            WHERE u.id = $1 AND u.role = $2
        `;

        const result = await db.query(queryText, [designerId, 'designer']);

        // If no designer matches that ID, return a structural 404 response
        if (result.rows.length === 0) {
            return res.status(404).json({
                status: "fail",
                message: "No designer studio found matching that ID."
            });
        }

        const designer = result.rows[0];

        // Format the database properties to match what your React component is looking for
        const formattedStudio = {
            id: designer.id,
            studio_name: designer.full_name ? `${designer.full_name} Studio` : "Independent Studio",
            specialty: "Visual Designer",
            bio: designer.bio || "Custom streaming packages and premium digital production assets.",
            portfolio_url: designer.portfolio_url || "",
            profile_image_url: designer.profile_image_url,
            avg_rating: designer.avg_rating || "0.0",
            total_bookings: designer.total_completed_bookings || 0,
            starting_price: "75.00"
        };

        return res.status(200).json({
            status: "success",
            data: formattedStudio
        });

    } catch (error) {
        console.error("💥 Single Profile Query Failed:", error.message);
        return res.status(500).json({
            status: "error",
            message: "Internal server error fetching studio details."
        });
    }
});

module.exports = router;