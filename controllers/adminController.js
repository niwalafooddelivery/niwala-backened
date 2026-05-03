const User = require('../models/User');
const Order = require('../models/Order');
const FoodItem = require('../models/FoodItem');

const RIDER_DELIVERY_FEE = 100;
const RIDER_ADMIN_COMMISSION_RATE = 0.03;
const RESTAURANT_ADMIN_COMMISSION_RATE = 0.05;
const RIDER_NET_RATE = 1 - RIDER_ADMIN_COMMISSION_RATE;
const RESTAURANT_NET_RATE = 1 - RESTAURANT_ADMIN_COMMISSION_RATE;
const ACTIVE_ORDER_STATUSES = ['accepted', 'preparing', 'ready', 'picked_up', 'on_the_way'];

const getTodayRange = () => {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { start, end };
};

const mapById = (rows) => {
  const map = {};
  rows.forEach((row) => {
    map[row._id?.toString()] = row;
  });
  return map;
};

const restaurantGrossExpression = {
  $max: [
    { $subtract: ['$totalAmount', { $ifNull: ['$deliveryCharge', 0] }] },
    0,
  ],
};

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
    const riderEarningsData = await Order.aggregate([
      { $match: { status: 'delivered', riderId: { $ne: null } } },
      {
        $group: {
          _id: null,
          total: {
            $sum: {
              $multiply: [
                { $ifNull: ['$deliveryCharge', RIDER_DELIVERY_FEE] },
                RIDER_NET_RATE,
              ],
            },
          },
        },
      },
    ]);
    const restaurantEarningsData = await Order.aggregate([
      { $match: { status: 'delivered' } },
      {
        $addFields: {
          restaurantEarning: { $multiply: [restaurantGrossExpression, RESTAURANT_NET_RATE] },
        },
      },
      { $group: { _id: null, total: { $sum: '$restaurantEarning' } } },
    ]);
    const adminEarningsData = await Order.aggregate([
      { $match: { status: 'delivered' } },
      {
        $addFields: {
          riderCommission: {
            $cond: [
              { $ne: ['$riderId', null] },
              {
                $multiply: [
                  { $ifNull: ['$deliveryCharge', RIDER_DELIVERY_FEE] },
                  RIDER_ADMIN_COMMISSION_RATE,
                ],
              },
              0,
            ],
          },
          restaurantCommission: {
            $multiply: [restaurantGrossExpression, RESTAURANT_ADMIN_COMMISSION_RATE],
          },
        },
      },
      {
        $group: {
          _id: null,
          riderCommission: { $sum: '$riderCommission' },
          restaurantCommission: { $sum: '$restaurantCommission' },
        },
      },
    ]);
    const adminRiderCommission = adminEarningsData[0]?.riderCommission || 0;
    const adminRestaurantCommission = adminEarningsData[0]?.restaurantCommission || 0;

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
        riderEarnings: riderEarningsData[0]?.total || 0,
        restaurantEarnings: restaurantEarningsData[0]?.total || 0,
        adminEarnings: adminRiderCommission + adminRestaurantCommission,
        adminRiderCommission,
        adminRestaurantCommission,
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
    const ids = restaurants.map(r => r._id);
    const { start, end } = getTodayRange();
    const weekStart = new Date(start);
    weekStart.setDate(weekStart.getDate() - 6);
    const monthStart = new Date(start.getFullYear(), start.getMonth(), 1);

    const earningRows = ids.length ? await Order.aggregate([
      { $match: { restaurantId: { $in: ids }, status: 'delivered' } },
      {
        $addFields: {
          earningDate: { $ifNull: ['$deliveryConfirmedAt', '$updatedAt'] },
          restaurantGross: restaurantGrossExpression,
          restaurantEarning: { $multiply: [restaurantGrossExpression, RESTAURANT_NET_RATE] },
          adminCommission: { $multiply: [restaurantGrossExpression, RESTAURANT_ADMIN_COMMISSION_RATE] },
        },
      },
      {
        $group: {
          _id: '$restaurantId',
          totalSessions: { $sum: 1 },
          totalEarnings: { $sum: '$restaurantEarning' },
          adminCommission: { $sum: '$adminCommission' },
          todaySessions: {
            $sum: {
              $cond: [
                { $and: [{ $gte: ['$earningDate', start] }, { $lt: ['$earningDate', end] }] },
                1,
                0,
              ],
            },
          },
          todayEarnings: {
            $sum: {
              $cond: [
                { $and: [{ $gte: ['$earningDate', start] }, { $lt: ['$earningDate', end] }] },
                '$restaurantEarning',
                0,
              ],
            },
          },
          weekSessions: {
            $sum: {
              $cond: [
                { $and: [{ $gte: ['$earningDate', weekStart] }, { $lt: ['$earningDate', end] }] },
                1,
                0,
              ],
            },
          },
          weekEarnings: {
            $sum: {
              $cond: [
                { $and: [{ $gte: ['$earningDate', weekStart] }, { $lt: ['$earningDate', end] }] },
                '$restaurantEarning',
                0,
              ],
            },
          },
          monthSessions: {
            $sum: {
              $cond: [
                { $and: [{ $gte: ['$earningDate', monthStart] }, { $lt: ['$earningDate', end] }] },
                1,
                0,
              ],
            },
          },
          monthEarnings: {
            $sum: {
              $cond: [
                { $and: [{ $gte: ['$earningDate', monthStart] }, { $lt: ['$earningDate', end] }] },
                '$restaurantEarning',
                0,
              ],
            },
          },
        },
      },
    ]) : [];

    const orderRows = ids.length ? await Order.aggregate([
      { $match: { restaurantId: { $in: ids } } },
      {
        $group: {
          _id: '$restaurantId',
          totalOrders: { $sum: 1 },
          deliveredOrders: {
            $sum: { $cond: [{ $eq: ['$status', 'delivered'] }, 1, 0] },
          },
          cancelledOrders: {
            $sum: { $cond: [{ $eq: ['$status', 'cancelled'] }, 1, 0] },
          },
          pendingOrders: {
            $sum: { $cond: [{ $in: ['$status', ACTIVE_ORDER_STATUSES] }, 1, 0] },
          },
        },
      },
    ]) : [];

    const activeRows = ids.length ? await Order.aggregate([
      { $match: { restaurantId: { $in: ids }, status: { $in: ACTIVE_ORDER_STATUSES } } },
      { $group: { _id: '$restaurantId', activeOrders: { $sum: 1 } } },
    ]) : [];

    const recentRows = ids.length ? await Order.find({
      restaurantId: { $in: ids },
      status: 'delivered',
    })
      .populate('riderId', 'name phone')
      .sort({ deliveryConfirmedAt: -1, updatedAt: -1 })
      .limit(ids.length * 5)
      .lean() : [];

    const earningMap = mapById(earningRows);
    const orderMap = mapById(orderRows);
    const activeMap = mapById(activeRows);
    const recentMap = {};
    recentRows.forEach((order) => {
      const restaurantId = order.restaurantId?.toString();
      if (!restaurantId) return;
      if (!recentMap[restaurantId]) recentMap[restaurantId] = [];
      if (recentMap[restaurantId].length >= 5) return;
      recentMap[restaurantId].push({
        id: order._id,
        riderName: order.riderId?.name || 'Rider',
        deliveredAt: order.deliveryConfirmedAt || order.updatedAt,
        totalAmount: order.totalAmount || 0,
        restaurantGross: Math.max((order.totalAmount || 0) - (order.deliveryCharge || 0), 0),
        adminCommission: Math.max((order.totalAmount || 0) - (order.deliveryCharge || 0), 0) * RESTAURANT_ADMIN_COMMISSION_RATE,
        restaurantEarning: Math.max((order.totalAmount || 0) - (order.deliveryCharge || 0), 0) * RESTAURANT_NET_RATE,
      });
    });

    const restaurantsWithStats = restaurants.map((restaurant) => {
      const obj = restaurant.toObject();
      const earnings = earningMap[restaurant._id.toString()] || {};
      const orderStats = orderMap[restaurant._id.toString()] || {};
      const active = activeMap[restaurant._id.toString()] || {};
      obj.earningSession = {
        todayEarnings: earnings.todayEarnings || 0,
        todaySessions: earnings.todaySessions || 0,
        weekEarnings: earnings.weekEarnings || 0,
        weekSessions: earnings.weekSessions || 0,
        monthEarnings: earnings.monthEarnings || 0,
        monthSessions: earnings.monthSessions || 0,
        totalEarnings: earnings.totalEarnings || 0,
        adminCommission: earnings.adminCommission || 0,
        totalSessions: earnings.totalSessions || 0,
        totalOrders: orderStats.totalOrders || 0,
        deliveredOrders: orderStats.deliveredOrders || 0,
        cancelledOrders: orderStats.cancelledOrders || 0,
        pendingOrders: orderStats.pendingOrders || 0,
        activeOrders: active.activeOrders || 0,
        recentDeliveries: recentMap[restaurant._id.toString()] || [],
      };
      return obj;
    });

    res.json({ success: true, count: restaurantsWithStats.length, restaurants: restaurantsWithStats });
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
    const ids = riders.map(r => r._id);
    const { start, end } = getTodayRange();
    const weekStart = new Date(start);
    weekStart.setDate(weekStart.getDate() - 6);
    const monthStart = new Date(start.getFullYear(), start.getMonth(), 1);

    const earningRows = ids.length ? await Order.aggregate([
      { $match: { riderId: { $in: ids }, status: 'delivered' } },
      {
        $addFields: {
          earningDate: { $ifNull: ['$deliveryConfirmedAt', '$updatedAt'] },
          riderGross: { $ifNull: ['$deliveryCharge', RIDER_DELIVERY_FEE] },
          riderEarning: {
            $multiply: [
              { $ifNull: ['$deliveryCharge', RIDER_DELIVERY_FEE] },
              RIDER_NET_RATE,
            ],
          },
          adminCommission: {
            $multiply: [
              { $ifNull: ['$deliveryCharge', RIDER_DELIVERY_FEE] },
              RIDER_ADMIN_COMMISSION_RATE,
            ],
          },
        },
      },
      {
        $group: {
          _id: '$riderId',
          totalSessions: { $sum: 1 },
          totalEarnings: { $sum: '$riderEarning' },
          adminCommission: { $sum: '$adminCommission' },
          todaySessions: {
            $sum: {
              $cond: [
                { $and: [{ $gte: ['$earningDate', start] }, { $lt: ['$earningDate', end] }] },
                1,
                0,
              ],
            },
          },
          todayEarnings: {
            $sum: {
              $cond: [
                { $and: [{ $gte: ['$earningDate', start] }, { $lt: ['$earningDate', end] }] },
                '$riderEarning',
                0,
              ],
            },
          },
          weekSessions: {
            $sum: {
              $cond: [
                { $and: [{ $gte: ['$earningDate', weekStart] }, { $lt: ['$earningDate', end] }] },
                1,
                0,
              ],
            },
          },
          weekEarnings: {
            $sum: {
              $cond: [
                { $and: [{ $gte: ['$earningDate', weekStart] }, { $lt: ['$earningDate', end] }] },
                '$riderEarning',
                0,
              ],
            },
          },
          monthSessions: {
            $sum: {
              $cond: [
                { $and: [{ $gte: ['$earningDate', monthStart] }, { $lt: ['$earningDate', end] }] },
                1,
                0,
              ],
            },
          },
          monthEarnings: {
            $sum: {
              $cond: [
                { $and: [{ $gte: ['$earningDate', monthStart] }, { $lt: ['$earningDate', end] }] },
                '$riderEarning',
                0,
              ],
            },
          },
        },
      },
    ]) : [];

    const orderRows = ids.length ? await Order.aggregate([
      { $match: { riderId: { $in: ids } } },
      {
        $group: {
          _id: '$riderId',
          assignedOrders: { $sum: 1 },
          cancelledOrders: {
            $sum: { $cond: [{ $eq: ['$status', 'cancelled'] }, 1, 0] },
          },
          pendingOrders: {
            $sum: { $cond: [{ $in: ['$status', ACTIVE_ORDER_STATUSES] }, 1, 0] },
          },
        },
      },
    ]) : [];

    const activeRows = ids.length ? await Order.aggregate([
      { $match: { riderId: { $in: ids }, status: { $in: ACTIVE_ORDER_STATUSES } } },
      { $group: { _id: '$riderId', activeOrders: { $sum: 1 } } },
    ]) : [];

    const recentRows = ids.length ? await Order.find({
      riderId: { $in: ids },
      status: 'delivered',
    })
      .populate('restaurantId', 'restaurantName name')
      .sort({ deliveryConfirmedAt: -1, updatedAt: -1 })
      .limit(ids.length * 5)
      .lean() : [];

    const earningMap = mapById(earningRows);
    const orderMap = mapById(orderRows);
    const activeMap = mapById(activeRows);
    const recentMap = {};
    recentRows.forEach((order) => {
      const riderId = order.riderId?.toString();
      if (!riderId) return;
      if (!recentMap[riderId]) recentMap[riderId] = [];
      if (recentMap[riderId].length >= 5) return;
      recentMap[riderId].push({
        id: order._id,
        restaurantName: order.restaurantId?.restaurantName || order.restaurantId?.name || 'Restaurant',
        deliveredAt: order.deliveryConfirmedAt || order.updatedAt,
        totalAmount: order.totalAmount || 0,
        riderGross: order.deliveryCharge || RIDER_DELIVERY_FEE,
        adminCommission: (order.deliveryCharge || RIDER_DELIVERY_FEE) * RIDER_ADMIN_COMMISSION_RATE,
        riderEarning: (order.deliveryCharge || RIDER_DELIVERY_FEE) * RIDER_NET_RATE,
      });
    });

    const ridersWithStats = riders.map((rider) => {
      const obj = rider.toObject();
      const earnings = earningMap[rider._id.toString()] || {};
      const orderStats = orderMap[rider._id.toString()] || {};
      const active = activeMap[rider._id.toString()] || {};
      obj.earningSession = {
        todayEarnings: earnings.todayEarnings || 0,
        todaySessions: earnings.todaySessions || 0,
        weekEarnings: earnings.weekEarnings || 0,
        weekSessions: earnings.weekSessions || 0,
        monthEarnings: earnings.monthEarnings || 0,
        monthSessions: earnings.monthSessions || 0,
        totalEarnings: earnings.totalEarnings || 0,
        adminCommission: earnings.adminCommission || 0,
        totalSessions: earnings.totalSessions || 0,
        assignedOrders: orderStats.assignedOrders || 0,
        deliveredOrders: earnings.totalSessions || 0,
        cancelledOrders: orderStats.cancelledOrders || 0,
        pendingOrders: orderStats.pendingOrders || 0,
        activeOrders: active.activeOrders || 0,
        recentDeliveries: recentMap[rider._id.toString()] || [],
      };
      return obj;
    });

    res.json({ success: true, count: ridersWithStats.length, riders: ridersWithStats });
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

