import express from 'express';
import { isAuthenticated } from '../middlewares/auth.mdw.js';
import { uploadArray } from '../middlewares/uploadOrderImages.mdw.js';
import * as productService from '../services/product.service.js';

const router = express.Router();

router.get('/category', productService.getProductByCategories);
router.get('/search', productService.getProductBySearch);
router.get('/detail', productService.getProductDetail);
router.get('/bidding-history', isAuthenticated, productService.getBiddingHistoryPage);
router.post('/watchlist', isAuthenticated, productService.addToWatchlist);
router.delete('/watchlist', isAuthenticated, productService.removeFromWatchlist);
router.post('/bid', isAuthenticated, productService.placeBid);
router.post('/comment', isAuthenticated, productService.postComment);
router.get('/complete-order', isAuthenticated, productService.getCompleteOrderPage);
router.post('/order/upload-images', isAuthenticated, uploadArray, productService.uploadOrderImages);
router.post('/order/:orderId/submit-payment', isAuthenticated, productService.submitPayment);
router.post('/order/:orderId/confirm-payment', isAuthenticated, productService.confirmPayment);
router.post('/order/:orderId/submit-shipping', isAuthenticated, productService.submitShipping);
router.post('/order/:orderId/confirm-delivery', isAuthenticated, productService.confirmDelivery);
router.post('/order/:orderId/submit-rating', isAuthenticated, productService.submitRating);
router.post('/order/:orderId/complete-transaction', isAuthenticated, productService.completeTransaction);
router.post('/order/:orderId/send-message', isAuthenticated, productService.sendMessage);
router.get('/order/:orderId/messages', isAuthenticated, productService.getOrderMessages);
router.post('/reject-bidder', isAuthenticated, productService.rejectBidder);
router.post('/unreject-bidder', isAuthenticated, productService.unrejectBidder);
router.post('/buy-now', isAuthenticated, productService.buyNow);
router.get('/seller/:sellerId/ratings', productService.getSellerRatings);
router.get('/bidder/:bidderId/ratings', productService.getBidderRatings);

export default router;
