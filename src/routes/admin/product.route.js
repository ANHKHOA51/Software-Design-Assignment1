import express from 'express';
import * as productModel from '../../models/product.model.js';
import * as userModel from '../../models/user.model.js';
import * as productService from '../../services/product.service.js';
import * as sellerProductService from '../../services/sellerService.js'
import multer from 'multer';
import path from 'path';
import fs from 'fs';

const router = express.Router();

router.get('/list', async (req, res) => {
    const products = await productModel.findAll();
    const success_message = req.session.success_message;
    const error_message = req.session.error_message;
    // Xóa message sau khi lấy ra
    delete req.session.success_message;
    delete req.session.error_message;
    const filteredProducts = products.map(p => ({
        id: p.id,
        name: p.name,
        seller_name: p.seller_name,
        current_price: p.current_price,
        highest_bidder_name: p.highest_bidder_name
    }));
    res.render('vwAdmin/product/list', {
        products: filteredProducts,
        empty: products.length === 0,
        success_message,
        error_message
    });
});


router.get('/add', async (req, res) => {
    try {
        // Lấy danh sách sellers (users có role = 'seller')
        const sellers = await userModel.findUsersByRole('seller');
        res.render('vwAdmin/product/add', { sellers });
    } catch (error) {
        console.error('Error loading sellers:', error);
        res.render('vwAdmin/product/add', {
            sellers: [],
            error_message: 'Failed to load sellers list'
        });
    }
});

router.post('/add', async function (req, res) {
    const payload = req.body;
    
    await sellerProductService.addAdminProduct(payload)
    
    res.redirect('/admin/products/list');
});
router.get('/detail/:id', async (req, res) => {
    const id = req.params.id;
    const product = await productService.findByProductIdForAdmin(id);
    // console.log(product);
    const success_message = req.session.success_message;
    const error_message = req.session.error_message;
    delete req.session.success_message;
    delete req.session.error_message
    res.render('vwAdmin/product/detail', { product });
});

router.get('/edit/:id', async (req, res) => {
    const id = req.params.id;
    const product = await productService.findByProductIdForAdmin(id);
    // console.log(product)
    const sellers = await userModel.findUsersByRole('seller');
    // console.log(product);
    res.render('vwAdmin/product/edit', { product, sellers });
});

router.post('/edit', async (req, res) => {
    const newProduct = req.body;
    await productModel.updateProduct(newProduct.id, newProduct);
    req.session.success_message = 'Product updated successfully!';
    res.redirect('/admin/products/list');
});

router.post('/delete', async (req, res) => {
    const { id } = req.body;
    await productModel.deleteProduct(id);
    req.session.success_message = 'Product deleted successfully!';
    res.redirect('/admin/products/list');
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

router.post('/upload-thumbnail', upload.single('thumbnail'), async function (req, res) {
    res.json({
        success: true,
        file: req.file
    });
});

router.post('/upload-subimages', upload.array('images', 10), async function (req, res) {
    res.json({
        success: true,
        files: req.files
    });
});

export default router;