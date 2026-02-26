import * as productModel from '../models/product.model.js';
import * as reviewModel from '../models/review.model.js';
import * as userModel from '../models/user.model.js';
import * as watchListModel from '../models/watchlist.model.js';
import * as biddingHistoryModel from '../models/biddingHistory.model.js';
import * as productCommentModel from '../models/productComment.model.js';
import * as categoryModel from '../models/category.model.js';
import * as productDescUpdateModel from '../models/productDescriptionUpdate.model.js';
import * as systemSettingModel from '../models/systemSetting.model.js';
import * as rejectedBidderModel from '../models/rejectedBidder.model.js';
import * as orderModel from '../models/order.model.js';
import * as invoiceModel from '../models/invoice.model.js';
import * as orderChatModel from '../models/orderChat.model.js';
import { sendMail } from '../utils/mailer.js';
import db from '../utils/db.js';

const limit = 3;

const getPagination = (pageQuery) => {
  const page = parseInt(pageQuery) || 1;
  const offset = (page - 1) * limit;

  return { page, offset };
};

const getPaginationSummary = (totalCountInput, page) => {
  const totalCount = parseInt(totalCountInput) || 0;
  const nPages = Math.ceil(totalCount / limit);
  let from = (page - 1) * limit + 1;
  let to = page * limit;
  if (to > totalCount) to = totalCount;
  if (totalCount === 0) { from = 0; to = 0; }

  return { totalCount, nPages, from, to };
};

const getProductStatus = (product) => {
  const now = new Date();
  const endDate = new Date(product.end_at);
  let productStatus = 'ACTIVE';

  if (product.is_sold === true) {
    productStatus = 'SOLD';
  } else if (product.is_sold === false) {
    productStatus = 'CANCELLED';
  } else if ((endDate <= now || product.closed_at) && product.highest_bidder_id) {
    productStatus = 'PENDING';
  } else if (endDate <= now && !product.highest_bidder_id) {
    productStatus = 'EXPIRED';
  } else if (endDate > now && !product.closed_at) {
    productStatus = 'ACTIVE';
  }

  return productStatus;
};

const parseProofUrls = (proofUrls) => {
  return proofUrls
    .replace(/^\{/, '')
    .replace(/\}$/, '')
    .split(',')
    .filter(url => url);
};

const isOrderSeller = (order, userId) => {
  return order?.seller_id === userId;
};

const isOrderBuyer = (order, userId) => {
  return order?.buyer_id === userId;
};

const isOrderParticipant = (order, userId) => {
  return (order?.buyer_id === userId || order?.seller_id === userId);
};

const isTransactionCompletedByBothParties = async (order) => {
  const buyerReview = await reviewModel.getProductReview(order.buyer_id, order.seller_id, order.product_id);
  const sellerReview = await reviewModel.getProductReview(order.seller_id, order.buyer_id, order.product_id);

  return (buyerReview && sellerReview);
};

const prepareProductList = async (products) => {
  const now = new Date();
  if (!products) return [];
  
  // Load settings from database every time to get latest value
  const settings = await systemSettingModel.getSettings();
  const N_MINUTES = settings.new_product_limit_minutes;
  
  return products.map(product => {
    const created = new Date(product.created_at);
    const isNew = (now - created) < (N_MINUTES * 60 * 1000);

    return {
      ...product,
      is_new: isNew
    };
  });
};

const processAutoBid = ({ product, userId, bidAmount, minIncrement }) => {
  let newCurrentPrice;
  let newHighestBidderId;
  let newHighestMaxPrice;
  let shouldCreateHistory = true;

  const buyNowPrice = product.buy_now_price ? parseFloat(product.buy_now_price) : null;
  let buyNowTriggered = false;
  
  if (buyNowPrice && product.highest_bidder_id && product.highest_max_price && product.highest_bidder_id !== userId) {
    const currentHighestMaxPrice = parseFloat(product.highest_max_price);
    
    if (currentHighestMaxPrice >= buyNowPrice) {
      newCurrentPrice = buyNowPrice;
      newHighestBidderId = product.highest_bidder_id;
      newHighestMaxPrice = currentHighestMaxPrice;
      buyNowTriggered = true;
    }
  }

  if (!buyNowTriggered) {
    if (product.highest_bidder_id === userId) {
      newCurrentPrice = parseFloat(product.current_price || product.starting_price);
      newHighestBidderId = userId;
      newHighestMaxPrice = bidAmount;
      shouldCreateHistory = false;
    }
    else if (!product.highest_bidder_id || !product.highest_max_price) {
      newCurrentPrice = product.starting_price;
      newHighestBidderId = userId;
      newHighestMaxPrice = bidAmount;
    } 
    else {
      const currentHighestMaxPrice = parseFloat(product.highest_max_price);
      const currentHighestBidderId = product.highest_bidder_id;

      if (bidAmount < currentHighestMaxPrice) {
        newCurrentPrice = bidAmount;
        newHighestBidderId = currentHighestBidderId;
        newHighestMaxPrice = currentHighestMaxPrice;
      }
      else if (bidAmount === currentHighestMaxPrice) {
        newCurrentPrice = bidAmount;
        newHighestBidderId = currentHighestBidderId;
        newHighestMaxPrice = currentHighestMaxPrice;
      }
      else {
        newCurrentPrice = currentHighestMaxPrice + minIncrement;
        newHighestBidderId = userId;
        newHighestMaxPrice = bidAmount;
      }
    }

    if (buyNowPrice && newCurrentPrice >= buyNowPrice) {
      newCurrentPrice = buyNowPrice;
      buyNowTriggered = true;
    }
  }

  let productSold = buyNowTriggered;

  return {
    newCurrentPrice,
    newHighestBidderId,
    newHighestMaxPrice,
    shouldCreateHistory,
    productSold
  };
};

