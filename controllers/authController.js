const User = require('../models/User');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');

// Generate JWT
const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: '30d' });
};

// @desc    Signup as Customer / Rider / Restaurant
// @route   POST /api/auth/signup
exports.signup = async (req, res) => {
  try {
    const {
      name, email, password, phone, role,
      address, latitude, longitude,
      cnicNumber, cnicFrontImage, cnicBackImage,
      restaurantName, cuisineType, vehicleNumber,
    } = req.body;

    if (!name || !email || !password || !phone || !role) {
      return res.status(400).json({ success: false, message: 'Please fill all required fields' });
    }

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ success: false, message: 'Email already registered' });
    }

    // Validation: Rider & Restaurant must provide CNIC
    if ((role === 'rider' || role === 'restaurant') && !cnicNumber) {
      return res.status(400).json({ success: false, message: 'CNIC number is required' });
    }

    // Auto-approve customers, others need admin approval
    const approvalStatus = role === 'customer' ? 'approved' : 'pending';

    const user = await User.create({
      name, email, password, phone, role,
      address: address || '',
      latitude: latitude || 0,
      longitude: longitude || 0,
      cnicNumber: cnicNumber || '',
      cnicFrontImage: cnicFrontImage || '',
      cnicBackImage: cnicBackImage || '',
      restaurantName: restaurantName || '',
      cuisineType: cuisineType || '',
      vehicleNumber: vehicleNumber || '',
      approvalStatus,
    });

    res.status(201).json({
      success: true,
      message: role === 'customer'
        ? 'Account created successfully'
        : 'Account created. Waiting for admin approval.',
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        approvalStatus: user.approvalStatus,
      },
      token: generateToken(user._id),
    });
  } catch (error) {
    console.error('Signup error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Login
// @route   POST /api/auth/login
exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Email and password required' });
    }

    const user = await User.findOne({ email });
    if (!user || !(await user.matchPassword(password))) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    // Check approval status for non-customer non-admin
    if ((user.role === 'rider' || user.role === 'restaurant') && user.approvalStatus !== 'approved') {
      return res.status(403).json({
        success: false,
        message: `Your account is ${user.approvalStatus}. Please wait for admin approval.`,
        approvalStatus: user.approvalStatus,
      });
    }

    res.json({
      success: true,
      message: 'Login successful',
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role,
        address: user.address,
        latitude: user.latitude,
        longitude: user.longitude,
        restaurantName: user.restaurantName,
        approvalStatus: user.approvalStatus,
      },
      token: generateToken(user._id),
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Forgot Password (generates reset token - in real app, email it)
// @route   POST /api/auth/forgot-password
exports.forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({ success: false, message: 'No account with this email' });
    }

    const resetToken = crypto.randomBytes(20).toString('hex');
    user.resetPasswordToken = crypto.createHash('sha256').update(resetToken).digest('hex');
    user.resetPasswordExpiry = Date.now() + 30 * 60 * 1000; // 30 mins
    await user.save();

    // In production: send email with reset link
    // For demo: return token directly
    res.json({
      success: true,
      message: 'Reset token generated. In production, this would be emailed.',
      resetToken,
      note: 'Use POST /api/auth/reset-password with this token and new password',
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Reset Password using token
// @route   POST /api/auth/reset-password
exports.resetPassword = async (req, res) => {
  try {
    const { resetToken, newPassword } = req.body;
    if (!resetToken || !newPassword) {
      return res.status(400).json({ success: false, message: 'Token and new password required' });
    }

    const hashedToken = crypto.createHash('sha256').update(resetToken).digest('hex');
    const user = await User.findOne({
      resetPasswordToken: hashedToken,
      resetPasswordExpiry: { $gt: Date.now() },
    });

    if (!user) {
      return res.status(400).json({ success: false, message: 'Invalid or expired reset token' });
    }

    user.password = newPassword;
    user.resetPasswordToken = undefined;
    user.resetPasswordExpiry = undefined;
    await user.save();

    res.json({ success: true, message: 'Password reset successful' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get current user profile
// @route   GET /api/auth/me
exports.getMe = async (req, res) => {
  res.json({ success: true, user: req.user });
};
