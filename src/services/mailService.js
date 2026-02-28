import { sendMail } from '../utils/mailer.js';

export async function sendForgotPasswordMail(email, user, otp) {
  await sendMail({
    to: email,
    subject: 'Password Reset for Your Online Auction Account',
    html: `
      <p>Hi ${user.fullname},</p>
      <p>Your OTP code for password reset is: <strong>${otp}</strong></p>
      <p>This code will expire in 15 minutes.</p>
    `,
  });
}

export async function resendResetPwOtp(email, user, otp) {
  await sendMail({
    to: email,
    subject: 'New OTP for Password Reset',
    html: `
      <p>Hi ${user.fullname},</p>
      <p>Your new OTP code for password reset is: <strong>${otp}</strong></p>
      <p>This code will expire in 15 minutes.</p>
    `,
  });
}


export async function sendOtpMail(email, user, otp) {
  await sendMail({
    to: email,
    subject: 'Verify your Online Auction account',
    html: `
        <p>Hi ${user.fullname},</p>
        <p>Your OTP code is: <strong>${otp}</strong></p>
        <p>This code will expire in 15 minutes.</p>
      `,
  });
}

export async function sendVerifySignupUrl(email, fullname, otp, verifyUrl) {
  await sendMail({
    to: email,
    subject: 'Verify your Online Auction account',
    html: `
        <p>Hi ${fullname},</p>
        <p>Thank you for registering at Online Auction.</p>
        <p>Your OTP code is: <strong>${otp}</strong></p>
        <p>This code will expire in 15 minutes.</p>
        <p>You can enter this code on the verification page, or click the link below:</p>
        <p><a href="${verifyUrl}">Verify your email</a></p>
        <p>If you did not register, please ignore this email.</p>
        `,
  });
}

export async function resendVerifyEmailOtp(email, user, otp) {
  await sendMail({
    to: email,
    subject: 'New OTP for email verification',
    html: `
      <p>Hi ${user.fullname},</p>
      <p>Your new OTP code is: <strong>${otp}</strong></p>
      <p>This code will expire in 15 minutes.</p>
    `,
  });
}

export async function notifyNewAddedDescription(user, product, productUrl, description) {
  sendMail({
    to: user.email,
    subject: `[Auction Update] New description added for "${product.name}"`,
    html: `
                        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                            <div style="background: linear-gradient(135deg, #72AEC8 0%, #5a9bb8 100%); padding: 20px; text-align: center;">
                                <h1 style="color: white; margin: 0;">Product Description Updated</h1>
                            </div>
                            <div style="padding: 20px; background: #f9f9f9;">
                                <p>Hello <strong>${user.fullname}</strong>,</p>
                                <p>The seller has added new information to the product description:</p>
                                <div style="background: white; padding: 15px; border-left: 4px solid #72AEC8; margin: 15px 0;">
                                    <h3 style="margin: 0 0 10px 0; color: #333;">${product.name}</h3>
                                    <p style="margin: 0; color: #666;">Current Price: <strong style="color: #72AEC8;">${new Intl.NumberFormat('en-US').format(product.current_price)} VND</strong></p>
                                </div>
                                <div style="background: #fff8e1; padding: 15px; border-radius: 5px; margin: 15px 0;">
                                    <p style="margin: 0 0 10px 0; font-weight: bold; color: #f57c00;"><i>✉</i> New Description Added:</p>
                                    <div style="color: #333;">${description.trim()}</div>
                                </div>
                                <p>View the product to see the full updated description:</p>
                                <a href="${productUrl}" style="display: inline-block; background: #72AEC8; color: white; padding: 12px 25px; text-decoration: none; border-radius: 5px; margin: 10px 0;">View Product</a>
                                <hr style="border: none; border-top: 1px solid #ddd; margin: 20px 0;">
                                <p style="color: #999; font-size: 12px;">You received this email because you placed a bid or asked a question on this product.</p>
                            </div>
                        </div>
                    `
  })
}

export async function notifyPasswordReset(user, defaultPassword) {
  await sendMail({
    to: user.email,
    subject: 'Your Password Has Been Reset - Online Auction',
    html: `
                        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                            <h2 style="color: #333;">Password Reset Notification</h2>
                            <p>Dear <strong>${user.fullname}</strong>,</p>
                            <p>Your account password has been reset by an administrator.</p>
                            <div style="background-color: #f5f5f5; padding: 15px; border-radius: 5px; margin: 20px 0;">
                                <p style="margin: 0;"><strong>Your new temporary password:</strong></p>
                                <p style="font-size: 24px; color: #e74c3c; margin: 10px 0; font-weight: bold;">${defaultPassword}</p>
                            </div>
                            <p style="color: #e74c3c;"><strong>Important:</strong> Please log in and change your password immediately for security purposes.</p>
                            <p>If you did not request this password reset, please contact our support team immediately.</p>
                            <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
                            <p style="color: #888; font-size: 12px;">This is an automated message from Online Auction. Please do not reply to this email.</p>
                        </div>
                    `
  });
  console.log(`Password reset email sent to ${user.email}`);
}

export async function notifyNewBid(productUrl, seller, result, currentBidder) {
  return sendMail({
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
  })
}

export async function notifyHighestBid(productUrl, currentBidder, isWinning, result) {
  return sendMail({
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
  });
}

export async function notifyOutBid(productUrl, previousBidder, wasOutbid, result) {
  return sendMail({
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
  })
}

