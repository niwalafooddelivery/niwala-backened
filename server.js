require('dotenv').config();
const express = require('express');
const cors = require('cors');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');

const connectDB = require('./config/db');
const setupSocket = require('./socket/socketHandler');
const User = require('./models/User');
const bcrypt = require('bcryptjs');

// Routes
const authRoutes = require('./routes/auth');
const adminRoutes = require('./routes/admin');
const restaurantRoutes = require('./routes/restaurant');
const customerRoutes = require('./routes/customer');
const riderRoutes = require('./routes/rider');
const uploadRoutes = require('./routes/upload');

// Init
const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST', 'PUT', 'DELETE'] },
});

// Make io accessible from routes
app.set('io', io);

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Static files (uploaded images)
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/restaurant', restaurantRoutes);
app.use('/api/customer', customerRoutes);
app.use('/api/rider', riderRoutes);
app.use('/api/upload', uploadRoutes);

// Health check
app.get('/', (req, res) => {
  res.json({
    success: true,
    name: 'Niwala Food Delivery API',
    version: '1.0.0',
    status: 'running',
    timestamp: new Date().toISOString(),
  });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Error:', err.message);
  res.status(500).json({ success: false, message: err.message });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ success: false, message: 'Route not found' });
});

// Setup socket
setupSocket(io);

// Start server
const PORT = process.env.PORT || 5000;

const startServer = async () => {
  try {
    await connectDB();

    // Create default admin if not exists
    const adminExists = await User.findOne({ role: 'admin' });
    if (!adminExists) {
      await User.create({
        name: 'Admin',
        email: process.env.ADMIN_EMAIL || 'admin@niwala.com',
        password: process.env.ADMIN_PASSWORD || 'admin123',
        phone: '0000000000',
        role: 'admin',
        approvalStatus: 'approved',
      });
      console.log('✅ Default admin created');
      console.log(`   Email: ${process.env.ADMIN_EMAIL || 'admin@niwala.com'}`);
      console.log(`   Password: ${process.env.ADMIN_PASSWORD || 'admin123'}`);
    }

    server.listen(PORT, () => {
      console.log(`\n🚀 Niwala Backend running on port ${PORT}`);
      console.log(`📡 API URL: http://localhost:${PORT}`);
      console.log(`🔌 Socket.IO ready\n`);
    });
  } catch (error) {
    console.error('Server start error:', error);
    process.exit(1);
  }
};

startServer();
