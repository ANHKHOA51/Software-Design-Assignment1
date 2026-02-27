import * as productModel from '../models/product.model.js';
import * as reviewModel from '../models/review.model.js';
import * as productDescUpdateModel from '../models/productDescriptionUpdate.model.js';
import * as biddingHistoryModel from '../models/biddingHistory.model.js';
import * as productCommentModel from '../models/productComment.model.js';
import * as mailService from '../services/mailService.js'
import * as sellerProductModel from '../models/sellerProduct.model.js'
import * as productService from '../services/product.service.js';
import multer from 'multer';
import path from 'path';
import fs from 'fs';

export async function getPendingProduct(sellerId) {
    const [products, stats] = await Promise.all([
        sellerProductModel.findPendingProductsBySellerId(sellerId),
        productModel.getPendingProductsStats(sellerId)
    ]);

    // Lấy message từ query param
    let success_message = '';
    if (req.query.message === 'cancelled') {
        success_message = 'Auction cancelled successfully!';
    }

    return { products, stats, success_message }
}

export async function getSoldProduct(sellerId) {
    const [products, stats] = await Promise.all([
        sellerProductModel.findSoldProductsBySellerId(sellerId),
        productModel.getSoldProductsStats(sellerId)
    ]);

    // Fetch review info for each product
    const productsWithReview = await Promise.all(products.map(async (product) => {
        const review = await reviewModel.getProductReview(sellerId, product.highest_bidder_id, product.id);

        // Only show review if rating is not 0 (actual rating, not skip)
        const hasActualReview = review && review.rating !== 0;

        return {
            ...product,
            hasReview: hasActualReview,
            reviewRating: hasActualReview ? (review.rating === 1 ? 'positive' : 'negative') : null,
            reviewComment: hasActualReview ? review.comment : ''
        };
    }));

    return { productsWithReview, stats }
}

export async function getExpiredProduct(sellerId) {
    const products = await sellerProductModel.findExpiredProductsBySellerId(sellerId);

    // Add review info for cancelled products with bidders
    for (let product of products) {
        if (product.status === 'Cancelled' && product.highest_bidder_id) {
            const review = await reviewModel.getProductReview(sellerId, product.highest_bidder_id, product.id);
            // Only show review if rating is not 0 (actual rating, not skip)
            const hasActualReview = review && review.rating !== 0;

            product.hasReview = hasActualReview;
            if (hasActualReview) {
                product.reviewRating = review.rating === 1 ? 'positive' : 'negative';
                product.reviewComment = review.comment;
            }
        }
    }

    return products
}

export async function addProduct(product, sellerId) {
    const createdAtUTC = new Date(product.created_at);
    const endAtUTC = new Date(product.end_date);

    const productData = {
        seller_id: sellerId,
        category_id: product.category_id,
        name: product.name,
        starting_price: product.start_price.replace(/,/g, ''),
        step_price: product.step_price.replace(/,/g, ''),
        buy_now_price: product.buy_now_price !== '' ? product.buy_now_price.replace(/,/g, '') : null,
        created_at: createdAtUTC,
        end_at: endAtUTC,
        auto_extend: product.auto_extend === '1' ? true : false,
        thumbnail: null, // to be updated after upload
        description: product.description,
        highest_bidder_id: null,
        current_price: product.start_price.replace(/,/g, ''),
        is_sold: null,
        allow_unrated_bidder: product.allow_new_bidders === '1' ? true : false,
        closed_at: null
    };
    console.log('productData:', productData);
    const returnedID = await productModel.addProduct(productData);

    let newImgPaths = await proccessImgPath(product, returnedID);

    console.log('subimagesData:', newImgPaths);
    await productModel.addProductImages(newImgPaths);
}

export async function cancelProduct(productId, sellerId, payload) {
    const { reason, highest_bidder_id } = payload;

    // Cancel product
    const product = await productService.cancelProduct(productId, sellerId);

    // Create review if there's a bidder
    if (highest_bidder_id) {
        const reviewModule = await import('../models/review.model.js');
        const reviewData = {
            reviewer_id: sellerId,
            reviewee_id: highest_bidder_id,
            product_id: productId,
            rating: -1,
            comment: reason || 'Auction cancelled by seller'
        };
        await reviewModule.createReview(reviewData);
    }
}

export async function rateBidder(rating, sellerId, productId, comment, highest_bidder_id) {
    // Map rating: positive -> 1, negative -> -1
    const ratingValue = rating === 'positive' ? 1 : -1;

    // Check if already rated
    const existingReview = await reviewModel.findByReviewerAndProduct(sellerId, productId);

    if (existingReview) {
        // Update existing review
        await reviewModel.updateByReviewerAndProduct(sellerId, productId, {
            rating: ratingValue,
            comment: comment || null
        });
    } else {
        // Create new review
        const reviewData = {
            reviewer_id: sellerId,
            reviewee_id: highest_bidder_id,
            product_id: productId,
            rating: ratingValue,
            comment: comment || ''
        };
        await reviewModel.createReview(reviewData);
    }
}