const sendBidNotificationEmails = (req, productId, result) => {
  const productUrl = `${req.protocol}://${req.get('host')}/products/detail?id=${productId}`;

  (async () => {
    try {
      const [seller, currentBidder, previousBidder] = await Promise.all([
        userModel.findById(result.sellerId),
        userModel.findById(result.userId),
        result.previousHighestBidderId && result.previousHighestBidderId !== result.userId 
          ? userModel.findById(result.previousHighestBidderId) 
          : null
      ]);

      const emailPromises = [];

      if (seller && seller.email) {
        emailPromises.push(sendMail({
        to: seller.email,
        subject: `💰 New bid on your product: ${result.productName}`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <div style="background: linear-gradient(135deg, #72AEC8 0%, #5a9ab8 100%); padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
              <h1 style="color: white; margin: 0;">New Bid Received!</h1>
            </div>
            <div style="background-color: #f8f9fa; padding: 30px; border-radius: 0 0 10px 10px;">
              <p>Dear <strong>${seller.fullname}</strong>,</p>
              <p>Great news! Your product has received a new bid:</p>
              <div style="background-color: white; padding: 20px; border-radius: 10px; margin: 20px 0; border-left: 4px solid #72AEC8;">
                <h3 style="margin: 0 0 15px 0; color: #333;">${result.productName}</h3>
                <p style="margin: 5px 0;"><strong>Bidder:</strong> ${currentBidder ? currentBidder.fullname : 'Anonymous'}</p>
                <p style="margin: 5px 0;"><strong>Current Price:</strong></p>
                <p style="font-size: 28px; color: #72AEC8; margin: 5px 0; font-weight: bold;">
                  ${new Intl.NumberFormat('en-US').format(result.newCurrentPrice)} VND
                </p>
                ${result.previousPrice !== result.newCurrentPrice ? `
                <p style="margin: 5px 0; color: #666; font-size: 14px;">
                  <i>Previous: ${new Intl.NumberFormat('en-US').format(result.previousPrice)} VND</i>
                </p>
                ` : ''}
              </div>
              ${result.productSold ? `
              <div style="background-color: #d4edda; padding: 15px; border-radius: 5px; margin: 15px 0;">
                <p style="margin: 0; color: #155724;"><strong>🎉 Buy Now price reached!</strong> Auction has ended.</p>
              </div>
              ` : ''}
              <div style="text-align: center; margin: 30px 0;">
                <a href="${productUrl}" style="display: inline-block; background: linear-gradient(135deg, #72AEC8 0%, #5a9ab8 100%); color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; font-weight: bold;">
                  View Product
                </a>
              </div>
            </div>
            <p style="color: #888; font-size: 12px; text-align: center; margin-top: 20px;">This is an automated message from Online Auction.</p>
          </div>
        `
        }));
      }

      if (currentBidder && currentBidder.email) {
        const isWinning = result.newHighestBidderId === result.userId;
        emailPromises.push(sendMail({
        to: currentBidder.email,
        subject: isWinning 
          ? `✅ You're winning: ${result.productName}` 
          : `📊 Bid placed: ${result.productName}`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <div style="background: linear-gradient(135deg, ${isWinning ? '#28a745' : '#ffc107'} 0%, ${isWinning ? '#218838' : '#e0a800'} 100%); padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
              <h1 style="color: white; margin: 0;">${isWinning ? "You're Winning!" : "Bid Placed"}</h1>
            </div>
            <div style="background-color: #f8f9fa; padding: 30px; border-radius: 0 0 10px 10px;">
              <p>Dear <strong>${currentBidder.fullname}</strong>,</p>
              <p>${isWinning 
                ? 'Congratulations! Your bid has been placed and you are currently the highest bidder!' 
                : 'Your bid has been placed. However, another bidder has a higher maximum bid.'}</p>
              <div style="background-color: white; padding: 20px; border-radius: 10px; margin: 20px 0; border-left: 4px solid ${isWinning ? '#28a745' : '#ffc107'};">
                <h3 style="margin: 0 0 15px 0; color: #333;">${result.productName}</h3>
                <p style="margin: 5px 0;"><strong>Your Max Bid:</strong> ${new Intl.NumberFormat('en-US').format(result.bidAmount)} VND</p>
                <p style="margin: 5px 0;"><strong>Current Price:</strong></p>
                <p style="font-size: 28px; color: ${isWinning ? '#28a745' : '#ffc107'}; margin: 5px 0; font-weight: bold;">
                  ${new Intl.NumberFormat('en-US').format(result.newCurrentPrice)} VND
                </p>
              </div>
              ${result.productSold && isWinning ? `
              <div style="background-color: #d4edda; padding: 15px; border-radius: 5px; margin: 15px 0;">
                <p style="margin: 0; color: #155724;"><strong>🎉 Congratulations! You won this product!</strong></p>
                <p style="margin: 10px 0 0 0; color: #155724;">Please proceed to complete your payment.</p>
              </div>
              ` : ''}
              ${!isWinning ? `
              <div style="background-color: #fff3cd; padding: 15px; border-radius: 5px; margin: 15px 0;">
                <p style="margin: 0; color: #856404;"><strong>💡 Tip:</strong> Consider increasing your maximum bid to improve your chances of winning.</p>
              </div>
              ` : ''}
              <div style="text-align: center; margin: 30px 0;">
                <a href="${productUrl}" style="display: inline-block; background: linear-gradient(135deg, #72AEC8 0%, #5a9ab8 100%); color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; font-weight: bold;">
                  ${result.productSold && isWinning ? 'Complete Payment' : 'View Auction'}
                </a>
              </div>
            </div>
            <p style="color: #888; font-size: 12px; text-align: center; margin-top: 20px;">This is an automated message from Online Auction.</p>
          </div>
        `
        }));
      }

      if (previousBidder && previousBidder.email && result.priceChanged) {
        const wasOutbid = result.newHighestBidderId !== result.previousHighestBidderId;
        
        emailPromises.push(sendMail({
        to: previousBidder.email,
        subject: wasOutbid 
          ? `⚠️ You've been outbid: ${result.productName}`
          : `📊 Price updated: ${result.productName}`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <div style="background: linear-gradient(135deg, ${wasOutbid ? '#dc3545' : '#ffc107'} 0%, ${wasOutbid ? '#c82333' : '#e0a800'} 100%); padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
              <h1 style="color: white; margin: 0;">${wasOutbid ? "You've Been Outbid!" : "Price Updated"}</h1>
            </div>
            <div style="background-color: #f8f9fa; padding: 30px; border-radius: 0 0 10px 10px;">
              <p>Dear <strong>${previousBidder.fullname}</strong>,</p>
              ${wasOutbid 
                ? `<p>Unfortunately, another bidder has placed a higher bid on the product you were winning:</p>`
                : `<p>Good news! You're still the highest bidder, but the current price has been updated due to a new bid:</p>`
              }
              <div style="background-color: white; padding: 20px; border-radius: 10px; margin: 20px 0; border-left: 4px solid ${wasOutbid ? '#dc3545' : '#ffc107'};">
                <h3 style="margin: 0 0 15px 0; color: #333;">${result.productName}</h3>
                ${!wasOutbid ? `
                <p style="margin: 5px 0; color: #28a745;"><strong>✓ You're still winning!</strong></p>
                ` : ''}
                <p style="margin: 5px 0;"><strong>New Current Price:</strong></p>
                <p style="font-size: 28px; color: ${wasOutbid ? '#dc3545' : '#ffc107'}; margin: 5px 0; font-weight: bold;">
                  ${new Intl.NumberFormat('en-US').format(result.newCurrentPrice)} VND
                </p>
                <p style="margin: 10px 0 0 0; color: #666; font-size: 14px;">
                  <i>Previous price: ${new Intl.NumberFormat('en-US').format(result.previousPrice)} VND</i>
                </p>
              </div>
              ${wasOutbid ? `
              <div style="background-color: #fff3cd; padding: 15px; border-radius: 5px; margin: 15px 0;">
                <p style="margin: 0; color: #856404;"><strong>💡 Don't miss out!</strong> Place a new bid to regain the lead.</p>
              </div>
              ` : `
              <div style="background-color: #d4edda; padding: 15px; border-radius: 5px; margin: 15px 0;">
                <p style="margin: 0; color: #155724;"><strong>💡 Tip:</strong> Your automatic bidding is working! Consider increasing your max bid if you want more protection.</p>
              </div>
              `}
              <div style="text-align: center; margin: 30px 0;">
                <a href="${productUrl}" style="display: inline-block; background: linear-gradient(135deg, ${wasOutbid ? '#28a745' : '#72AEC8'} 0%, ${wasOutbid ? '#218838' : '#5a9ab8'} 100%); color: white; padding: 15px 40px; text-decoration: none; border-radius: 5px; font-weight: bold; font-size: 16px;">
                  ${wasOutbid ? 'Place New Bid' : 'View Auction'}
                </a>
              </div>
            </div>
            <p style="color: #888; font-size: 12px; text-align: center; margin-top: 20px;">This is an automated message from Online Auction.</p>
          </div>
        `
        }));
      }

      if (emailPromises.length > 0) {
        await Promise.all(emailPromises);
        console.log(`${emailPromises.length} bid notification email(s) sent for product #${productId}`);
      }
    } catch (emailError) {
      console.error('Failed to send bid notification emails:', emailError);
    }
  })();
};

const sendCommentNotificationEmails = async ({ productId, content, parentId, userId, req }) => {
  const product = await productModel.findByProductId2(productId, null);
  const commenter = await userModel.findById(userId);
  const seller = await userModel.findById(product.seller_id);
  const productUrl = `${req.protocol}://${req.get('host')}/products/detail?id=${productId}`;

  const isSellerReplying = userId === product.seller_id;

  if (isSellerReplying && parentId) {
    const bidders = await biddingHistoryModel.getUniqueBidders(productId);
    const commenters = await productCommentModel.getUniqueCommenters(productId);

    const recipientsMap = new Map();

    bidders.forEach(b => {
      if (b.id !== product.seller_id && b.email) {
        recipientsMap.set(b.id, { email: b.email, fullname: b.fullname });
      }
    });

    commenters.forEach(c => {
      if (c.id !== product.seller_id && c.email) {
        recipientsMap.set(c.id, { email: c.email, fullname: c.fullname });
      }
    });

    for (const [recipientId, recipient] of recipientsMap) {
      try {
        await sendMail({
          to: recipient.email,
          subject: `Seller answered a question on: ${product.name}`,
          html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
              <h2 style="color: #667eea;">Seller Response on Product</h2>
              <p>Dear <strong>${recipient.fullname}</strong>,</p>
              <p>The seller has responded to a question on a product you're interested in:</p>
              <div style="background-color: #f8f9fa; padding: 20px; border-radius: 10px; margin: 20px 0;">
                <p><strong>Product:</strong> ${product.name}</p>
                <p><strong>Seller:</strong> ${seller.fullname}</p>
                <p><strong>Answer:</strong></p>
                <p style="background-color: white; padding: 15px; border-radius: 5px; border-left: 4px solid #667eea;">${content}</p>
              </div>
              <div style="text-align: center; margin: 30px 0;">
                <a href="${productUrl}" style="display: inline-block; background-color: #667eea; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; font-weight: bold;">
                  View Product
                </a>
              </div>
              <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
              <p style="color: #888; font-size: 12px;">This is an automated message from Online Auction. Please do not reply to this email.</p>
            </div>
          `
        });
      } catch (emailError) {
        console.error(`Failed to send email to ${recipient.email}:`, emailError);
      }
    }
    console.log(`Seller reply notification sent to ${recipientsMap.size} recipients`);
  } else if (seller && seller.email && userId !== product.seller_id) {
    if (parentId) {
      await sendMail({
        to: seller.email,
        subject: `New reply on your product: ${product.name}`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #667eea;">New Reply on Your Product</h2>
            <div style="background-color: #f8f9fa; padding: 20px; border-radius: 10px; margin: 20px 0;">
              <p><strong>Product:</strong> ${product.name}</p>
              <p><strong>From:</strong> ${commenter.fullname}</p>
              <p><strong>Reply:</strong></p>
              <p style="background-color: white; padding: 15px; border-radius: 5px;">${content}</p>
            </div>
            <div style="text-align: center; margin: 30px 0;">
              <a href="${productUrl}" style="display: inline-block; background-color: #667eea; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; font-weight: bold;">
                View Product & Reply
              </a>
            </div>
          </div>
        `
      });
    } else {
      await sendMail({
        to: seller.email,
        subject: `New question about your product: ${product.name}`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #667eea;">New Question About Your Product</h2>
            <div style="background-color: #f8f9fa; padding: 20px; border-radius: 10px; margin: 20px 0;">
              <p><strong>Product:</strong> ${product.name}</p>
              <p><strong>From:</strong> ${commenter.fullname}</p>
              <p><strong>Question:</strong></p>
              <p style="background-color: white; padding: 15px; border-radius: 5px;">${content}</p>
            </div>
            <div style="text-align: center; margin: 30px 0;">
              <a href="${productUrl}" style="display: inline-block; background-color: #667eea; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; font-weight: bold;">
                View Product & Answer
              </a>
            </div>
          </div>
        `
      });
    }
  }
};

const removeBidHistoryForRejectedBidder = async ({ trx, productId, bidderId }) => {
  await trx('bidding_history')
    .where('product_id', productId)
    .where('bidder_id', bidderId)
    .del();
};

const removeAutoBidForRejectedBidder = async ({ trx, productId, bidderId }) => {
  await trx('auto_bidding')
    .where('product_id', productId)
    .where('bidder_id', bidderId)
    .del();
};

const updateProductHighestBidderAndCurrentPrice = async ({ trx, productId, highest_bidder_id, current_price, highest_max_price }) => {
    await trx('products')
      .where('id', productId)
      .update({
        highest_bidder_id: highest_bidder_id,
        current_price: current_price,
        highest_max_price: highest_max_price
      });
}

const recalculateHighestBidderAndCurrentPriceAfterRejection = async ({ trx, product, productId, bidderId }) => {
  const allAutoBids = await trx('auto_bidding')
    .where('product_id', productId)
    .orderBy('max_price', 'desc');

  const bidderIdNum = parseInt(bidderId);
  const highestBidderIdNum = parseInt(product.highest_bidder_id);
  const wasHighestBidder = (highestBidderIdNum === bidderIdNum);

  if (allAutoBids.length === 0) {
    await updateProductHighestBidderAndCurrentPrice({ 
        trx,
        highest_bidder_id: null,
        current_price: product.starting_price,
        highest_max_price: null 
    });
  } else if (allAutoBids.length === 1) {
    const winner = allAutoBids[0];
    const newPrice = product.starting_price;

    await updateProductHighestBidderAndCurrentPrice({
        trx,
        highest_bidder_id: winner.bidder_id,
        current_price: newPrice,
        highest_max_price: winner.max_price
    });

    if (wasHighestBidder || product.current_price !== newPrice) {
      await addBiddingHistory({
        trx,
        productId,
        newHighestBidderId: winner.bidder_id,
        newCurrentPrice: newPrice
      });
    }
  } else if (wasHighestBidder) {
    const firstBidder = allAutoBids[0];
    const secondBidder = allAutoBids[1];
    let newPrice = secondBidder.max_price + product.step_price;

    if (newPrice > firstBidder.max_price) {
      newPrice = firstBidder.max_price;
    }

    await updateProductHighestBidderAndCurrentPrice({
        trx,
        highest_bidder_id: firstBidder.bidder_id,
        current_price: newPrice,
        highest_max_price: firstBidder.max_price,
    });

    const lastHistory = await trx('bidding_history')
      .where('product_id', productId)
      .orderBy('created_at', 'desc')
      .first();

    if (!lastHistory || lastHistory.current_price !== newPrice) {
      await addBiddingHistory({
        trx,
        productId,
        newHighestBidderId: firstBidder.bidder_id,
        newCurrentPrice: newPrice
      });
    }
  }
};

const sendRejectBidderNotificationEmail = ({ rejectedBidderInfo, productInfo, sellerInfo, req, productId }) => {
  if (!rejectedBidderInfo || !rejectedBidderInfo.email || !productInfo) {
    return;
  }

  sendMail({
    to: rejectedBidderInfo.email,
    subject: `Your bid has been rejected: ${productInfo.name}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: linear-gradient(135deg, #dc3545 0%, #c82333 100%); padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
          <h1 style="color: white; margin: 0;">Bid Rejected</h1>
        </div>
        <div style="background-color: #f8f9fa; padding: 30px; border-radius: 0 0 10px 10px;">
          <p>Dear <strong>${rejectedBidderInfo.fullname}</strong>,</p>
          <p>We regret to inform you that the seller has rejected your bid on the following product:</p>
          <div style="background-color: white; padding: 20px; border-radius: 10px; margin: 20px 0; border-left: 4px solid #dc3545;">
            <h3 style="margin: 0 0 10px 0; color: #333;">${productInfo.name}</h3>
            <p style="margin: 5px 0; color: #666;"><strong>Seller:</strong> ${sellerInfo ? sellerInfo.fullname : 'N/A'}</p>
          </div>
          <p style="color: #666;">This means you can no longer place bids on this specific product. Your previous bids on this product have been removed.</p>
          <p style="color: #666;">You can still participate in other auctions on our platform.</p>
          <div style="text-align: center; margin: 30px 0;">
            <a href="${req.protocol}://${req.get('host')}/" style="display: inline-block; background: linear-gradient(135deg, #72AEC8 0%, #5a9ab8 100%); color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; font-weight: bold;">
              Browse Other Auctions
            </a>
          </div>
          <p style="color: #888; font-size: 13px;">If you believe this was done in error, please contact our support team.</p>
        </div>
        <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
        <p style="color: #888; font-size: 12px; text-align: center;">This is an automated message from Online Auction. Please do not reply to this email.</p>
      </div>
    `
  }).then(() => {
    console.log(`Rejection email sent to ${rejectedBidderInfo.email} for product #${productId}`);
  }).catch((emailError) => {
    console.error('Failed to send rejection email:', emailError);
  });
};

const lockProduct = async ({ trx, productId }) => {
    const product = await trx('products')
        .where('id', productId)
        .forUpdate() // This creates a row-level lock
        .first();
    return product;
}

const isBidderRejected = async ({ trx, productId, userId }) => {
    const isRejected = await trx('rejected_bidders')
        .where('product_id', productId)
        .where('bidder_id', userId)
        .first();
    return isRejected;
}

const addBiddingHistory = async ({ trx, productId, newHighestBidderId, newCurrentPrice }) => {
    await trx('bidding_history').insert({
          product_id: productId,
          bidder_id: newHighestBidderId,
          current_price: newCurrentPrice
        });
}

const updateAutoBidding = async ({ trx, productId, userId, bidAmount }) => {
    await trx.raw(`
        INSERT INTO auto_bidding (product_id, bidder_id, max_price)
        VALUES (?, ?, ?)
        ON CONFLICT (product_id, bidder_id)
        DO UPDATE SET 
          max_price = EXCLUDED.max_price,
          created_at = NOW()
      `, [productId, userId, bidAmount]);
}

const getAutoBid = async ({ trx, productId, bidderId }) => {
    const autoBid = await trx('auto_bidding')
        .where('product_id', productId)
        .where('bidder_id', bidderId)
        .first();
    return autoBid;
}

const getUserInfo = async (trx, id) => {
    const info = await trx('users')
        .where('id', id)
        .first();
    return info;
}

const getProductForBuyNow = async (trx, productId) => {
    const product = await trx('products')
        .leftJoin('users as seller', 'products.seller_id', 'seller.id')
        .where('products.id', productId)
        .select('products.*', 'seller.fullname as seller_name')
        .first();
    return product;
}

export const getProductByCategories = async (req, res) => {
  const userId = req.session.authUser ? req.session.authUser.id : null;
  const sort = req.query.sort || '';
  const categoryId = req.query.catid;
  const { page, offset } = getPagination(req.query.page);
  
  // Check if category is level 1 (parent_id is null)
  const category = await categoryModel.findByCategoryId(categoryId);
  
  let categoryIds = [categoryId];
  
  // If it's a level 1 category, include all child categories
  if (category && category.parent_id === null) {
    const childCategories = await categoryModel.findChildCategoryIds(categoryId);
    const childIds = childCategories.map(cat => cat.id);
    categoryIds = [categoryId, ...childIds];
  }
  
  const list = await productModel.findByCategoryIds(categoryIds, limit, offset, sort, userId);
  const products = await prepareProductList(list);
  const total = await productModel.countByCategoryIds(categoryIds);
  console.log('Total products in category:', total.count);
  const { totalCount, nPages, from, to } = getPaginationSummary(total.count, page);
  res.render('vwProduct/list', { 
    products: products,
    totalCount,
    from,
    to,
    currentPage: page,
    totalPages: nPages,
    categoryId: categoryId,
    categoryName: category ? category.name : null,
    sort: sort,
  });
};

export const getProductBySearch = async (req, res) => {
  const userId = req.session.authUser ? req.session.authUser.id : null;
  const q = req.query.q || '';
  const logic = req.query.logic || 'and'; // 'and' or 'or'
  const sort = req.query.sort || '';
  
  // If keyword is empty, return empty results
  if (q.length === 0) {
    return res.render('vwProduct/list', {
        q: q,
        logic: logic,
        sort: sort,
        products: [],
        totalCount: 0,
        from: 0,
        to: 0,
        currentPage: 1,
        totalPages: 0,
    });
  }

  const { page, offset } = getPagination(req.query.page);
  
  // Pass keywords directly without modification
  // plainto_tsquery will handle tokenization automatically
  const keywords = q.trim();
  
  // Search in both product name and category
  const list = await productModel.searchPageByKeywords(keywords, limit, offset, userId, logic, sort);
  const products = await prepareProductList(list);
  const total = await productModel.countByKeywords(keywords, logic);
  const { totalCount, nPages, from, to } = getPaginationSummary(total.count, page);
  
  res.render('vwProduct/list', { 
    products: products,
    totalCount,
    from,
    to,
    currentPage: page,
    totalPages: nPages,
    q: q,
    logic: logic,
    sort: sort,
  });
};


export const getProductDetail = async (req, res) => {
  const userId = req.session.authUser ? req.session.authUser.id : null;
  const productId = req.query.id;
  const product = await productModel.findByProductId2(productId, userId);
  const related_products = await productModel.findRelatedProducts(productId);
  
  // Kiểm tra nếu không tìm thấy sản phẩm
  if (!product) {
    return res.status(404).render('404', { message: 'Product not found' });
  }
  console.log('Product details:', product);
  // Determine product status
  const now = new Date();
  const endDate = new Date(product.end_at);
  let productStatus = 'ACTIVE';
  
  // Auto-close auction if time expired and not yet closed
  if (endDate <= now && !product.closed_at && product.is_sold === null) {
    // Update closed_at to mark auction end time
    await productModel.updateProduct(productId, { closed_at: endDate });
    product.closed_at = endDate; // Update local object
  }

  productStatus = getProductStatus(product);

  // Authorization check: Non-ACTIVE products can only be viewed by seller or highest bidder
  if (productStatus !== 'ACTIVE') {
    if (!userId) {
      // User not logged in, cannot view non-active products
      return res.status(403).render('403', { message: 'You do not have permission to view this product' });
    }
    
    const isSeller = product.seller_id === userId;
    const isHighestBidder = product.highest_bidder_id === userId;
    
    if (!isSeller && !isHighestBidder) {
      return res.status(403).render('403', { message: 'You do not have permission to view this product' });
    }
  }

  // Pagination for comments
  const commentPage = parseInt(req.query.commentPage) || 1;
  const commentsPerPage = 2; // 2 comments per page
  const offset = (commentPage - 1) * commentsPerPage;

  // Load description updates, bidding history, and comments in parallel
  const [descriptionUpdates, biddingHistory, comments, totalComments] = await Promise.all([
    productDescUpdateModel.findByProductId(productId),
    biddingHistoryModel.getBiddingHistory(productId),
    productCommentModel.getCommentsByProductId(productId, commentsPerPage, offset),
    productCommentModel.countCommentsByProductId(productId)
  ]);

  // Load rejected bidders (only for seller)
  let rejectedBidders = [];
  if (req.session.authUser && product.seller_id === req.session.authUser.id) {
    rejectedBidders = await rejectedBidderModel.getRejectedBidders(productId);
  }
  
  // Load replies for all comments in one batch to avoid N+1 query problem
  if (comments.length > 0) {
    const commentIds = comments.map(c => c.id);
    const allReplies = await productCommentModel.getRepliesByCommentIds(commentIds);
    
    // Group replies by parent comment id
    const repliesMap = new Map();
    for (const reply of allReplies) {
      if (!repliesMap.has(reply.parent_id)) {
        repliesMap.set(reply.parent_id, []);
      }
      repliesMap.get(reply.parent_id).push(reply);
    }
    
    // Attach replies to their parent comments
    for (const comment of comments) {
      comment.replies = repliesMap.get(comment.id) || [];
    }
  }
  
  // Calculate total pages
  const totalPages = Math.ceil(totalComments / commentsPerPage);
  
  // Get flash messages from session
  const success_message = req.session.success_message;
  const error_message = req.session.error_message;
  delete req.session.success_message;
  delete req.session.error_message;

  // Get seller rating
  const sellerRatingObject = await reviewModel.calculateRatingPoint(product.seller_id);
  const sellerReviews = await reviewModel.getReviewsByUserId(product.seller_id);
  
  // Get bidder rating (if exists)
  let bidderRatingObject = { rating_point: null };
  let bidderReviews = [];
  if (product.highest_bidder_id) {
    bidderRatingObject = await reviewModel.calculateRatingPoint(product.highest_bidder_id);
    bidderReviews = await reviewModel.getReviewsByUserId(product.highest_bidder_id);
  }
  
  // Check if should show payment button (for seller or highest bidder when status is PENDING)
  let showPaymentButton = false;
  if (req.session.authUser && productStatus === 'PENDING') {
    const userId = req.session.authUser.id;
    showPaymentButton = (product.seller_id === userId || product.highest_bidder_id === userId);
  }
  
  res.render('vwProduct/details', { 
    product,
    productStatus, // Pass status to view
    authUser: req.session.authUser, // Pass authUser for checking highest_bidder_id
    descriptionUpdates,
    biddingHistory,
    rejectedBidders,
    comments,
    success_message,
    error_message,
    related_products,
    seller_rating_point: sellerRatingObject.rating_point,
    seller_has_reviews: sellerReviews.length > 0,
    bidder_rating_point: bidderRatingObject.rating_point,
    bidder_has_reviews: bidderReviews.length > 0,
    commentPage,
    totalPages,
    totalComments,
    showPaymentButton
  });
};

export const getBiddingHistoryPage = async (req, res) => {
  const productId = req.query.id;
  
  if (!productId) {
    return res.redirect('/');
  }

  try {
    // Get product information
    const product = await productModel.findByProductId2(productId, null);
    
    if (!product) {
      return res.status(404).render('404', { message: 'Product not found' });
    }

    // Load bidding history
    const biddingHistory = await biddingHistoryModel.getBiddingHistory(productId);
    
    res.render('vwProduct/biddingHistory', { 
      product,
      biddingHistory
    });
  } catch (error) {
    console.error('Error loading bidding history:', error);
    res.status(500).render('500', { message: 'Unable to load bidding history' });
  }
};

export const addToWatchlist = async (req, res) => {
  const userId = req.session.authUser.id;
  const productId = req.body.productId;

  const isInWatchlist = await watchListModel.isInWatchlist(userId, productId);
  if (!isInWatchlist) {
    await watchListModel.addToWatchlist(userId, productId);
  }

  // SỬA LẠI: Lấy địa chỉ trang trước đó từ header
  // Nếu không tìm thấy (trường hợp hiếm), quay về trang chủ '/'
  const retUrl = req.headers.referer || '/';
  res.redirect(retUrl);
};

export const removeFromWatchlist = async (req, res) => {
  const userId = req.session.authUser.id;
  const productId = req.body.productId;

  await watchListModel.removeFromWatchlist(userId, productId);

  // SỬA LẠI: Tương tự như trên
  const retUrl = req.headers.referer || '/';
  res.redirect(retUrl);
};

export const placeBid = async (req, res) => {
  const userId = req.session.authUser.id;
  const productId = parseInt(req.body.productId);
  const bidAmount = parseFloat(req.body.bidAmount.replace(/,/g, ''));

  try {
    // Use transaction with row-level locking to prevent race conditions
    const result = await db.transaction(async (trx) => {
      // 1. Lock the product row for update to prevent concurrent modifications
      const product = await lockProduct({ trx, productId });
      
      if (!product) {
        throw new Error('Product not found');
      }

      // Store previous highest bidder info for email notification
      const previousHighestBidderId = product.highest_bidder_id;
      const previousPrice = parseFloat(product.current_price || product.starting_price);

      // 2. Check if product is already sold
      if (product.is_sold === true) {
        throw new Error('This product has already been sold');
      }

      // 3. Check if seller cannot bid on their own product
      if (product.seller_id === userId) {
        throw new Error('You cannot bid on your own product');
      }

      // 4. Check if bidder has been rejected
      const isRejected = await isBidderRejected({ trx, productId, userId });
      
      if (isRejected) {
        throw new Error('You have been rejected from bidding on this product by the seller');
      }

      // 5. Check rating point
      const ratingPoint = await reviewModel.calculateRatingPoint(userId);
      const userReviews = await reviewModel.getReviewsByUserId(userId);
      const hasReviews = userReviews.length > 0;
      
      if (!hasReviews) {
        // User has no reviews yet (unrated)
        if (!product.allow_unrated_bidder) {
          throw new Error('This seller does not allow unrated bidders to bid on this product.');
        }
      } else if (ratingPoint.rating_point < 0) {
        throw new Error('You are not eligible to place bids due to your rating.');
      } else if (ratingPoint.rating_point === 0) {
        throw new Error('You are not eligible to place bids due to your rating.');
      } else if (ratingPoint.rating_point <= 0.8) {
        throw new Error('Your rating point is not greater than 80%. You cannot place bids.');
      }

      // 6. Check if auction has ended
      const now = new Date();
      const endDate = new Date(product.end_at);
      if (now > endDate) {
        throw new Error('Auction has ended');
      }

      // 7. Validate bid amount against current price
      const currentPrice = parseFloat(product.current_price || product.starting_price);
      
      // bidAmount đã được validate ở frontend là phải > currentPrice
      // Nhưng vẫn kiểm tra lại để đảm bảo
      if (bidAmount <= currentPrice) {
        throw new Error(`Bid must be higher than current price (${currentPrice.toLocaleString()} VND)`);
      }

      // 8. Check minimum bid increment
      const minIncrement = parseFloat(product.step_price);
      if (bidAmount < currentPrice + minIncrement) {
        throw new Error(`Bid must be at least ${minIncrement.toLocaleString()} VND higher than current price`);
      }

      // 9. Check and apply auto-extend if needed
      let extendedEndTime = null;
      if (product.auto_extend) {
        // Get system settings for auto-extend configuration
        const settings = await systemSettingModel.getSettings();
        const triggerMinutes = settings?.auto_extend_trigger_minutes;
        const extendMinutes = settings?.auto_extend_duration_minutes;
        
        // Calculate time remaining until auction ends
        const endTime = new Date(product.end_at);
        const minutesRemaining = (endTime - now) / (1000 * 60);
        
        // If within trigger window, extend the auction
        if (minutesRemaining <= triggerMinutes) {
          extendedEndTime = new Date(endTime.getTime() + extendMinutes * 60 * 1000);
          
          // Update end_at in the product object for subsequent checks
          product.end_at = extendedEndTime;
        }
      }

      const {
        newCurrentPrice,
        newHighestBidderId,
        newHighestMaxPrice,
        shouldCreateHistory,
        productSold
      } = processAutoBid({ product, userId, bidAmount, minIncrement });

      // 8. Update product with new price, highest bidder, and highest max price
      const updateData = {
        current_price: newCurrentPrice,
        highest_bidder_id: newHighestBidderId,
        highest_max_price: newHighestMaxPrice
      };

      // If buy now price is reached, close auction immediately - takes priority over auto-extend
      if (productSold) {
        updateData.end_at = new Date();
        updateData.closed_at = new Date();
        // is_sold remains NULL → Product goes to PENDING status (waiting for payment)
      }
      // If auto-extend was triggered and product NOT sold, update end_at
      else if (extendedEndTime) {
        updateData.end_at = extendedEndTime;
      }

      await trx('products')
        .where('id', productId)
        .update(updateData);

      // 9. Add bidding history record only if price changed
      // Record ghi lại người đang nắm giá sau khi tính toán automatic bidding
      if (shouldCreateHistory) {
        await addBiddingHistory({ trx, productId, newHighestBidderId, newCurrentPrice });
      }

      // 10. Update auto_bidding table for the bidder
      // Sử dụng raw query để upsert (insert or update)
      await updateAutoBidding({ trx, productId, userId, bidAmount });

      return { 
        newCurrentPrice, 
        newHighestBidderId, 
        userId, 
        bidAmount,
        productSold,
        autoExtended: !!extendedEndTime,
        newEndTime: extendedEndTime,
        productName: product.name,
        sellerId: product.seller_id,
        previousHighestBidderId,
        previousPrice,
        priceChanged: previousPrice !== newCurrentPrice
      };
    });

    sendBidNotificationEmails(req, productId, result);

    let baseMessage = '';
    if (result.productSold) {
      // Sản phẩm đã đạt giá buy now và chuyển sang PENDING (chờ thanh toán)
      if (result.newHighestBidderId === result.userId) {
        // Người đặt giá này thắng và trigger buy now
        baseMessage = `Congratulations! You won the product with Buy Now price: ${result.newCurrentPrice.toLocaleString()} VND. Please proceed to payment.`;
      } else {
        // Người đặt giá này KHÔNG thắng nhưng đã trigger buy now cho người khác
        baseMessage = `Product has been sold to another bidder at Buy Now price: ${result.newCurrentPrice.toLocaleString()} VND. Your bid helped reach the Buy Now threshold.`;
      }
    } else if (result.newHighestBidderId === result.userId) {
      baseMessage = `Bid placed successfully! Current price: ${result.newCurrentPrice.toLocaleString()} VND (Your max: ${result.bidAmount.toLocaleString()} VND)`;
    } else {
      baseMessage = `Bid placed! Another bidder is currently winning at ${result.newCurrentPrice.toLocaleString()} VND`;
    }
    
    // Add auto-extend notification if applicable
    if (result.autoExtended) {
      const extendedTimeStr = new Date(result.newEndTime).toLocaleString('vi-VN');
      baseMessage += ` | Auction extended to ${extendedTimeStr}`;
    }
    
    req.session.success_message = baseMessage;
    res.redirect(`/products/detail?id=${productId}`);

  } catch (error) {
    console.error('Bid error:', error);
    req.session.error_message = error.message || 'An error occurred while placing bid. Please try again.';
    res.redirect(`/products/detail?id=${productId}`);
  }
};

export const postComment = async (req, res) => {
  const { productId, content, parentId } = req.body;
  const userId = req.session.authUser.id;

  try {
    if (!content || content.trim().length === 0) {
      req.session.error_message = 'Comment cannot be empty';
      return res.redirect(`/products/detail?id=${productId}`);
    }

    // Create comment
    await productCommentModel.createComment(productId, userId, content.trim(), parentId || null);

    await sendCommentNotificationEmails({ productId, content, parentId, userId, req });

    req.session.success_message = 'Comment posted successfully!';
    res.redirect(`/products/detail?id=${productId}`);

  } catch (error) {
    console.error('Post comment error:', error);
    req.session.error_message = 'Failed to post comment. Please try again.';
    res.redirect(`/products/detail?id=${productId}`);
  }
};

export const getCompleteOrderPage = async (req, res) => {
  const userId = req.session.authUser.id;
  const productId = req.query.id;
  
  if (!productId) {
    return res.redirect('/');
  }
  
  const product = await productModel.findByProductId2(productId, userId);
  
  if (!product) {
    return res.status(404).render('404', { message: 'Product not found' });
  }
  
  // Determine product status
  const productStatus = getProductStatus(product);
  
  // Only PENDING products can access this page
  if (productStatus !== 'PENDING') {
    return res.redirect(`/products/detail?id=${productId}`);
  }
  
  // Only seller or highest bidder can access
  const isSeller = product.seller_id === userId;
  const isHighestBidder = product.highest_bidder_id === userId;
  
  if (!isSeller && !isHighestBidder) {
    return res.status(403).render('403', { message: 'You do not have permission to access this page' });
  }
  
  // Fetch or create order
  let order = await orderModel.findByProductId(productId);
  
  if (!order) {
    // Auto-create order if not exists (trigger should handle this, but fallback)
    const orderData = {
      product_id: productId,
      buyer_id: product.highest_bidder_id,
      seller_id: product.seller_id,
      final_price: product.current_price || product.highest_bid || 0
    };
    await orderModel.createOrder(orderData);
    order = await orderModel.findByProductId(productId);
  }
  
  // Fetch invoices
  let paymentInvoice = await invoiceModel.getPaymentInvoice(order.id);
  let shippingInvoice = await invoiceModel.getShippingInvoice(order.id);
  
  // Parse PostgreSQL arrays to JavaScript arrays
  if (paymentInvoice && paymentInvoice.payment_proof_urls) {
    console.log('Original payment_proof_urls:', paymentInvoice.payment_proof_urls);
    console.log('Type:', typeof paymentInvoice.payment_proof_urls);
    
    if (typeof paymentInvoice.payment_proof_urls === 'string') {
      paymentInvoice.payment_proof_urls = parseProofUrls(paymentInvoice.payment_proof_urls);
      console.log('Parsed payment_proof_urls:', paymentInvoice.payment_proof_urls);
    }
  }
  
  if (shippingInvoice && shippingInvoice.shipping_proof_urls) {
    if (typeof shippingInvoice.shipping_proof_urls === 'string') {
      shippingInvoice.shipping_proof_urls = parseProofUrls(shippingInvoice.shipping_proof_urls);
    }
  }
  
  // Fetch chat messages
  const messages = await orderChatModel.getMessagesByOrderId(order.id);
  
  res.render('vwProduct/complete-order', {
    product,
    order,
    paymentInvoice,
    shippingInvoice,
    messages,
    isSeller,
    isHighestBidder,
    currentUserId: userId
  });
};

export const uploadOrderImages = async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'No files uploaded' });
    }
    
    const urls = req.files.map(file => `uploads/${file.filename}`);
    res.json({ success: true, urls });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: error.message || 'Upload failed' });
  }
};

