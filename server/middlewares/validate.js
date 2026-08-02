const logger = require('../utils/logger');

const validate = (schema) => (req, res, next) => {
    try {
        // Automatically checks body, query, and params schemas if defined
        if (schema.body) req.body = schema.body.parse(req.body);
        if (schema.query) req.query = schema.query.parse(req.query);
        if (schema.params) req.params = schema.params.parse(req.params);
        return next();
    } catch (error) {
        logger.warn({ path: req.originalUrl, issues: error.errors }, 'Validation Payload Rejected');
        return res.status(400).json({
            status: 'fail',
            message: 'Invalid payload structure.',
            errors: error.errors.map(err => ({ field: err.path.join('.'), error: err.message }))
        });
    }
};

module.exports = validate;