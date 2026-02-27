import express from 'express';
import * as productModel from '../models/product.model.js';
import * as productDescUpdateModel from '../models/productDescriptionUpdate.model.js';
import * as sellerService from '../services/sellerService.js'
import * as sellerProductModel from '../models/sellerProduct.model.js'
import multer from 'multer';

const router = express.Router();

router.get('/', async function (req, res) {
    const sellerId = req.session.authUser.id;
    const stats = await sellerProductModel.getSellerStats(sellerId);
    res.render('vwSeller/dashboard', { stats });
});

// All Products - View only
router.get('/products', async function (req, res) {
    const sellerId = req.session.authUser.id;
    const products = await sellerProductModel.findAllProductsBySellerId(sellerId);
    res.render('vwSeller/all-products', { products });
});

// Active Products - CRUD
router.get('/products/active', async function (req, res) {
    const sellerId = req.session.authUser.id;
    const products = await sellerProductModel.findActiveProductsBySellerId(sellerId);
    res.render('vwSeller/active', { products });
});

// Pending Products - Waiting for payment
router.get('/products/pending', async function (req, res) {
    const sellerId = req.session.authUser.id;

    const { products, stats, success_message } = await sellerService.getPendingProduct(sellerId)

    res.render('vwSeller/pending', { products, stats, success_message });
});

// Sold Products - Paid successfully
router.get('/products/sold', async function (req, res) {
    const sellerId = req.session.authUser.id;

    const { productsWithReview, stats } = await sellerService.getSoldProduct(sellerId)

    res.render('vwSeller/sold-products', { products: productsWithReview, stats });
});

// Expired Products - No bidder or cancelled
router.get('/products/expired', async function (req, res) {
    const sellerId = req.session.authUser.id;

    const products = await sellerService.getExpiredProduct(sellerId);

    res.render('vwSeller/expired', { products });
});

router.get('/products/add', async function (req, res) {
    const success_message = req.session.success_message;
    delete req.session.success_message; // Xóa message sau khi hiển thị
    res.render('vwSeller/add', { success_message });
});

router.post('/products/add', async function (req, res) {
    const product = req.body;
    // console.log('product:', product);
    const sellerId = req.session.authUser.id;
    // console.log('sellerId:', sellerId);

    // Parse UTC ISO strings from client
    await sellerService.addProduct(product, sellerId);

    // Lưu success message vào session
    req.session.success_message = 'Product added successfully!';
    res.redirect('/seller/products/add');
});

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, 'public/uploads/');
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + '-' + file.originalname);
    }
});

const upload = multer({ storage: storage });

router.post('/products/upload-thumbnail', upload.single('thumbnail'), async function (req, res) {
    res.json({
        success: true,
        file: req.file
    });
});

router.post('/products/upload-subimages', upload.array('images', 10), async function (req, res) {
    res.json({
        success: true,
        files: req.files
    });
});