export async function updateRateBidder(rating, sellerId, productId, comment, highest_bidder_id) {
    // Map rating: positive -> 1, negative -> -1
    const ratingValue = rating === 'positive' ? 1 : -1;

    // Update review
    await reviewModel.updateReview(sellerId, highest_bidder_id, productId, {
        rating: ratingValue,
        comment: comment || ''
    });
}

export async function appendDescription({
    productId,
    sellerId,
    description,
    protocol,
    host
}) {

    if (!description || description.trim() === '') {
        throw new Error('INVALID_DESCRIPTION');
    }

    const product = await productService.findByProductId2(productId, null);
    if (!product) {
        throw new Error('PRODUCT_NOT_FOUND');
    }

    if (product.seller_id !== sellerId) {
        throw new Error('UNAUTHORIZED');
    }

    await productDescUpdateModel.addUpdate(productId, description.trim());

    const notifyUsers = await getUsersToNotify(productId, sellerId);

    if (notifyUsers.length > 0) {
        sendNotificationEmails({
            users: notifyUsers,
            product,
            description: description.trim(),
            productUrl: `${protocol}://${host}/products/detail?id=${productId}`
        });
    }
}

export async function addAdminProduct(payload) {
    const product = payload;
    const productData = {
        seller_id: product.seller_id,
        category_id: product.category_id,
        name: product.name,
        starting_price: product.start_price.replace(/,/g, ''),
        step_price: product.step_price.replace(/,/g, ''),
        buy_now_price: product.buy_now_price !== '' ? product.buy_now_price.replace(/,/g, '') : null,
        created_at: product.created_at,
        end_at: product.end_date,
        auto_extend: product.auto_extend === '1' ? true : false,
        thumbnail: null,  // to be updated after upload
        description: product.description,
        highest_bidder_id: null,
        current_price: product.start_price.replace(/,/g, ''),
        is_sold: null,
        closed_at: null,
        allow_unrated_bidder: product.allow_new_bidders === '1' ? true : false
    }
    // console.log('productData:', productData);
    const returnedID = await productModel.addProduct(productData);

    const newImgPaths = proccessImgPath(product, returnedID)

    await productModel.addProductImages(newImgPaths);
}

function sendNotificationEmails({ users, product, description, productUrl }) {
    Promise.all(
        users.map(user => {
            return mailService.notifyNewAddedDescription(user, product, productUrl, description).catch(err =>
                console.error('Failed to send email to', user.email, err)
            );
        })
    ).catch(err =>
        console.error('Email notification error:', err)
    );
}

async function getUsersToNotify(productId, sellerId) {
    const [bidders, commenters] = await Promise.all([
        biddingHistoryModel.getUniqueBidders(productId),
        productCommentModel.getUniqueCommenters(productId)
    ]);

    const notifyMap = new Map();

    [...bidders, ...commenters].forEach(user => {
        if (user.id !== sellerId && !notifyMap.has(user.email)) {
            notifyMap.set(user.email, user);
        }
    });

    return Array.from(notifyMap.values());
}

async function proccessImgPath(product, returnedID) {
    const dirPath = path.join('public', 'images', 'products').replace(/\\/g, "/");

    const imgs = JSON.parse(product.imgs_list);

    // Move and rename thumbnail
    const mainPath = path.join(dirPath, `p${returnedID[0].id}_thumb.jpg`).replace(/\\/g, "/");
    const oldMainPath = path.join('public', 'uploads', path.basename(product.thumbnail)).replace(/\\/g, "/");
    const savedMainPath = '/' + path.join('images', 'products', `p${returnedID[0].id}_thumb.jpg`).replace(/\\/g, "/");
    fs.renameSync(oldMainPath, mainPath);
    await productModel.updateProductThumbnail(returnedID[0].id, savedMainPath);

    // Move and rename subimages 
    let i = 1;
    let newImgPaths = [];
    for (const imgPath of imgs) {
        const oldPath = path.join('public', 'uploads', path.basename(imgPath)).replace(/\\/g, "/");
        const newPath = path.join(dirPath, `p${returnedID[0].id}_${i}.jpg`).replace(/\\/g, "/");
        const savedPath = '/' + path.join('images', 'products', `p${returnedID[0].id}_${i}.jpg`).replace(/\\/g, "/");
        fs.renameSync(oldPath, newPath);
        newImgPaths.push({
            product_id: returnedID[0].id,
            img_link: savedPath
        });
        i++;
    }
    return newImgPaths;
}