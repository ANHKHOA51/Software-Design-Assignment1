/**
 * Auction End Notifier
 * Script kiểm tra và gửi email thông báo khi đấu giá kết thúc
 */

import * as productModel from '../models/product.model.js';
import { sendMail } from '../utils/mailer.js';
import * as mailService from '../services/mailService.js'

/**
 * Kiểm tra các đấu giá kết thúc và gửi email thông báo
 */
export async function checkAndNotifyEndedAuctions() {
  try {
    const endedAuctions = await productModel.getNewlyEndedAuctions();

    if (endedAuctions.length === 0) {
      return;
    }

    console.log(`📧 Found ${endedAuctions.length} ended auctions to notify`);

    for (const auction of endedAuctions) {
      try {
        // Có người thắng
        if (checkWinnerAuction(auction)) {
          // Gửi email cho người thắng
          await notifyWinAuctionBidder(auction)

          // Gửi email cho người bán - Có người thắng
          await notifyWinAuctionSeller(auction)
        } else {
          // Không có người thắng - Chỉ thông báo cho người bán
          await notifyNoWinAuctionSeller(auction)
        }

        // Đánh dấu đã gửi thông báo
        await productModel.markEndNotificationSent(auction.id);

      } catch (emailError) {
        console.error(`❌ Failed to send notification for product #${auction.id}:`, emailError);
      }
    }

  } catch (error) {
    console.error('❌ Error checking ended auctions:', error);
  }
}

function checkWinnerAuction(auction) {
  return auction.highest_bidder_id
}

async function notifyWinAuctionSeller(auction) {
  const productUrl = `${process.env.BASE_URL || 'http://localhost:3005'}/products/detail?id=${auction.id}`;

  if (auction.seller_email) {
    await mailService.sendWinAutionSellerMail(auction, productUrl)
  }
}

async function notifyWinAuctionBidder(auction) {
  const productUrl = `${process.env.BASE_URL || 'http://localhost:3005'}/products/detail?id=${auction.id}`;

  if (auction.winner_email) {
    await mailService.sendWinAutionBidderMail(auction, productUrl)
  }
}

async function notifyNoWinAuctionSeller(auction) {
  const productUrl = `${process.env.BASE_URL || 'http://localhost:3005'}/products/detail?id=${auction.id}`;

  if (auction.seller_email) {
    await mailService.sendNoWinAuctionSellerMail(auction, productUrl)
  }
}

/**
 * Khởi chạy job định kỳ
 * @param {number} intervalSeconds - Khoảng thời gian giữa các lần kiểm tra (giây)
 */
export function startAuctionEndNotifier(intervalSeconds = 30) {
  console.log(`🚀 Auction End Notifier started (checking every ${intervalSeconds} second(s))`);

  // Chạy ngay lần đầu
  checkAndNotifyEndedAuctions();

  // Sau đó chạy định kỳ
  setInterval(checkAndNotifyEndedAuctions, intervalSeconds * 1000);
}