export const submitPayment = async (req, res) => {
  try {
    const orderId = req.params.orderId;
    const userId = req.session.authUser.id;
    const { payment_method, payment_proof_urls, note, shipping_address, shipping_phone } = req.body;
    
    const order = await orderModel.findById(orderId);
    if (!isOrderBuyer(order, userId)) {
      return res.status(403).json({ error: 'Unauthorized' });
    }
    
    // Create payment invoice
    await invoiceModel.createPaymentInvoice({
      order_id: orderId,
      issuer_id: userId,
      payment_method,
      payment_proof_urls,
      note
    });
    
    // Update order
    await orderModel.updateShippingInfo(orderId, {
      shipping_address,
      shipping_phone
    });
    
    await orderModel.updateStatus(orderId, 'payment_submitted', userId);
    
    res.json({ success: true, message: 'Payment submitted successfully' });
  } catch (error) {
    console.error('Submit payment error:', error);
    res.status(500).json({ error: error.message || 'Failed to submit payment' });
  }
};

export const confirmPayment = async (req, res) => {
  try {
    const orderId = req.params.orderId;
    const userId = req.session.authUser.id;
    
    const order = await orderModel.findById(orderId);
    if (!isOrderSeller(order, userId)) {
      return res.status(403).json({ error: 'Unauthorized' });
    }
    
    // Verify payment invoice
    const paymentInvoice = await invoiceModel.getPaymentInvoice(orderId);
    if (!paymentInvoice) {
      return res.status(400).json({ error: 'No payment invoice found' });
    }
    
    await invoiceModel.verifyInvoice(paymentInvoice.id);
    await orderModel.updateStatus(orderId, 'payment_confirmed', userId);
    
    res.json({ success: true, message: 'Payment confirmed successfully' });
  } catch (error) {
    console.error('Confirm payment error:', error);
    res.status(500).json({ error: error.message || 'Failed to confirm payment' });
  }
};

