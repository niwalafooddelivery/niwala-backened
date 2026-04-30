const express = require('express');
const router = express.Router();
const upload = require('../middleware/upload');

// Upload single image - returns the URL
router.post('/image', upload.single('image'), (req, res) => {
  if (!req.file) return res.status(400).json({ success: false, message: 'No file uploaded' });
  const imageUrl = `/uploads/${req.file.filename}`;
  res.json({ success: true, imageUrl, fullUrl: `${req.protocol}://${req.get('host')}${imageUrl}` });
});

module.exports = router;
