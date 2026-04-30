const FoodItem = require('../models/FoodItem');
const Order = require('../models/Order');
const User = require('../models/User');

// @desc    Restaurant Dashboard
// @route   GET /api/restaurant/dashboard
exports.getDashboard = async (req, res) => {
  try {
    const restaurantId = req.user._id;
    const totalFoodItems = await FoodItem.countDocuments({ restaurantId });
    const totalOrders = await Order.countDocuments({ restaurantId });
    const pendingOrders = await Order.countDocuments({
      restaurantId,
      status: { $in: ['placed', 'accepted', 'preparing'] },
    });
    const completedOrders = await Order.countDocuments({ restaurantId, status: 'delivered' });

    const revenue = await Order.aggregate([
      { $match: { restaurantId: req.user._id, status: 'delivered' } },
      { $group: { _id: null, total: { $sum: '$totalAmount' } } },
    ]);

    res.json({
      success: true,
      stats: {
        totalFoodItems,
        totalOrders,
        pendingOrders,
        completedOrders,
        totalRevenue: revenue[0]?.total || 0,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Add food item
// @route   POST /api/restaurant/food
exports.addFoodItem = async (req, res) => {
  try {
    const { name, description, price, category, imageUrl } = req.body;
    if (!name || !price) return res.status(400).json({ success: false, message: 'Name and price required' });

    const food = await FoodItem.create({
      restaurantId: req.user._id,
      name, description, price, category, imageUrl,
    });

    res.status(201).json({ success: true, message: 'Food item added', food });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get my food items
// @route   GET /api/restaurant/food
exports.getMyFoodItems = async (req, res) => {
  try {
    const items = await FoodItem.find({ restaurantId: req.user._id }).sort({ createdAt: -1 });
    res.json({ success: true, count: items.length, items });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Update food item
// @route   PUT /api/restaurant/food/:id
exports.updateFoodItem = async (req, res) => {
  try {
    const item = await FoodItem.findById(req.params.id);
    if (!item) return res.status(404).json({ success: false, message: 'Not found' });
    if (item.restaurantId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, message: 'Not authorized' });
    }
    Object.assign(item, req.body);
    await item.save();
    res.json({ success: true, item });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Delete food item
// @route   DELETE /api/restaurant/food/:id
exports.deleteFoodItem = async (req, res) => {
  try {
    const item = await FoodItem.findById(req.params.id);
    if (!item) return res.status(404).json({ success: false, message: 'Not found' });
    if (item.restaurantId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, message: 'Not authorized' });
    }
    await item.deleteOne();
    res.json({ success: true, message: 'Deleted' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get restaurant orders
// @route   GET /api/restaurant/orders
exports.getRestaurantOrders = async (req, res) => {
  try {
    const orders = await Order.find({ restaurantId: req.user._id })
      .populate('customerId', 'name phone address')
      .populate('riderId', 'name phone')
      .sort({ createdAt: -1 });

    res.json({ success: true, count: orders.length, orders });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Update order status (accept, prepare, ready)
// @route   PUT /api/restaurant/orders/:id
exports.updateOrderStatus = async (req, res) => {
  try {
    const { status } = req.body;
    const allowed = ['accepted', 'preparing', 'ready', 'cancelled'];
    if (!allowed.includes(status)) {
      return res.status(400).json({ success: false, message: 'Invalid status' });
    }

    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });
    if (order.restaurantId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, message: 'Not authorized' });
    }

    order.status = status;
    await order.save();

    // Emit socket event
    const io = req.app.get('io');
    if (io) {
      io.to(`order_${order._id}`).emit('order_status_update', { orderId: order._id, status });
    }

    res.json({ success: true, order });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
