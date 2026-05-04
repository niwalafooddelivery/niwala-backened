const FoodItem = require('../models/FoodItem');
const Order = require('../models/Order');
const User = require('../models/User');
const Message = require('../models/Message');

const RESTAURANT_ADMIN_COMMISSION_RATE = 0.05;
const RESTAURANT_NET_RATE = 1 - RESTAURANT_ADMIN_COMMISSION_RATE;

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
      {
        $group: {
          _id: null,
          total: {
            $sum: {
              $multiply: [
                {
                  $max: [
                    { $subtract: ['$totalAmount', { $ifNull: ['$deliveryCharge', 0] }] },
                    0,
                  ],
                },
                RESTAURANT_NET_RATE,
              ],
            },
          },
        },
      },
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
    console.log('--- Add Food Item Request ---');
    console.log('Body:', req.body);
    console.log('File:', req.file);

    const name = String(req.body.name || '').trim();
    const description = String(req.body.description || '').trim();
    const category = String(req.body.category || 'Main Course').trim() || 'Main Course';
    const numericPrice = Number(req.body.price);

    // Handle image upload
    let imageUrl = '';
    if (req.file) {
      imageUrl = `/uploads/${req.file.filename}`;
    }

    if (!name || req.body.price === undefined || req.body.price === null || String(req.body.price).trim() === '') {
      console.log('Validation Failed: name or price missing');
      return res.status(400).json({ success: false, message: 'Name and price required' });
    }
    if (!Number.isFinite(numericPrice) || numericPrice <= 0) {
      return res.status(400).json({ success: false, message: 'Valid price required' });
    }

    const food = await FoodItem.create({
      restaurantId: req.user._id,
      name,
      description,
      price: numericPrice,
      category,
      imageUrl,
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
    const orders = await Order.find({
      restaurantId: req.user._id,
      status: { $ne: 'cancelled' },
    })
      .populate('customerId', 'name phone address')
      .populate('restaurantId', 'restaurantName name address phone latitude longitude')
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

    const populatedOrder = await Order.findById(order._id)
      .populate('customerId', 'name phone address latitude longitude')
      .populate('restaurantId', 'restaurantName name address phone latitude longitude')
      .populate('riderId', 'name phone vehicleNumber currentLatitude currentLongitude');

    // Emit socket event
    const io = req.app.get('io');
    if (io) {
      io.to(`order_${order._id}`).emit('order_status_update', { orderId: order._id, status });
      if (status === 'accepted' && !order.riderId) {
        const riders = await User.find({
          role: 'rider',
          approvalStatus: 'approved',
          isOnline: true,
        }).select('_id');
        riders.forEach((rider) => {
          io.to(`rider_${rider._id}`).emit('new_order_available', populatedOrder);
        });
      }
    }

    res.json({ success: true, order: populatedOrder });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Restaurant/rider chat history
// @route   GET /api/restaurant/orders/:id/rider-messages
exports.getRiderMessages = async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order || order.restaurantId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, message: 'Not authorized' });
    }
    if (!order.riderId) {
      return res.status(403).json({ success: false, message: 'Chat opens after a rider accepts this order' });
    }
    const messages = await Message.find({
      orderId: req.params.id,
      conversationType: 'restaurant_rider',
    }).sort({ createdAt: 1 });
    res.json({ success: true, messages });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Restaurant sends message to rider
// @route   POST /api/restaurant/orders/:id/rider-messages
exports.sendRiderMessage = async (req, res) => {
  try {
    const message = String(req.body.message || '').trim();
    if (!message) return res.status(400).json({ success: false, message: 'Message required' });

    const order = await Order.findById(req.params.id);
    if (!order || order.restaurantId.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, message: 'Not authorized' });
    }
    if (!order.riderId) {
      return res.status(403).json({ success: false, message: 'Chat opens after a rider accepts this order' });
    }

    const isFirstMessage = await Message.countDocuments({
      orderId: req.params.id,
      conversationType: 'restaurant_rider',
    }) === 0;
    const msg = await Message.create({
      orderId: req.params.id,
      senderId: req.user._id,
      senderRole: 'restaurant',
      conversationType: 'restaurant_rider',
      message,
    });
    const payload = { ...msg.toObject(), firstMessage: isFirstMessage };
    const io = req.app.get('io');
    if (io) io.to(`order_${req.params.id}_restaurant_rider`).emit('new_restaurant_rider_message', payload);
    res.status(201).json({ success: true, message: payload, firstMessage: isFirstMessage });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
