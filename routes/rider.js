const express = require('express');
const router = express.Router();
const { protect, checkRole } = require('../middleware/auth');
const {
  getDashboard,
  toggleOnline,
  getIncomingOrders,
  getActiveOrder,
  getOrderHistory,
  getOrderDetails,
  updateOrderStatus,
  updateLocation,
  sendMessage,
  getMessages,
} = require('../controllers/riderController');

router.use(protect, checkRole('rider'));

router.get('/dashboard', getDashboard);
router.put('/online', toggleOnline);
router.get('/orders/incoming', getIncomingOrders);
router.get('/orders/active', getActiveOrder);
router.get('/orders/history', getOrderHistory);
router.get('/order/:id', getOrderDetails);
router.put('/order/:id/status', updateOrderStatus);
router.put('/location', updateLocation);
router.get('/order/:id/messages', getMessages);
router.post('/order/:id/messages', sendMessage);

module.exports = router;
