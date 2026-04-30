const mongoose = require('mongoose');

const orderItemSchema = new mongoose.Schema({
  foodItemId: { type: mongoose.Schema.Types.ObjectId, ref: 'FoodItem' },
  name: String,
  price: Number,
  quantity: Number,
});

const orderSchema = new mongoose.Schema({
  customerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  restaurantId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  riderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null,
  },
  items: [orderItemSchema],
  totalAmount: {
    type: Number,
    required: true,
  },
  deliveryAddress: {
    type: String,
    required: true,
  },
  customerLatitude: {
    type: Number,
    required: true,
  },
  customerLongitude: {
    type: Number,
    required: true,
  },
  paymentMethod: {
    type: String,
    enum: ['cash', 'easypaisa', 'jazzcash', 'bank'],
    default: 'cash',
  },
  paymentStatus: {
    type: String,
    enum: ['pending', 'paid', 'failed'],
    default: 'pending',
  },
  status: {
    type: String,
    enum: ['placed', 'accepted', 'preparing', 'ready', 'picked_up', 'on_the_way', 'delivered', 'cancelled'],
    default: 'placed',
  },
  // For real-time tracking
  riderCurrentLat: { type: Number, default: 0 },
  riderCurrentLng: { type: Number, default: 0 },
  notes: { type: String, default: '' },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

orderSchema.pre('save', function (next) {
  this.updatedAt = Date.now();
  next();
});

module.exports = mongoose.model('Order', orderSchema);