// @desc    Niwala admin/platform earning summary
// @route   GET /api/admin/earnings
exports.getAdminEarnings = async (req, res) => {
  try {
    const { start, end } = getTodayRange();
    const monthStart = new Date(start.getFullYear(), start.getMonth(), 1);

    const rows = await Order.aggregate([
      { $match: { status: 'delivered' } },
      {
        $addFields: {
          earningDate: { $ifNull: ['$deliveryConfirmedAt', '$updatedAt'] },
          riderGross: { $ifNull: ['$deliveryCharge', RIDER_DELIVERY_FEE] },
          restaurantGross: restaurantGrossExpression,
        },
      },
      {
        $addFields: {
          riderCommission: {
            $cond: [
              { $ne: ['$riderId', null] },
              { $multiply: ['$riderGross', RIDER_ADMIN_COMMISSION_RATE] },
              0,
            ],
          },
          restaurantCommission: {
            $multiply: ['$restaurantGross', RESTAURANT_ADMIN_COMMISSION_RATE],
          },
        },
      },
      {
        $group: {
          _id: null,
          deliveredOrders: { $sum: 1 },
          totalRiderCommission: { $sum: '$riderCommission' },
          totalRestaurantCommission: { $sum: '$restaurantCommission' },
          todayRiderCommission: {
            $sum: {
              $cond: [
                { $and: [{ $gte: ['$earningDate', start] }, { $lt: ['$earningDate', end] }] },
                '$riderCommission',
                0,
              ],
            },
          },
          todayRestaurantCommission: {
            $sum: {
              $cond: [
                { $and: [{ $gte: ['$earningDate', start] }, { $lt: ['$earningDate', end] }] },
                '$restaurantCommission',
                0,
              ],
            },
          },
          monthRiderCommission: {
            $sum: {
              $cond: [
                { $and: [{ $gte: ['$earningDate', monthStart] }, { $lt: ['$earningDate', end] }] },
                '$riderCommission',
                0,
              ],
            },
          },
          monthRestaurantCommission: {
            $sum: {
              $cond: [
                { $and: [{ $gte: ['$earningDate', monthStart] }, { $lt: ['$earningDate', end] }] },
                '$restaurantCommission',
                0,
              ],
            },
          },
        },
      },
    ]);

    const recentOrders = await Order.find({ status: 'delivered' })
      .populate('restaurantId', 'restaurantName name')
      .populate('riderId', 'name phone')
      .sort({ deliveryConfirmedAt: -1, updatedAt: -1 })
      .limit(30)
      .lean();

    const stats = rows[0] || {};
    const totalRiderCommission = stats.totalRiderCommission || 0;
    const totalRestaurantCommission = stats.totalRestaurantCommission || 0;
    const todayRiderCommission = stats.todayRiderCommission || 0;
    const todayRestaurantCommission = stats.todayRestaurantCommission || 0;
    const monthRiderCommission = stats.monthRiderCommission || 0;
    const monthRestaurantCommission = stats.monthRestaurantCommission || 0;

    const orders = recentOrders.map((order) => {
      const riderGross = order.riderId ? (order.deliveryCharge || RIDER_DELIVERY_FEE) : 0;
      const restaurantGross = Math.max((order.totalAmount || 0) - (order.deliveryCharge || 0), 0);
      const riderCommission = riderGross * RIDER_ADMIN_COMMISSION_RATE;
      const restaurantCommission = restaurantGross * RESTAURANT_ADMIN_COMMISSION_RATE;
      return {
        id: order._id,
        restaurantName: order.restaurantId?.restaurantName || order.restaurantId?.name || 'Restaurant',
        riderName: order.riderId?.name || 'Unassigned',
        deliveredAt: order.deliveryConfirmedAt || order.updatedAt,
        totalAmount: order.totalAmount || 0,
        deliveryCharge: order.deliveryCharge || 0,
        riderGross,
        riderNet: riderGross * RIDER_NET_RATE,
        riderCommission,
        restaurantGross,
        restaurantNet: restaurantGross * RESTAURANT_NET_RATE,
        restaurantCommission,
        adminCommission: riderCommission + restaurantCommission,
      };
    });

    res.json({
      success: true,
      rates: {
        riderCommissionPercent: RIDER_ADMIN_COMMISSION_RATE * 100,
        restaurantCommissionPercent: RESTAURANT_ADMIN_COMMISSION_RATE * 100,
      },
      stats: {
        deliveredOrders: stats.deliveredOrders || 0,
        totalRiderCommission,
        totalRestaurantCommission,
        totalAdminEarnings: totalRiderCommission + totalRestaurantCommission,
        todayRiderCommission,
        todayRestaurantCommission,
        todayAdminEarnings: todayRiderCommission + todayRestaurantCommission,
        monthRiderCommission,
        monthRestaurantCommission,
        monthAdminEarnings: monthRiderCommission + monthRestaurantCommission,
      },
      orders,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
