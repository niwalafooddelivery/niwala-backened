const express = require('express');
const router = express.Router();
const { protect, adminOnly } = require('../middleware/auth');
const {
  getDashboardStats,
  getRestaurants,
  getRiders,
  updateApproval,
  deleteUser,
  getAllOrders,
} = require('../controllers/adminController');

router.use(protect, adminOnly); // All admin routes require admin

router.get('/dashboard', getDashboardStats);
router.get('/restaurants', getRestaurants);
router.get('/riders', getRiders);
router.put('/approve/:userId', updateApproval);
router.delete('/user/:userId', deleteUser);
router.get('/orders', getAllOrders);

module.exports = router;
