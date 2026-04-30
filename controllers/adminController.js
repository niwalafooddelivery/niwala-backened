const User = require('../models/User');
const Order = require('../models/Order');
const FoodItem = require('../models/FoodItem');

// @desc    Admin Dashboard Stats
// @route   GET /api/admin/dashboard
exports.getDashboardStats = async (req, res) => {
  try {
    const totalCustomers = await User.countDocuments({ role: 'customer' });
    const totalRiders = await User.countDocuments({ role: 'rider', approvalStatus: 'approved' });
    const totalRestaurants = await User.countDocuments({ role: 'restaurant', approvalStatus: 'approved' });
    const pendingApprovals = await User.countDocuments({
      role: { $in: ['rider', 'restaurant'] },
      approvalStatus: 'pending',
    });
    const totalOrders = await Order.countDocuments();
    const pendingOrders = await Order.countDocuments({ status: { $in: ['placed', 'accepted', 'preparing', 'ready', 'picked_up', 'on_the_way'] } });
    const completedOrders = await Order.countDocuments({ status: 'delivered' });

    const revenueData = await Order.aggregate([
      { $match: { status: 'delivered' } },
      { $group: { _id: null, total: { $sum: '$totalAmount' } } },
    ]);

    res.json({
      success: true,
      stats: {
        totalCustomers,
        totalRiders,
        totalRestaurants,
        pendingApprovals,
        totalOrders,
        pendingOrders,
        completedOrders,
        totalRevenue: revenueData[0]?.total || 0,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get all restaurants (with optional status filter)
// @route   GET /api/admin/restaurants
exports.getRestaurants = async (req, res) => {
  try {
    const { status } = req.query;
    const filter = { role: 'restaurant' };
    if (status) filter.approvalStatus = status;

    const restaurants = await User.find(filter).select('-password').sort({ createdAt: -1 });
    res.json({ success: true, count: restaurants.length, restaurants });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get all riders
// @route   GET /api/admin/riders
exports.getRiders = async (req, res) => {
  try {
    const { status } = req.query;
    const filter = { role: 'rider' };
    if (status) filter.approvalStatus = status;

    const riders = await User.find(filter).select('-password').sort({ createdAt: -1 });
    res.json({ success: true, count: riders.length, riders });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Approve or reject a user
// @route   PUT /api/admin/approve/:userId
exports.updateApproval = async (req, res) => {
  try {
    const { action } = req.body; // 'approve' or 'reject'
    const user = await User.findById(req.params.userId);

    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    user.approvalStatus = action === 'approve' ? 'approved' : 'rejected';
    await user.save();

    res.json({
      success: true,
      message: `${user.role} ${user.approvalStatus} successfully`,
      user: { _id: user._id, name: user.name, role: user.role, approvalStatus: user.approvalStatus },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Delete user
// @route   DELETE /api/admin/user/:userId
exports.deleteUser = async (req, res) => {
  try {
    const user = await User.findById(req.params.userId);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });
    if (user.role === 'admin') return res.status(403).json({ success: false, message: 'Cannot delete admin' });
    await user.deleteOne();
    res.json({ success: true, message: 'User deleted' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get all orders
// @route   GET /api/admin/orders
exports.getAllOrders = async (req, res) => {
  try {
    const { status } = req.query;
    const filter = {};
    if (status) filter.status = status;

    const orders = await Order.find(filter)
      .populate('customerId', 'name email phone')
      .populate('restaurantId', 'restaurantName name')
      .populate('riderId', 'name phone')
      .sort({ createdAt: -1 });

    res.json({ success: true, count: orders.length, orders });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
