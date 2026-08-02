const db = require('../config/db');

/**
 * 1. Send Message with Security Check
 * Safely manages transaction lifecycles through isolated client sockets.
 */
exports.sendMessage = async (req, res) => {
    const { room_id, content } = req.body;
    const sender_id = req.user.id;
    
    // Check if a file was uploaded via Cloudinary
    const file_url = req.file ? req.file.path : null;

    // Allocate isolated pooling thread client
    const client = await db.connect();

    try {
        // SECURITY: Ensure the user belongs to this room
        const roomCheck = await client.query(
            'SELECT id FROM chat_rooms WHERE id = $1 AND (creator_id = $2 OR designer_id = $2)',
            [room_id, sender_id]
        );

        if (roomCheck.rows.length === 0) {
            return res.status(403).json({ message: "You are not authorized to message in this room." });
        }

        await client.query('BEGIN');

        // CRITICAL DATABASE FIX: Added explicit id field and gen_random_uuid() to prevent insertion crashes
        const newMessage = await client.query(
            `INSERT INTO messages (id, room_id, sender_id, content, file_url, is_read, created_at)
             VALUES (gen_random_uuid(), $1, $2, $3, $4, false, NOW()) RETURNING *`,
            [room_id, sender_id, content, file_url]
        );

        await client.query(
            `UPDATE chat_rooms SET last_message_at = NOW() WHERE id = $1`,
            [room_id]
        );

        await client.query('COMMIT');
        res.status(201).json({ status: 'success', data: newMessage.rows[0] });
    } catch (error) {
        await client.query('ROLLBACK');
        console.error("Send Message Operational Error:", error);
        res.status(500).json({ message: "Failed to send message." });
    } finally {
        client.release(); // Free up database socket connection thread
    }
};

/**
 * 2. Get Chat History with Security Check
 * Pulls sorted chronological logs alongside metadata avatars.
 */
exports.getChatHistory = async (req, res) => {
    const { roomId } = req.params;
    const userId = req.user.id;

    try {
        // SECURITY: Ensure the user belongs to this room
        const roomCheck = await db.query(
            'SELECT id FROM chat_rooms WHERE id = $1 AND (creator_id = $2 OR designer_id = $2)',
            [roomId, userId]
        );

        if (roomCheck.rows.length === 0) {
            return res.status(403).json({ message: "Access denied." });
        }

        const messages = await db.query(
            `SELECT m.*, u.full_name as sender_name, u.profile_image_url as sender_avatar
             FROM messages m
             JOIN users u ON m.sender_id = u.id
             WHERE m.room_id = $1
             ORDER BY m.created_at ASC`,
            [roomId]
        );
        res.status(200).json({ status: 'success', data: messages.rows });
    } catch (error) {
        console.error("Get Chat History Error:", error);
        res.status(500).json({ message: "Error loading chat history." });
    }
};

/**
 * 3. Get My Active Chat Rooms (Includes the "Other" person's info)
 * Sorts active threads by latest interaction metrics.
 */
exports.getMyRooms = async (req, res) => {
    try {
        const rooms = await db.query(
            `SELECT cr.*, 
                    u_creator.full_name as creator_name, u_creator.profile_image_url as creator_avatar,
                    u_designer.full_name as designer_name, u_designer.profile_image_url as designer_avatar
             FROM chat_rooms cr
             JOIN users u_creator ON cr.creator_id = u_creator.id
             JOIN users u_designer ON cr.designer_id = u_designer.id
             WHERE cr.creator_id = $1 OR cr.designer_id = $1
             ORDER BY cr.last_message_at DESC`,
            [req.user.id]
        );
        res.status(200).json({ status: 'success', data: rooms.rows });
    } catch (error) {
        console.error("Get My Rooms Error:", error);
        res.status(500).json({ message: "Error loading chat rooms." });
    }
};

/**
 * 4. Create Or Get Chat Room Instance
 * Initializes real-time channels or recovers prior instances safely.
 */
exports.createOrGetRoom = async (req, res) => {
    const { designer_id } = req.body;
    const creator_id = req.user.id;

    try {
        // Check if a room already exists between these two
        let room = await db.query(
            'SELECT * FROM chat_rooms WHERE creator_id = $1 AND designer_id = $2',
            [creator_id, designer_id]
        );

        if (room.rows.length === 0) {
            // CRITICAL DATABASE FIX: Added explicit id field and gen_random_uuid() to prevent configuration validation crashes
            room = await db.query(
                `INSERT INTO chat_rooms (id, creator_id, designer_id, last_message_at) 
                 VALUES (gen_random_uuid(), $1, $2, NOW()) RETURNING *`,
                [creator_id, designer_id]
            );
        }

        res.status(200).json({ status: 'success', data: room.rows[0] });
    } catch (error) {
        console.error("Create or Get Room Configuration Failure:", error);
        res.status(500).json({ message: "Could not initialize chat room." });
    }
};