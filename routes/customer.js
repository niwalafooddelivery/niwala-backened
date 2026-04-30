const express = require('express');
const router = express.Router();
const { protect, checkRole } = require('../middleware/auth');
const {
  getNearbyRestaurants,
  getRestaurantMenu,
  placeOrder,
  getMyOrders,
  getOrderDetails,
  getOrderMessages,
  sendMessage,
} = require('../controllers/customerController');

router.use(protect, checkRole('customer'));

router.get('/restaurants', getNearbyRestaurants);
router.get('/restaurant/:id/menu', getRestaurantMenu);
router.post('/order', placeOrder);
router.get('/orders', getMyOrders);
router.get('/order/:id', getOrderDetails);
router.get('/order/:id/messages', getOrderMessages);
router.post('/order/:id/messages', sendMessage);

module.exports = router;
