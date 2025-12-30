const express = require('express');
const router = express.Router();
const bannerController = require('../controllers/bannerController');
const upload = require('../middleware/upload');

// GET /api/banners -> getAllBanners
router.get('/', bannerController.getAllBanners);

// POST /api/banners -> upload.single('image'), createBanner
router.post('/', upload.single('image'), bannerController.createBanner);

// PUT /api/banners/:id -> upload.single('image'), updateBanner
router.put('/:id', upload.single('image'), bannerController.updateBanner);

// DELETE /api/banners/:id -> deleteBanner
router.delete('/:id', bannerController.deleteBanner);

module.exports = router;
