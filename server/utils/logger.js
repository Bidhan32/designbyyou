const pino = require('pino');

const logger = pino({
    level: process.env.LOG_LEVEL || 'info',
    base: { env: process.env.NODE_ENV || 'development' },
    timestamp: pino.stdTimeFunctions.isoTime
}, process.env.NODE_ENV !== 'production' ? pino.destination(1) : undefined); // standard output optimized

module.exports = logger;