// Cancel Product
router.post('/products/:id/cancel', async function (req, res) {
    try {
        const productId = req.params.id;
        const sellerId = req.session.authUser.id;
        const payload = req.body

        await sellerService.cancelProduct(productId, sellerId, payload);

        res.json({ success: true, message: 'Auction cancelled successfully' });
    } catch (error) {
        console.error('Cancel product error:', error);

        if (error.message === 'Product not found') {
            return res.status(404).json({ success: false, message: 'Product not found' });
        }
        if (error.message === 'Unauthorized') {
            return res.status(403).json({ success: false, message: 'Unauthorized' });
        }

        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// Rate Bidder
router.post('/products/:id/rate', async function (req, res) {
    try {
        const productId = req.params.id;
        const sellerId = req.session.authUser.id;
        const { rating, comment, highest_bidder_id } = req.body;

        if (!highest_bidder_id) {
            return res.status(400).json({ success: false, message: 'No bidder to rate' });
        }
        
        await sellerService.rateBidder(rating, sellerId, productId, comment, highest_bidder_id);

        res.json({ success: true, message: 'Rating submitted successfully' });
    } catch (error) {
        console.error('Rate bidder error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// Update Bidder Rating
router.put('/products/:id/rate', async function (req, res) {
    try {
        const productId = req.params.id;
        const sellerId = req.session.authUser.id;
        const { rating, comment, highest_bidder_id } = req.body;

        if (!highest_bidder_id) {
            return res.status(400).json({ success: false, message: 'No bidder to rate' });
        }

        await sellerService.updateRateBidder(rating, sellerId, productId, comment, highest_bidder_id)

        res.json({ success: true, message: 'Rating updated successfully' });
    } catch (error) {
        console.error('Update rating error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// Append Description to Product
router.post('/products/:id/append-description', async function (req, res) {
    try {
        const productId = req.params.id;
        const sellerId = req.session.authUser.id;
        const { description } = req.body;

        await sellerService.appendDescription({
            productId,
            sellerId,
            description,
            protocol: req.protocol,
            host: req.get('host')
        });

        return res.json({
            success: true,
            message: 'Description appended successfully'
        });

    } catch (err) {
        if (err.message === 'INVALID_DESCRIPTION') {
            return res.status(400).json({ success: false, message: 'Description is required' });
        }

        if (err.message === 'PRODUCT_NOT_FOUND') {
            return res.status(404).json({ success: false, message: 'Product not found' });
        }

        if (err.message === 'UNAUTHORIZED') {
            return res.status(403).json({ success: false, message: 'Unauthorized' });
        }

        return res.status(500).json({ success: false, message: 'Server error' });
    }
});

// Get Description Updates for a Product
router.get('/products/:id/description-updates', async function (req, res) {
    try {
        const productId = req.params.id;
        const sellerId = req.session.authUser.id;

        // Verify that the product belongs to the seller
        const product = await productService.findByProductId2(productId, null);
        if (!product) {
            return res.status(404).json({ success: false, message: 'Product not found' });
        }

        if (product.seller_id !== sellerId) {
            return res.status(403).json({ success: false, message: 'Unauthorized' });
        }

        // Get all description updates for this product
        const updates = await productDescUpdateModel.findByProductId(productId);

        res.json({ success: true, updates });
    } catch (error) {
        console.error('Get description updates error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// Update a Description Update
router.put('/products/description-updates/:updateId', async function (req, res) {
    try {
        const updateId = req.params.updateId;
        const sellerId = req.session.authUser.id;
        const { content } = req.body;

        if (!content || content.trim() === '') {
            return res.status(400).json({ success: false, message: 'Content is required' });
        }

        // Get the update to verify ownership
        const update = await productDescUpdateModel.findById(updateId);
        if (!update) {
            return res.status(404).json({ success: false, message: 'Update not found' });
        }

        // Verify that the product belongs to the seller
        const product = await productService.findByProductId2(update.product_id, null);
        if (!product || product.seller_id !== sellerId) {
            return res.status(403).json({ success: false, message: 'Unauthorized' });
        }

        // Update the content
        await productDescUpdateModel.updateContent(updateId, content.trim());

        res.json({ success: true, message: 'Update saved successfully' });
    } catch (error) {
        console.error('Update description error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// Delete a Description Update
router.delete('/products/description-updates/:updateId', async function (req, res) {
    try {
        const updateId = req.params.updateId;
        const sellerId = req.session.authUser.id;

        // Get the update to verify ownership
        const update = await productDescUpdateModel.findById(updateId);
        if (!update) {
            return res.status(404).json({ success: false, message: 'Update not found' });
        }

        // Verify that the product belongs to the seller
        const product = await productService.findByProductId2(update.product_id, null);
        if (!product || product.seller_id !== sellerId) {
            return res.status(403).json({ success: false, message: 'Unauthorized' });
        }

        // Delete the update
        await productDescUpdateModel.deleteUpdate(updateId);

        res.json({ success: true, message: 'Update deleted successfully' });
    } catch (error) {
        console.error('Delete description error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

export default router;