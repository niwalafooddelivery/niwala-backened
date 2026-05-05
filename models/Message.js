const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
  orderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Order',
    required: true,
  },
  senderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  senderRole: {
    type: String,
    enum: ['customer', 'rider', 'restaurant'],
    required: true,
  },
  conversationType: {
    type: String,
    enum: ['customer_rider', 'restaurant_rider'],
    default: 'customer_rider',
  },
  readBy: [{
    type: String,
    enum: ['customer', 'rider', 'restaurant'],
  }],
  message: {
    type: String,
    required: true,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model('Message', messageSchema);
