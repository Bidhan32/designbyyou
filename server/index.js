require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');

// Import Routes
const authRoutes = require('./routes/authRoutes');
const superAdminRoutes = require('./routes/superAdminRoutes');
const designerRoutes = require('./routes/designerRoutes');
const creatorRoutes = require('./routes/creatorRoutes');
const creatorFinanceRoutes = require('./routes/creatorFinanceRoute');
const marketplaceRoutes = require('./routes/marketplaceRoutes');
const p2pBookingRoutes = require('./routes/p2pBookingRoutes');
const chatRoutes = require('./routes/chatRoutes');
const userRoutes = require('./routes/userRoutes');
const designRoutes = require('./routes/designRoutes');
const designerProfileRoutes = require('./routes/designerProfileRoute');
const designerFinanceRoutes = require('./routes/designerFinanceRoutes');
const showcaseRoutes = require('./routes/showcaseRoute');
const subscriptionRoutes = require('./routes/subscriptionRoute');
const publicRoutes = require('./routes/publicRoutes');
const webhookRoutes = require('./routes/webhookController');
const creatorshowcaseroute = require('./routes/creatorshowcaseroute')


// const adminRoutes = require('./routes/adminRoutes'); // Uncomment when file is created
// const designRoutes = require('./routes/designRoutes'); // Uncomment when file is created

const app = express();

// ---------------------------------------------------------
// 1. GLOBAL MIDDLEWARES
// ---------------------------------------------------------

// Security Headers
app.use(helmet());

// Cross-Origin Resource Sharing (Connects your Frontend)
app.use(cors({
    origin: process.env.CLIENT_URL || '*', // In production, replace * with your frontend domain
    credentials: true
}));

// Request Logger (Development mode)
if (process.env.NODE_ENV === 'development') {
    app.use(morgan('dev'));
}

app.use('/api/v1/webhooks', webhookRoutes);
app.use('/api/v1/subscriptions', subscriptionRoutes);

// Body Parsers (Increased limit for large Sketching JSON data)
app.use(express.json({ limit: '50mb' })); 
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// ---------------------------------------------------------
// 2. ROUTE MOUNTING
// ---------------------------------------------------------

// Health Check (For monitoring tools)
app.get('/health', (req, res) => {
    res.status(200).json({ status: 'UP', timestamp: new Date().toISOString() });
});

app.use('/api/v1/p2p-bookings', p2pBookingRoutes);
// Mount Auth Routes
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/superadmin', superAdminRoutes);
app.use('/api/v1/designer', designerRoutes);
app.use('/api/v1/users', userRoutes);
app.use('/api/v1/designer-finance', designerFinanceRoutes);
app.use('/api/v1/creators', creatorRoutes);
app.use('/api/v1/marketplace', marketplaceRoutes);
app.use('/api/v1/chat', chatRoutes);
app.use('/api/v1/workspace', designRoutes); // The Sketching Tool routes
app.use('/api/v1/all', publicRoutes);
app.use('/api/v1/creator-finance', creatorFinanceRoutes);
app.use('/api/v1/showcase', showcaseRoutes);
app.use('/api/v1/creator-showcase',creatorshowcaseroute);



app.use('/api/v1/designer-settings', designerProfileRoutes);


// Mount Admin Routes (Add these as you build the controllers)
// app.use('/api/v1/admin', adminRoutes);

// ---------------------------------------------------------
// 3. ERROR HANDLING (Global)
// ---------------------------------------------------------

// Handle 404 (Route not found)
app.use((req, res, next) => {
    res.status(404).json({
        status: 'fail',
        message: `Can't find ${req.originalUrl} on this server!`
    });
});

// Global Error Controller
app.use((err, req, res, next) => {
    err.statusCode = err.statusCode || 500;
    err.status = err.status || 'error';

    res.status(err.statusCode).json({
        status: err.status,
        message: err.message,
        stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
    });
});

// ---------------------------------------------------------
// 4. SERVER START
// ---------------------------------------------------------
const PORT = process.env.PORT || 8080;
const server = app.listen(PORT, () => {
    console.log(`
    🚀 DesignByYou Server Running!
    📡 Port: ${PORT}
    🌍 Environment: ${process.env.NODE_ENV || 'development'}
    `);
});

// Handle unhandled promise rejections (e.g. DB connection issues)
process.on('unhandledRejection', (err) => {
    console.log('UNHANDLED REJECTION! 💥 Shutting down...');
    console.log(err.name, err.message);
    server.close(() => {
        process.exit(1);
    });
});