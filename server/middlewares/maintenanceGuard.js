const pool = require('../db');

const maintenanceGuard = async (req, res, next) => {
    try {
        const settings = await pool.query(
            "SELECT value FROM system_settings WHERE key = 'maintenance_mode'"
        );
        
        // Fix: explicitly compare to the string 'true'
        const isMaintenance = settings.rows[0]?.value === 'true';

        if (isMaintenance) {
            if (req.user && req.user.role === 'superadmin') {
                return next();
            }
            return res.status(503).json({
                success: false,
                msg: "System Maintenance",
                description: "DesignByYou is currently undergoing a scheduled upgrade. We'll be back shortly with a better experience.",
                retry_after: "3600"
            });
        }

        next();
    } catch (err) {
        next();
    }
};


module.exports = maintenanceGuard;