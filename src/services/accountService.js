import bcrypt from 'bcryptjs';
import * as userModel from '../models/user.model.js';
import * as watchlistModel from '../models/watchlist.model.js';
import * as reviewModel from '../models/review.model.js';
import * as autoBiddingModel from '../models/autoBidding.model.js';
import * as mailService from '../services/mailService.js'

export async function getReviewStatistic(reviews) {
    const reviews = reviewModel.getReviewsByUserId(currentUserId);
    const totalReviews = reviews.length;
    const positiveReviews = reviews.filter(r => r.rating === 1).length;
    const negativeReviews = reviews.filter(r => r.rating === -1).length;
    return { totalReviews, positiveReviews, negativeReviews };
}

export async function updateProfile(userId, input) {
    const currentUser = await userModel.findById(userId);

    if (!currentUser) {
        throw new Error('User not found');
    }

    validateOldPassword(currentUser, input.old_password);
    await validateEmailChange(currentUser, input.email);
    validateNewPassword(currentUser, input.new_password, input.confirm_new_password);

    const entity = buildUpdateEntity(currentUser, input);

    const updatedUser = await userModel.update(userId, entity);
    return sanitizeUser(updatedUser);
}

export async function getRatingPoint(currentUserId) {
    const ratingData = await reviewModel.calculateRatingPoint(currentUserId);
    return ratingData ? ratingData.rating_point : 0;
}

export async function sendResetPasswordOtp(email) {
    const user = await userModel.findByEmail(email);

    if (!user) {
        throw new Error('Email not found.');
    }

    const { otp, expiresAt } = createOTP();

    await userModel.createOtp({
        user_id: user.id,
        otp_code: otp,
        purpose: 'reset_password',
        expires_at: expiresAt,
    });

    await mailService.sendForgotPasswordMail(email, user, otp);

    return true;
}

export async function resendForgotPwOtp(email) {
    const user = userModel.findByEmail(email);
    if (!user) {
        throw new Error('User not found.',)
    }
    const { otp, expiresAt } = createOTP();
    userModel.createOtp({
        user_id: user.id,
        otp_code: otp,
        purpose: 'reset_password',
        expires_at: expiresAt,
    });
    mailService.resendResetPwOtp(email, user, otp);
}

export async function signIn(email, password) {
    const user = await userModel.findByEmail(email);
    if (!user) {
        throw new Error('Invalid email or password');
    }

    const isPasswordValid = bcrypt.compareSync(password, user.password_hash);
    if (!isPasswordValid) {
        throw new Error('Invalid email or password');
    }

    if (!user.email_verified) {
        const { otp, expiresAt } = createOTP(); // 15 phút

        await userModel.createOtp({
            user_id: user.id,
            otp_code: otp,
            purpose: 'verify_email',
            expires_at: expiresAt,
        });

        await mailService.sendOtpMail(email, user, otp);

        return { status: 'otp', email };
    }

    return { status: 'ok', user };
}

export async function registerUser(payload) {
    // payload: { fullname, email, address, password, confirmPassword, recaptchaResponse }
    const { fullname, email, address, password, confirmPassword, recaptchaResponse } = payload;

    const errors = {};
    const old = { fullname, email, address };

    // Validate captcha — sử dụng validateCaptcha nếu bạn đã có sẵn.
    // Nếu validateCaptcha trả về lỗi bằng cách push vào errors, gọi ở đây.
    if (typeof validateCaptcha === 'function') {
        // validateCaptcha có thể mutate errors hoặc throw; ta giả sử nó mutate
        // nếu bạn đã implement như trong project, giữ gọi như cũ:
        await validateCaptcha(recaptchaResponse, errors);
    }

    // Form validation (giữ message như hiện tại)
    if (!fullname) errors.fullname = 'Full name is required';
    if (!address) errors.address = 'Address is required';
    if (!email) errors.email = 'Email is required';

    // Check existing email
    const isEmailExist = await userModel.findByEmail(email);
    if (isEmailExist) errors.email = 'Email is already in use';

    if (!password) errors.password = 'Password is required';
    if (password !== confirmPassword) errors.confirmPassword = 'Passwords do not match';

    // Nếu có lỗi -> trả về structure để controller render
    if (Object.keys(errors).length > 0) {
        return { success: false, errors, old };
    }

    // Tạo user (giữ bcrypt.hashSync)
    const hashedPassword = bcrypt.hashSync(password, 10);

    const user = {
        email,
        fullname,
        address,
        password_hash: hashedPassword,
        role: 'bidder',
    };

    const newUser = await userModel.add(user);

    // Tạo OTP
    const { otp, expiresAt } = createOTP(); // 15 phút

    await userModel.createOtp({
        user_id: newUser.id,
        otp_code: otp,
        purpose: 'verify_email',
        expires_at: expiresAt,
    });

    const verifyUrl = `${process.env.APP_BASE_URL}/account/verify-email?email=${encodeURIComponent(email)}`;

    // Gửi mail (giữ function hiện có)
    await mailService.sendVerifySignupUrl(email, fullname, otp, verifyUrl);

    // Trả success + email để controller redirect
    return { success: true, email };
}

function createOTP() {
    const otp = generateOtp();
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 phút
    return { otp, expiresAt };
}