export const submitShipping = async (req, res) => {
  try {
    const orderId = req.params.orderId;
    const userId = req.session.authUser.id;
    const { tracking_number, shipping_provider, shipping_proof_urls, note } = req.body;
    
    const order = await orderModel.findById(orderId);
    if (!isOrderSeller(order, userId)) {
      return res.status(403).json({ error: 'Unauthorized' });
    }
    
    // Create shipping invoice
    await invoiceModel.createShippingInvoice({
      order_id: orderId,
      issuer_id: userId,
      tracking_number,
      shipping_provider,
      shipping_proof_urls,
      note
    });
    
    await orderModel.updateStatus(orderId, 'shipped', userId);
    
    res.json({ success: true, message: 'Shipping info submitted successfully' });
  } catch (error) {
    console.error('Submit shipping error:', error);
    res.status(500).json({ error: error.message || 'Failed to submit shipping' });
  }
};

export const confirmDelivery = async (req, res) => {
  try {
    const orderId = req.params.orderId;
    const userId = req.session.authUser.id;
    
    const order = await orderModel.findById(orderId);
    if (!isOrderBuyer(order, userId)) {
      return res.status(403).json({ error: 'Unauthorized' });
    }
    
    await orderModel.updateStatus(orderId, 'delivered', userId);
    
    res.json({ success: true, message: 'Delivery confirmed successfully' });
  } catch (error) {
    console.error('Confirm delivery error:', error);
    res.status(500).json({ error: error.message || 'Failed to confirm delivery' });
  }
};

