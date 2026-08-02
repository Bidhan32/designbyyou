const jwt = require('jsonwebtoken');

// 1. Verify if the user is logged in
exports.protect = async (req, res, next) => {
    let token;
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
        token = req.headers.authorization.split(' ')[1];
    }

    if (!token) {
        return res.status(401).json({ message: "Not authorized to access this route" });
    }

   try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = decoded; 
        next();
    } catch (err) {
        // ADD THIS LINE TO SEE THE EXACT JWT ERROR:
        console.log("JWT VERIFICATION FAILED:", err.message); 
        return res.status(401).json({ message: "Token is invalid or expired" });
    }
};

// 2. Restrict access based on specific roles
exports.authorize = (...roles) => {
    return (req, res, next) => {
        if (!roles.includes(req.user.role)) {
            return res.status(403).json({ 
                message: `User role '${req.user.role}' is not authorized to access this route` 
            });
        }
        next();
    };
};