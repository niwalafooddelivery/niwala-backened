const express = require('express');
const router = express.Router();
const { protect, checkRole } = require('../middleware/auth');
const {
  getAllFoodItems,
  getAllRestaurants,
  getRestaurantMenu,
  placeOrder,
  getMyOrders,
  getOrderDetails,
  cancelPendingOrder,
  confirmDelivery,
  getOrderMessages,
  sendMessage,
  markOrderMessagesRead,
} = require('../controllers/customerController');

router.use(protect, checkRole('customer'));

router.get('/all-food', getAllFoodItems);
router.get('/restaurants', getAllRestaurants);
router.get('/restaurant/:id/menu', getRestaurantMenu);
router.post('/order', placeOrder);
router.get('/orders', getMyOrders);
router.get('/order/:id', getOrderDetails);
router.put('/order/:id/confirm-delivery', confirmDelivery);
router.delete('/order/:id', cancelPendingOrder);
router.get('/order/:id/messages', getOrderMessages);
router.post('/order/:id/messages', sendMessage);
router.put('/order/:id/messages/read', markOrderMessagesRead);

module.exports = router;
