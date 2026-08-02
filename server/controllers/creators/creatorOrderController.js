const db = require('../../config/db');

exports.getHistoryManifest = async (req, res) => {
    try {
        const buyerId = req.user.id;

        const historyQuery = await db.query(
            `SELECT o.id AS order_id, o.total_amount, o.created_at, o.payment_status,
                COALESCE(
                    JSON_AGG(
                        JSON_BUILD_OBJECT(
                            'order_item_id', oi.id,
                            'design_id', d.id,
                            'title', d.title,
                            'license_type', oi.license_type,
                            'watermarked_preview_url', d.watermarked_preview_url,
                            'source_file_url', CASE WHEN o.payment_status = 'succeeded' THEN d.high_res_file_url ELSE NULL END
                        )
                    ) FILTER (WHERE oi.id IS NOT NULL), '[]'
                ) AS items
             FROM orders o
             LEFT JOIN order_items oi ON o.id = oi.order_id
             LEFT JOIN designs d ON oi.design_id = d.id
             WHERE o.buyer_id = $1
             GROUP BY o.id
             ORDER BY o.created_at DESC`,
            [buyerId]
        );

        res.status(200).json({ status: 'success', data: historyQuery.rows });
    } catch (err) {
        console.error("SQL Creator History Pull Error:", err);
        res.status(500).json({ message: "Unable to sync digital asset records." });
    }
};