export const submitRating = async (req, res) => {
  try {
    const orderId = req.params.orderId;
    const userId = req.session.authUser.id;
    const { rating, comment } = req.body;
    
    const order = await orderModel.findById(orderId);
    if (!isOrderParticipant(order, userId)) {
      return res.status(403).json({ error: 'Unauthorized' });
    }
    
    // Determine who is being rated
    const isBuyer = order.buyer_id === userId;
    const reviewerId = userId;
    const revieweeId = isBuyer ? order.seller_id : order.buyer_id;
    
    // Convert rating to number (positive = 1, negative = -1)
    const ratingValue = rating === 'positive' ? 1 : -1;
    
    // Check if already rated
    const existingReview = await reviewModel.findByReviewerAndProduct(reviewerId, order.product_id);
    
    if (existingReview) {
      // Update existing review
      await reviewModel.updateByReviewerAndProduct(reviewerId, order.product_id, {
        rating: ratingValue,
        comment: comment || null
      });
    } else {
      // Create new review (using existing create function)
      await reviewModel.create({
        reviewer_id: reviewerId,
        reviewed_user_id: revieweeId,
        product_id: order.product_id,
        rating: ratingValue,
        comment: comment || null
      });
    }
    
    if (await isTransactionCompletedByBothParties(order)) {
      // Both completed, mark order as completed
      await orderModel.updateStatus(orderId, 'completed', userId);
      
      // Update product as sold and set closed_at to payment completion time
      await db('products').where('id', order.product_id).update({ 
        is_sold: true,
        closed_at: new Date()
      });
    }
    
    res.json({ success: true, message: 'Rating submitted successfully' });
  } catch (error) {
    console.error('Submit rating error:', error);
    res.status(500).json({ error: error.message || 'Failed to submit rating' });
  }
};

