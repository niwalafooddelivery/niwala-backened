const Order = require('../models/Order');
const User = require('../models/User');
const Message = require('../models/Message');

// @desc    Rider Dashboard
// @route   GET /api/rider/dashboard
exports.getDashboard = async (req, res) => {
  try {
    const riderId = req.user._id;
    const totalDeliveries = await Order.countDocuments({ riderId, status: 'delivered' });
    const activeOrder = await Order.findOne({
      riderId,
      status: { $in: ['accepted', 'preparing', 'ready', 'picked_up', 'on_the_way'] },
    });
    const incomingOrders = await Order.countDocuments({
      riderId,
      status: { $in: ['ready'] },
    });

    const earnings = await Order.aggregate([
      { $match: { riderId: req.user._id, status: 'delivered' } },
      { $group: { _id: null, total: { $sum: '$totalAmount' } } },
    ]);

    res.json({
      success: true,
      stats: {
        totalDeliveries,
        hasActiveOrder: !!activeOrder,
        activeOrderId: activeOrder?._id,
        incomingOrders,
        totalEarnings: (earnings[0]?.total || 0) * 0.15, // assuming 15% rider commission
        isOnline: req.user.isOnline,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Toggle online status
// @route   PUT /api/rider/online
exports.toggleOnline = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    user.isOnline = !user.isOnline;
    await user.save();
    res.json({ success: true, isOnline: user.isOnline });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get incoming orders (assigned to me)
// @route   GET /api/rider/orders/incoming
exports.getIncomingOrders = async (req, res) => {
  try {
    const orders = await Order.find({
      riderId: req.user._id,
      status: { $in: ['ready', 'preparing', 'accepted'] },
    })
      .populate('restaurantId', 'restaurantName name address latitude longitude phone')
      .sort({ createdAt: -1 });

    // Hide customer personal info - only show delivery address & coords
    const sanitized = orders.map(o => {
      const obj = o.toObject();
      delete obj.customerId; // hide customer ID
      return obj;
    });

    res.json({ success: true, count: sanitized.length, orders: sanitized });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get my active order
// @route   GET /api/rider/orders/active
exports.getActiveOrder = async (req, res) => {
  try {
    const order = await Order.findOne({
      riderId: req.user._id,
      status: { $in: ['picked_up', 'on_the_way'] },
    }).populate('restaurantId', 'restaurantName name address latitude longitude phone');

    if (!order) return res.json({ success: true, order: null });

    // Hide customer info - only show delivery point
    const obj = order.toObject();
    delete obj.customerId;
    res.json({ success: true, order: obj });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get order history
// @route   GET /api/rider/orders/history
exports.getOrderHistory = async (req, res) => {
  try {
    const orders = await Order.find({
      riderId: req.user._id,
      status: { $in: ['delivered', 'cancelled'] },
    })
      .populate('restaurantId', 'restaurantName name address')
      .sort({ updatedAt: -1 })
      .limit(50);

    const sanitized = orders.map(o => {
      const obj = o.toObject();
      delete obj.customerId;
      return obj;
    });

    res.json({ success: true, count: sanitized.length, orders: sanitized });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get specific order details (for tracking screen)
// @route   GET /api/rider/order/:id
exports.getOrderDetails = async (req, res) => {
  try {
    const order = await Order.findById(req.params.id)
      .populate('restaurantId', 'restaurantName name address latitude longitude phone');
    if (!order) return res.status(404).json({ success: false, message: 'Not found' });
    if (order.riderId?.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, message: 'Not authorized' });
    }
    const obj = order.toObject();
    delete obj.customerId; // privacy
    res.json({ success: true, order: obj });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Update order status (pick up, deliver)
// @route   PUT /api/rider/order/:id/status
exports.updateOrderStatus = async (req, res) => {
  try {
    const { status } = req.body;
    const allowed = ['picked_up', 'on_the_way', 'delivered'];
    if (!allowed.includes(status)) {
      return res.status(400).json({ success: false, message: 'Invalid status' });
    }

    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });
    if (order.riderId?.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, message: 'Not authorized' });
    }

    order.status = status;
    if (status === 'delivered') order.paymentStatus = 'paid';
    await order.save();

    const io = req.app.get('io');
    if (io) io.to(`order_${order._id}`).emit('order_status_update', { orderId: order._id, status });

    res.json({ success: true, order });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Update rider live location (called every few seconds)
// @route   PUT /api/rider/location
exports.updateLocation = async (req, res) => {
  try {
    const { latitude, longitude, orderId } = req.body;
    const rider = await User.findById(req.user._id);
    rider.currentLatitude = latitude;
    rider.currentLongitude = longitude;
    await rider.save();

    if (orderId) {
      const order = await Order.findById(orderId);
      if (order && order.riderId?.toString() === req.user._id.toString()) {
        order.riderCurrentLat = latitude;
        order.riderCurrentLng = longitude;
        await order.save();

        const io = req.app.get('io');
        if (io) {
          io.to(`order_${orderId}`).emit('rider_location_update', {
            orderId, latitude, longitude,
          });
        }
      }
    }

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Send chat message (rider to customer)
// @route   POST /api/rider/order/:id/messages
exports.sendMessage = async (req, res) => {
  try {
    const { message } = req.body;
    const msg = await Message.create({
      orderId: req.params.id,
      senderId: req.user._id,
      senderRole: 'rider',
      message,
    });
    const io = req.app.get('io');
    if (io) io.to(`order_${req.params.id}`).emit('new_message', msg);
    res.status(201).json({ success: true, message: msg });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get chat messages
// @route   GET /api/rider/order/:id/messages
exports.getMessages = async (req, res) => {
  try {
    const messages = await Message.find({ orderId: req.params.id }).sort({ createdAt: 1 });
    res.json({ success: true, messages });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