export async function verifyForgotPwOtp(email, otp) {
    const user = await userModel.findByEmail(email);

    const otpRecord = await userModel.findValidOtp({
        user_id: user.id,
        otp_code: otp,
        purpose: 'reset_password',
    });

    console.log('Verifying OTP for email:', email, ' OTP:', otp);

    if (!otpRecord) {
        console.log('Invalid OTP attempt for email:', email);
        throw new Error('Invalid or expired OTP.')
    }

    await userModel.markOtpUsed(otpRecord.id);
}

export async function verifyEmail(email, otp) {
    const user = await userModel.findByEmail(email);
    if (!user) {
        throw new Error('User not found.')
    }

    const otpRecord = await userModel.findValidOtp({
        user_id: user.id,
        otp_code: otp,
        purpose: 'verify_email',
    });

    if (!otpRecord) {
        throw new Error('Invalid or expired OTP.')
    }

    await userModel.markOtpUsed(otpRecord.id);
    await userModel.verifyUserEmail(user.id);
}

export async function calcWatchListPage(page) {
    const limit = 3;
    const offset = (page - 1) * limit;
    // Implementation for watchlist route
    const currentUserId = req.session.authUser.id;
    const watchlistProducts = await watchlistModel.searchPageByUserId(currentUserId, limit, offset);
    const total = await watchlistModel.countByUserId(currentUserId);
    const totalCount = Number(total.count);
    const nPages = Math.ceil(totalCount / limit);
    let from = (page - 1) * limit + 1;
    let to = page * limit;
    if (to > totalCount) to = totalCount;
    if (totalCount === 0) { from = 0; to = 0; }

    return {
        products: watchlistProducts,
        totalCount,
        from,
        to,
        currentPage: page,
        totalPages: nPages,
    }
}

export async function getWonAuction(currentUserId) {
    const wonAuctions = await autoBiddingModel.getWonAuctionsByBidderId(currentUserId);

    await checkRatedProduct(wonAuctions, currentUserId)

    return wonAuctions
}

export async function rateSeller(currentUserId, productId, payload) {
    const { seller_id, rating, comment } = payload;

    // Validate rating
    const ratingValue = rating === 'positive' ? 1 : -1;

    // Check if already rated
    const existingReview = await reviewModel.findByReviewerAndProduct(currentUserId, productId);
    if (existingReview) {
        // Update existing review instead of creating new
        await reviewModel.updateByReviewerAndProduct(currentUserId, productId, {
            rating: ratingValue,
            comment: comment || null
        });
    } else {
        // Create new review
        await reviewModel.create({
            reviewer_id: currentUserId,
            reviewed_user_id: seller_id,
            product_id: productId,
            rating: ratingValue,
            comment: comment || null
        });
    }
}

export async function updateRateSeller(currentUserId, productId, payload) {
    const { rating, comment } = payload;

    const ratingValue = rating === 'positive' ? 1 : -1;

    // Update review
    await reviewModel.updateByReviewerAndProduct(currentUserId, productId, {
        rating: ratingValue,
        comment: comment || null
    });
}

async function checkRatedProduct(wonAuctions, currentUserId) {
    for (let product of wonAuctions) {
        const review = await reviewModel.findByReviewerAndProduct(currentUserId, product.id);
        // Only show rating if it's not 0 (actual rating, not skip)
        if (review && review.rating !== 0) {
            product.has_rated_seller = true;
            product.seller_rating = review.rating === 1 ? 'positive' : 'negative';
            product.seller_rating_comment = review.comment;
        } else {
            product.has_rated_seller = false;
        }
    }
}

function validateOldPassword(user, oldPassword) {
    if (!user.oauth_provider) {
        if (!oldPassword || !bcrypt.compareSync(oldPassword, user.password_hash)) {
            throw new Error('Password is incorrect!');
        }
    }
}

async function validateEmailChange(user, newEmail) {
    if (newEmail !== user.email) {
        const existingUser = await userModel.findByEmail(newEmail);
        if (existingUser) {
            throw new Error('Email is already in use by another user.');
        }
    }
}

function validateNewPassword(user, newPassword, confirmPassword) {
    if (!user.oauth_provider && newPassword) {
        if (newPassword !== confirmPassword) {
            throw new Error('New passwords do not match.');
        }
    }
}

function buildUpdateEntity(user, input) {
    const entity = {
        email: input.email,
        fullname: input.fullname,
        address: input.address || user.address,
        date_of_birth: input.date_of_birth
            ? new Date(input.date_of_birth)
            : user.date_of_birth
    };

    if (!user.oauth_provider) {
        entity.password_hash = input.new_password
            ? bcrypt.hashSync(input.new_password, 10)
            : user.password_hash;
    }

    return entity;
}

function sanitizeUser(user) {
    delete user.password_hash;
    return user;
}

async function validateCaptcha(recaptchaResponse, errors) {
    if (!recaptchaResponse) {
        errors.captcha = 'Please check the captcha box.';
    } else {
        // Gọi Google API để verify
        const secretKey = process.env.RECAPTCHA_SECRET;
        const verifyUrl = `https://www.google.com/recaptcha/api/siteverify?secret=${secretKey}&response=${recaptchaResponse}`;

        try {
            const response = await fetch(verifyUrl, { method: 'POST' });
            const data = await response.json();
            // data.success trả về true nếu verify thành công
            if (!data.success) {
                errors.captcha = 'Captcha verification failed. Please try again.';
            }
        } catch (err) {
            console.error('Recaptcha error:', err);
            errors.captcha = 'Error connecting to captcha server.';
        }
    }
}

export function generateOtp() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}