export const completeTransaction = async (req, res) => {
  try {
    const orderId = req.params.orderId;
    const userId = req.session.authUser.id;
    
    const order = await orderModel.findById(orderId);
    if (!isOrderParticipant(order, userId)) {
      return res.status(403).json({ error: 'Unauthorized' });
    }
    
    // Determine who is being rated
    const isBuyer = order.buyer_id === userId;
    const reviewerId = userId;
    const revieweeId = isBuyer ? order.seller_id : order.buyer_id;
    
    // Create review record with rating=0 to indicate "skipped"
    const existingReview = await reviewModel.findByReviewerAndProduct(reviewerId, order.product_id);
    
    if (!existingReview) {
      await reviewModel.create({
        reviewer_id: reviewerId,
        reviewed_user_id: revieweeId,
        product_id: order.product_id,
        rating: 0, // 0 means skipped
        comment: null
      });
    }
    
    if (await isTransactionCompletedByBothParties(order)) {
      // Both completed, mark order as completed
      await orderModel.updateStatus(orderId, 'completed', userId);
      
      // Update product as sold and set closed_at to payment completion time
      await db('products').where('id', order.product_id).update({ 
        is_sold: true,
        closed_at: new Date()
      });
    }
    
    res.json({ success: true, message: 'Transaction completed' });
  } catch (error) {
    console.error('Complete transaction error:', error);
    res.status(500).json({ error: error.message || 'Failed to complete transaction' });
  }
};

