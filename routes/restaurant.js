const express = require('express');
const router = express.Router();
const { protect, checkRole } = require('../middleware/auth');
const upload = require('../middleware/upload');
const {
  getDashboard,
  addFoodItem,
  getMyFoodItems,
  updateFoodItem,
  deleteFoodItem,
  getRestaurantOrders,
  updateOrderStatus,
  getRiderMessages,
  sendRiderMessage,
} = require('../controllers/restaurantController');

router.use(protect, checkRole('restaurant'));

router.get('/dashboard', getDashboard);
router.get('/food', getMyFoodItems);
router.post('/food', upload.single('image'), addFoodItem);
router.put('/food/:id', upload.single('image'), updateFoodItem);
router.delete('/food/:id', deleteFoodItem);
router.get('/orders', getRestaurantOrders);
router.put('/orders/:id', updateOrderStatus);
router.get('/orders/:id/rider-messages', getRiderMessages);
router.post('/orders/:id/rider-messages', sendRiderMessage);

module.exports = router;
