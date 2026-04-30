const User = require('../models/User');
const FoodItem = require('../models/FoodItem');
const Order = require('../models/Order');
const Message = require('../models/Message');

// Calculate distance between two coords (Haversine formula) in km
const getDistance = (lat1, lon1, lat2, lon2) => {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

// @desc    Get nearby restaurants (location based)
// @route   GET /api/customer/restaurants?lat=&lng=&radius=
exports.getNearbyRestaurants = async (req, res) => {
  try {
    const { lat, lng, radius = 50 } = req.query;
    const restaurants = await User.find({
      role: 'restaurant',
      approvalStatus: 'approved',
    }).select('restaurantName name latitude longitude address cuisineType restaurantImage phone');

    let filtered = restaurants;
    if (lat && lng) {
      filtered = restaurants
        .map(r => ({
          ...r.toObject(),
          distance: getDistance(parseFloat(lat), parseFloat(lng), r.latitude, r.longitude),
        }))
        .filter(r => r.distance <= parseFloat(radius))
        .sort((a, b) => a.distance - b.distance);
    }

    res.json({ success: true, count: filtered.length, restaurants: filtered });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get food items of a restaurant
// @route   GET /api/customer/restaurant/:id/menu
exports.getRestaurantMenu = async (req, res) => {
  try {
    const restaurant = await User.findById(req.params.id).select('restaurantName name address phone cuisineType restaurantImage');
    if (!restaurant) return res.status(404).json({ success: false, message: 'Restaurant not found' });

    const menu = await FoodItem.find({ restaurantId: req.params.id, isAvailable: true });
    res.json({ success: true, restaurant, menu });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Place order
// @route   POST /api/customer/order
exports.placeOrder = async (req, res) => {
  try {
    const { restaurantId, items, deliveryAddress, customerLatitude, customerLongitude, paymentMethod, notes } = req.body;
    if (!restaurantId || !items || items.length === 0) {
      return res.status(400).json({ success: false, message: 'Restaurant and items required' });
    }

    const totalAmount = items.reduce((sum, item) => sum + (item.price * item.quantity), 0);

    const order = await Order.create({
      customerId: req.user._id,
      restaurantId,
      items,
      totalAmount,
      deliveryAddress: deliveryAddress || req.user.address,
      customerLatitude: customerLatitude || req.user.latitude,
      customerLongitude: customerLongitude || req.user.longitude,
      paymentMethod: paymentMethod || 'cash',
      notes: notes || '',
    });

    // Auto-assign first available rider (simple logic - in production: smarter dispatch)
    const availableRider = await User.findOne({
      role: 'rider',
      approvalStatus: 'approved',
      isOnline: true,
    });
    if (availableRider) {
      order.riderId = availableRider._id;
      await order.save();
    }

    // Notify via socket
    const io = req.app.get('io');
    if (io) {
      io.to(`restaurant_${restaurantId}`).emit('new_order', order);
      if (availableRider) io.to(`rider_${availableRider._id}`).emit('new_order_assigned', order);
    }

    res.status(201).json({ success: true, message: 'Order placed', order });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get my orders
// @route   GET /api/customer/orders
exports.getMyOrders = async (req, res) => {
  try {
    const orders = await Order.find({ customerId: req.user._id })
      .populate('restaurantId', 'restaurantName name address')
      .populate('riderId', 'name phone vehicleNumber currentLatitude currentLongitude')
      .sort({ createdAt: -1 });
    res.json({ success: true, count: orders.length, orders });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get order details with rider live location
// @route   GET /api/customer/order/:id
exports.getOrderDetails = async (req, res) => {
  try {
    const order = await Order.findById(req.params.id)
      .populate('restaurantId', 'restaurantName name address phone latitude longitude')
      .populate('riderId', 'name phone vehicleNumber currentLatitude currentLongitude');

    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });
    if (order.customerId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, message: 'Not authorized' });
    }
    res.json({ success: true, order });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get chat messages for an order
// @route   GET /api/customer/order/:id/messages
exports.getOrderMessages = async (req, res) => {
  try {
    const messages = await Message.find({ orderId: req.params.id }).sort({ createdAt: 1 });
    res.json({ success: true, count: messages.length, messages });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Send chat message
// @route   POST /api/customer/order/:id/messages
exports.sendMessage = async (req, res) => {
  try {
    const { message } = req.body;
    if (!message) return res.status(400).json({ success: false, message: 'Message required' });

    const msg = await Message.create({
      orderId: req.params.id,
      senderId: req.user._id,
      senderRole: req.user.role,
      message,
    });

    const io = req.app.get('io');
    if (io) io.to(`order_${req.params.id}`).emit('new_message', msg);

    res.status(201).json({ success: true, message: msg });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