export const sendMessage = async (req, res) => {
  try {
    const orderId = req.params.orderId;
    const userId = req.session.authUser.id;
    const { message } = req.body;
    
    const order = await orderModel.findById(orderId);
    if (!isOrderParticipant(order, userId)) {
      return res.status(403).json({ error: 'Unauthorized' });
    }
    
    await orderChatModel.sendMessage({
      order_id: orderId,
      sender_id: userId,
      message
    });
    
    res.json({ success: true, message: 'Message sent successfully' });
  } catch (error) {
    console.error('Send message error:', error);
    res.status(500).json({ error: error.message || 'Failed to send message' });
  }
};

export const getOrderMessages = async (req, res) => {
  try {
    const orderId = req.params.orderId;
    const userId = req.session.authUser.id;
    
    const order = await orderModel.findById(orderId);
    if (!isOrderParticipant(order, userId)) {
      return res.status(403).json({ error: 'Unauthorized' });
    }
    
    // Get messages
    const messages = await orderChatModel.getMessagesByOrderId(orderId);
    
    // Generate HTML for messages
    let messagesHtml = '';
    messages.forEach(msg => {
      const isSent = msg.sender_id === userId;
      const messageClass = isSent ? 'text-end' : '';
      const bubbleClass = isSent ? 'sent' : 'received';
      
      // Format date: HH:mm:ss DD/MM/YYYY
      const msgDate = new Date(msg.created_at);
      const year = msgDate.getFullYear();
      const month = String(msgDate.getMonth() + 1).padStart(2, '0');
      const day = String(msgDate.getDate()).padStart(2, '0');
      const hour = String(msgDate.getHours()).padStart(2, '0');
      const minute = String(msgDate.getMinutes()).padStart(2, '0');
      const second = String(msgDate.getSeconds()).padStart(2, '0');
      const formattedDate = `${hour}:${minute}:${second} ${day}/${month}/${year}`;
      
      messagesHtml += `
        <div class="chat-message ${messageClass}">
          <div class="chat-bubble ${bubbleClass}">
            <div>${msg.message}</div>
            <div style="font-size: 0.7rem; margin-top: 3px; opacity: 0.8;">${formattedDate}</div>
          </div>
        </div>
      `;
    });
    
    res.json({ success: true, messagesHtml });
  } catch (error) {
    console.error('Get messages error:', error);
    res.status(500).json({ error: error.message || 'Failed to get messages' });
  }
};

