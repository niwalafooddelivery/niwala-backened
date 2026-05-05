const express = require('express');
const router = express.Router();
const { protect, checkRole } = require('../middleware/auth');
const {
  getDashboard,
  toggleOnline,
  getIncomingOrders,
  acceptOrder,
  declineOrder,
  getActiveOrder,
  getOrderHistory,
  getOrderDetails,
  updateOrderStatus,
  updateLocation,
  sendMessage,
  getMessages,
  markMessagesRead,
  getRestaurantMessages,
  sendRestaurantMessage,
  markRestaurantMessagesRead,
} = require('../controllers/riderController');

router.use(protect, checkRole('rider'));

router.get('/dashboard', getDashboard);
router.put('/online', toggleOnline);
router.get('/orders/incoming', getIncomingOrders);
router.get('/orders/active', getActiveOrder);
router.get('/orders/history', getOrderHistory);
router.get('/order/:id', getOrderDetails);
router.put('/order/:id/accept', acceptOrder);
router.put('/order/:id/decline', declineOrder);
router.put('/order/:id/status', updateOrderStatus);
router.put('/location', updateLocation);
router.get('/order/:id/messages', getMessages);
router.post('/order/:id/messages', sendMessage);
router.put('/order/:id/messages/read', markMessagesRead);
router.get('/order/:id/restaurant-messages', getRestaurantMessages);
router.post('/order/:id/restaurant-messages', sendRestaurantMessage);
router.put('/order/:id/restaurant-messages/read', markRestaurantMessagesRead);

module.exports = router;