export async function notifyQuestionAnswered(productUrl, recipient, seller, product, content) {
  return sendMail({
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
}

export async function notifyNewReply(productUrl, seller, product, commenter, content) {
  return sendMail({
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
  })
}

export async function notifyNewQuestion(productUrl, seller, product, commenter, content) {
  sendMail({
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
  })
}

export async function sendWinAutionSellerMail(auction, productUrl) {
  await sendMail({
    to: auction.seller_email,
    subject: `🔔 Auction Ended: ${auction.name} - Winner Found!`,
    html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                  <div style="background: linear-gradient(135deg, #72AEC8 0%, #5a9ab8 100%); padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
                    <h1 style="color: white; margin: 0;">Auction Ended</h1>
                  </div>
                  <div style="background-color: #f8f9fa; padding: 30px; border-radius: 0 0 10px 10px;">
                    <p>Dear <strong>${auction.seller_name}</strong>,</p>
                    <p>Your auction has ended with a winner!</p>
                    <div style="background-color: white; padding: 20px; border-radius: 10px; margin: 20px 0; border-left: 4px solid #72AEC8;">
                      <h3 style="margin: 0 0 10px 0; color: #333;">${auction.name}</h3>
                      <p style="margin: 5px 0;"><strong>Winner:</strong> ${auction.winner_name}</p>
                      <p style="font-size: 24px; color: #72AEC8; margin: 10px 0 0 0; font-weight: bold;">
                        ${new Intl.NumberFormat('en-US').format(auction.current_price)} VND
                      </p>
                    </div>
                    <p>The winner has been notified to complete payment. You will receive another notification once payment is confirmed.</p>
                    <div style="text-align: center; margin: 30px 0;">
                      <a href="${productUrl}" style="display: inline-block; background: linear-gradient(135deg, #72AEC8 0%, #5a9ab8 100%); color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; font-weight: bold;">
                        View Product
                      </a>
                    </div>
                  </div>
                  <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
                  <p style="color: #888; font-size: 12px; text-align: center;">This is an automated message from Online Auction. Please do not reply to this email.</p>
                </div>
              `
  });
  console.log(`✅ Seller notification sent to ${auction.seller_email} for product #${auction.id}`);

}

export async function sendWinAutionBidderMail(auction, productUrl) {
  await sendMail({
    to: auction.winner_email,
    subject: `🎉 Congratulations! You won the auction: ${auction.name}`,
    html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                  <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
                    <h1 style="color: white; margin: 0;">🎉 You Won!</h1>
                  </div>
                  <div style="background-color: #f8f9fa; padding: 30px; border-radius: 0 0 10px 10px;">
                    <p>Dear <strong>${auction.winner_name}</strong>,</p>
                    <p>Congratulations! You have won the auction for:</p>
                    <div style="background-color: white; padding: 20px; border-radius: 10px; margin: 20px 0; border-left: 4px solid #28a745;">
                      <h3 style="margin: 0 0 10px 0; color: #333;">${auction.name}</h3>
                      <p style="font-size: 24px; color: #28a745; margin: 0; font-weight: bold;">
                        ${new Intl.NumberFormat('en-US').format(auction.current_price)} VND
                      </p>
                    </div>
                    <p>Please complete your payment to finalize the purchase.</p>
                    <div style="text-align: center; margin: 30px 0;">
                      <a href="${productUrl}" style="display: inline-block; background: linear-gradient(135deg, #28a745 0%, #218838 100%); color: white; padding: 15px 40px; text-decoration: none; border-radius: 5px; font-weight: bold; font-size: 16px;">
                        Complete Payment
                      </a>
                    </div>
                    <p style="color: #666; font-size: 14px;">Please complete payment within 3 days to avoid order cancellation.</p>
                  </div>
                  <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
                  <p style="color: #888; font-size: 12px; text-align: center;">This is an automated message from Online Auction. Please do not reply to this email.</p>
                </div>
              `
  });
  console.log(`✅ Winner notification sent to ${auction.winner_email} for product #${auction.id}`);

}

export async function sendNoWinAuctionSellerMail(auction, productUrl) {
  await sendMail({
    to: auction.seller_email,
    subject: `⏰ Auction Ended: ${auction.name} - No Bidders`,
    html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                  <div style="background: linear-gradient(135deg, #6c757d 0%, #495057 100%); padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
                    <h1 style="color: white; margin: 0;">Auction Ended</h1>
                  </div>
                  <div style="background-color: #f8f9fa; padding: 30px; border-radius: 0 0 10px 10px;">
                    <p>Dear <strong>${auction.seller_name}</strong>,</p>
                    <p>Unfortunately, your auction has ended without any bidders.</p>
                    <div style="background-color: white; padding: 20px; border-radius: 10px; margin: 20px 0; border-left: 4px solid #6c757d;">
                      <h3 style="margin: 0 0 10px 0; color: #333;">${auction.name}</h3>
                      <p style="color: #6c757d; margin: 0;">No bids received</p>
                    </div>
                    <p>You can relist this product or create a new auction with adjusted pricing.</p>
                    <div style="text-align: center; margin: 30px 0;">
                      <a href="${process.env.BASE_URL || 'http://localhost:3005'}/seller/add" style="display: inline-block; background: linear-gradient(135deg, #72AEC8 0%, #5a9ab8 100%); color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; font-weight: bold;">
                        Create New Auction
                      </a>
                    </div>
                  </div>
                  <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
                  <p style="color: #888; font-size: 12px; text-align: center;">This is an automated message from Online Auction. Please do not reply to this email.</p>
                </div>
              `
  });
  console.log(`✅ Seller notification (no bidders) sent to ${auction.seller_email} for product #${auction.id}`);

}