export const rejectBidder = async (req, res) => {
  const { productId, bidderId } = req.body;
  const sellerId = req.session.authUser.id;

  try {
    let rejectedBidderInfo = null;
    let productInfo = null;
    let sellerInfo = null;

    // Use transaction to ensure data consistency
    await db.transaction(async (trx) => {
      // 1. Lock and verify product ownership
      const product = await lockProduct({ trx, productId });

      if (!product) {
        throw new Error('Product not found');
      }

      if (product.seller_id !== sellerId) {
        throw new Error('Only the seller can reject bidders');
      }

      // Check product status - only allow rejection for ACTIVE products
      const now = new Date();
      const endDate = new Date(product.end_at);
      
      if (product.is_sold !== null || endDate <= now || product.closed_at) {
        throw new Error('Can only reject bidders for active auctions');
      }

      // 2. Check if bidder has actually bid on this product
      const autoBid = await getAutoBid({ trx, productId, bidderId });

      if (!autoBid) {
        throw new Error('This bidder has not placed a bid on this product');
      }

      // Get bidder info for email notification
      rejectedBidderInfo = await getUserInfo(trx, bidderId);
      
      productInfo = product;
      sellerInfo = await getUserInfo(trx, sellerId);

      // 3. Add to rejected_bidders table
      await trx('rejected_bidders').insert({
        product_id: productId,
        bidder_id: bidderId,
        seller_id: sellerId
      }).onConflict(['product_id', 'bidder_id']).ignore();

      await removeBidHistoryForRejectedBidder({ trx, productId, bidderId });
      await removeAutoBidForRejectedBidder({ trx, productId, bidderId });
      await recalculateHighestBidderAndCurrentPriceAfterRejection({ trx, product, productId, bidderId });
    });

    sendRejectBidderNotificationEmail({ rejectedBidderInfo, productInfo, sellerInfo, req, productId });

    res.json({ success: true, message: 'Bidder rejected successfully' });
  } catch (error) {
    console.error('Error rejecting bidder:', error);
    res.status(400).json({ 
      success: false, 
      message: error.message || 'Failed to reject bidder' 
    });
  }
};

export const unrejectBidder = async (req, res) => {
  const { productId, bidderId } = req.body;
  const sellerId = req.session.authUser.id;

  try {
    // Verify product ownership
    const product = await productModel.findByProductId2(productId, sellerId);
    
    if (!product) {
      throw new Error('Product not found');
    }

    if (product.seller_id !== sellerId) {
      throw new Error('Only the seller can unreject bidders');
    }

    // Check product status - only allow unrejection for ACTIVE products
    const now = new Date();
    const endDate = new Date(product.end_at);
    
    if (product.is_sold !== null || endDate <= now || product.closed_at) {
      throw new Error('Can only unreject bidders for active auctions');
    }

    // Remove from rejected_bidders table
    await rejectedBidderModel.unrejectBidder(productId, bidderId);

    res.json({ success: true, message: 'Bidder can now bid on this product again' });
  } catch (error) {
    console.error('Error unrejecting bidder:', error);
    res.status(400).json({ 
      success: false, 
      message: error.message || 'Failed to unreject bidder' 
    });
  }
};

export const buyNow = async (req, res) => {
  const { productId } = req.body;
  const userId = req.session.authUser.id;

  try {
    await db.transaction(async (trx) => {
      // 1. Get product information
      const product = await getProductForBuyNow(trx, productId);

      if (!product) {
        throw new Error('Product not found');
      }

      // 2. Check if user is the seller
      if (product.seller_id === userId) {
        throw new Error('Seller cannot buy their own product');
      }

      // 3. Check if product is still ACTIVE
      const now = new Date();
      const endDate = new Date(product.end_at);

      if (product.is_sold !== null) {
        throw new Error('Product is no longer available');
      }

      if (endDate <= now || product.closed_at) {
        throw new Error('Auction has already ended');
      }

      // 4. Check if buy_now_price exists
      if (!product.buy_now_price) {
        throw new Error('Buy Now option is not available for this product');
      }

      const buyNowPrice = parseFloat(product.buy_now_price);

      // 5. Check if bidder is rejected
      const isRejected = await isBidderRejected({ trx, productId, userId });

      if (isRejected) {
        throw new Error('You have been rejected from bidding on this product');
      }

      // 6. Check if bidder is unrated and product doesn't allow unrated bidders
      if (!product.allow_unrated_bidder) {
        const bidder = await trx('users').where('id', userId).first();
        const ratingData = await reviewModel.calculateRatingPoint(userId);
        const ratingPoint = ratingData ? ratingData.rating_point : 0;
        
        if (ratingPoint === 0) {
          throw new Error('This product does not allow bidders without ratings');
        }
      }

      // 7. Close the auction immediately at buy now price
      // Mark as buy_now_purchase to distinguish from regular bidding wins
      await trx('products')
        .where('id', productId)
        .update({
          current_price: buyNowPrice,
          highest_bidder_id: userId,
          highest_max_price: buyNowPrice,
          end_at: now,
          closed_at: now,
          is_buy_now_purchase: true
        });

      // 8. Create bidding history record
      // Mark this record as a Buy Now purchase (not a regular bid)
      await trx('bidding_history').insert({
        product_id: productId,
        bidder_id: userId,
        current_price: buyNowPrice,
        is_buy_now: true
      });
    

      // Note: We do NOT insert into auto_bidding table for Buy Now purchases
      // Reason: Buy Now is a direct purchase, not an auto bid. If we insert here,
      // it could create inconsistency where another bidder has higher max_price 
      // in auto_bidding table but this user is the highest_bidder in products table.
      // The bidding_history record above is sufficient to track this purchase.
    });

    res.json({ 
      success: true, 
      message: 'Congratulations! You have successfully purchased the product at Buy Now price. Please proceed to payment.',
      redirectUrl: `/products/complete-order?id=${productId}`
    });

  } catch (error) {
    console.error('Buy Now error:', error);
    res.status(400).json({ 
      success: false, 
      message: error.message || 'Failed to purchase product' 
    });
  }
};

export const getSellerRatings = async (req, res) => {
  try {
    const sellerId = parseInt(req.params.sellerId);
    
    if (!sellerId) {
      return res.redirect('/');
    }
    
    // Get seller info
    const seller = await userModel.findById(sellerId);
    if (!seller) {
      return res.redirect('/');
    }
    
    // Get rating point
    const ratingData = await reviewModel.calculateRatingPoint(sellerId);
    const rating_point = ratingData ? ratingData.rating_point : 0;
    
    // Get all reviews
    const reviews = await reviewModel.getReviewsByUserId(sellerId);
    
    // Calculate statistics
    const totalReviews = reviews.length;
    const positiveReviews = reviews.filter(r => r.rating === 1).length;
    const negativeReviews = reviews.filter(r => r.rating === -1).length;
    
    res.render('vwProduct/seller-ratings', {
      sellerName: seller.fullname,
      rating_point,
      totalReviews,
      positiveReviews,
      negativeReviews,
      reviews
    });
    
  } catch (error) {
    console.error('Error loading seller ratings page:', error);
    res.redirect('/');
  }
};

export const getBidderRatings = async (req, res) => {
  try {
    const bidderId = parseInt(req.params.bidderId);
    
    if (!bidderId) {
      return res.redirect('/');
    }
    
    // Get bidder info
    const bidder = await userModel.findById(bidderId);
    if (!bidder) {
      return res.redirect('/');
    }
    
    // Get rating point
    const ratingData = await reviewModel.calculateRatingPoint(bidderId);
    const rating_point = ratingData ? ratingData.rating_point : 0;
    
    // Get all reviews
    const reviews = await reviewModel.getReviewsByUserId(bidderId);
    
    // Calculate statistics
    const totalReviews = reviews.length;
    const positiveReviews = reviews.filter(r => r.rating === 1).length;
    const negativeReviews = reviews.filter(r => r.rating === -1).length;
    
    // Mask bidder name
    const maskedName = bidder.fullname ? bidder.fullname.split('').map((char, index) => 
      index % 2 === 0 ? char : '*'
    ).join('') : '';
    
    res.render('vwProduct/bidder-ratings', {
      bidderName: maskedName,
      rating_point,
      totalReviews,
      positiveReviews,
      negativeReviews,
      reviews
    });
    
  } catch (error) {
    console.error('Error loading bidder ratings page:', error);
    res.redirect('/');
  }
};