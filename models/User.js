const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
  },
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
  },
  password: {
    type: String,
    required: true,
    minlength: 6,
  },
  phone: {
    type: String,
    required: true,
  },
  role: {
    type: String,
    enum: ['customer', 'rider', 'restaurant', 'admin'],
    required: true,
  },
  // Common location fields
  address: {
    type: String,
    default: '',
  },
  latitude: {
    type: Number,
    default: 0,
  },
  longitude: {
    type: Number,
    default: 0,
  },
  // Rider & Restaurant specific - CNIC verification
  cnicNumber: {
    type: String,
    default: '',
  },
  cnicFrontImage: {
    type: String,
    default: '',
  },
  cnicBackImage: {
    type: String,
    default: '',
  },
  // Restaurant specific
  restaurantName: {
    type: String,
    default: '',
  },
  restaurantImage: {
    type: String,
    default: '',
  },
  cuisineType: {
    type: String,
    default: '',
  },
  // Rider specific - vehicle info
  vehicleNumber: {
    type: String,
    default: '',
  },
  // Approval status (for Rider & Restaurant)
  approvalStatus: {
    type: String,
    enum: ['pending', 'approved', 'rejected'],
    default: 'pending',
  },
  // For password reset
  resetPasswordToken: String,
  resetPasswordExpiry: Date,
  // Online status (for riders)
  isOnline: {
    type: Boolean,
    default: false,
  },
  // Current location for live tracking (riders)
  currentLatitude: {
    type: Number,
    default: 0,
  },
  currentLongitude: {
    type: Number,
    default: 0,
  },
  fcmToken: {
    type: String,
    default: '',
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

// Hash password before saving
userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

// Compare password method
userSchema.methods.matchPassword = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

module.exports = mongoose.model('User', userSchema);
