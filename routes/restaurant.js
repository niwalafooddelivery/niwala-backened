const express = require('express');
const router = express.Router();
const { protect, checkRole } = require('../middleware/auth');
const {
  getDashboard,
  addFoodItem,
  getMyFoodItems,
  updateFoodItem,
  deleteFoodItem,
  getRestaurantOrders,
  updateOrderStatus,
} = require('../controllers/restaurantController');

router.use(protect, checkRole('restaurant'));

router.get('/dashboard', getDashboard);
router.get('/food', getMyFoodItems);
router.post('/food', addFoodItem);
router.put('/food/:id', updateFoodItem);
router.delete('/food/:id', deleteFoodItem);
router.get('/orders', getRestaurantOrders);
router.put('/orders/:id', updateOrderStatus);

module.exports = router;
