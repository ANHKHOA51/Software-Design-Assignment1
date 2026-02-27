import express from 'express';
import { generateOtp } from '../services/accountService.js';
import bcrypt from 'bcryptjs';
import passport from '../utils/passport.js';
import * as userModel from '../models/user.model.js';
import * as upgradeRequestModel from '../models/upgradeRequest.model.js';
import * as autoBiddingModel from '../models/autoBidding.model.js';
import { isAuthenticated } from '../middlewares/auth.mdw.js';
import * as accountService from '../services/accountService.js'
import * as mailService from '../services/mailService.js'

const router = express.Router();

router.get('/ratings', isAuthenticated, async (req, res) => {
  const currentUserId = req.session.authUser.id;

  // // Get rating point
  const rating_point = await accountService.getRatingPoint(currentUserId);
  // // Get all reviews (model already excludes rating=0)

  // // Calculate statistics
  const { totalReviews, positiveReviews, negativeReviews } = await accountService.getReviewStatistic();

  res.render('vwAccount/rating', {
    activeSection: 'ratings',
    rating_point,
    reviews,
    totalReviews,
    positiveReviews,
    negativeReviews
  });
});

// GET /signup
router.get('/signup', function (req, res) {
  // CẬP NHẬT: Truyền Site Key xuống view để hiển thị widget
  res.render('vwAccount/auth/signup', {
    recaptchaSiteKey: process.env.RECAPTCHA_SITE_KEY
  });
});

// GET /signin
router.get('/signin', function (req, res) {
  const success_message = req.session.success_message;
  delete req.session.success_message;
  res.render('vwAccount/auth/signin', { success_message });
});

// GET /verify-email?email=...
router.get('/verify-email', (req, res) => {
  const { email } = req.query;

  if (!email) {
    return res.redirect('/account/signin');
  }

  return res.render('vwAccount/auth/verify-otp', {
    email,
    info_message:
      'We have sent an OTP to your email. Please enter it below to verify your account.',
  });
});

router.get('/forgot-password', (req, res) => {
  res.render('vwAccount/auth/forgot-password');
});

router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;

    await accountService.sendResetPasswordOtp(email);

    return res.render('vwAccount/auth/verify-forgot-password-otp', {
      email,
    });

  } catch (err) {
    return res.render('vwAccount/auth/forgot-password', {
      error_message: err.message,
    });
  }
});

router.post('/verify-forgot-password-otp', async (req, res) => {
  try {
    const { email, otp } = req.body;

    await accountService.verifyForgotPwOtp(email, otp)

    return res.render('vwAccount/auth/reset-password', { email });
  } catch (e) {
    return res.render('vwAccount/auth/verify-forgot-password-otp', {
      email,
      error_message: e.message,
    });
  }
});

router.post('/resend-forgot-password-otp', async (req, res) => {
  try {
    const { email } = req.body;

    await accountService.resendForgotPwOtp(email)

    return res.render('vwAccount/auth/verify-forgot-password-otp', {
      email,
      info_message: 'We have sent a new OTP to your email. Please check your inbox.',
    });
  } catch (e) {
    return res.render('vwAccount/auth/verify-forgot-password-otp', {
      email,
      error_message: e.message,
    });
  }
});

router.post('/reset-password', async (req, res) => {
  const { email, new_password, confirm_new_password } = req.body;
  if (new_password !== confirm_new_password) {
    return res.render('vwAccount/auth/reset-password', {
      email,
      error_message: 'Passwords do not match.',
    });
  }
  const user = await userModel.findByEmail(email);
  if (!user) {
    return res.render('vwAccount/auth/reset-password', {
      email,
      error_message: 'User not found.',
    });
  }
  const hashedPassword = bcrypt.hashSync(new_password, 10);
  await userModel.update(user.id, { password_hash: hashedPassword });
  return res.render('vwAccount/auth/signin', {
    success_message: 'Your password has been reset. You can sign in now.',
  });
});

// POST /signin
router.post('/signin', async function (req, res) {
  const { email, password } = req.body;
  try {
    const result = await accountService.signIn(email, password);

    if (result.status === 'otp') {
      return res.redirect(`/account/verify-email?email=${encodeURIComponent(result.email)}`);
    }

    // status ok
    req.session.isAuthenticated = true;
    req.session.authUser = result.user;
    const returnUrl = req.session.returnUrl || '/';
    delete req.session.returnUrl;
    return res.redirect(returnUrl);

  } catch (err) {
    // Giữ message như ban đầu khi credentials sai.
    const msg = err.message || 'Invalid email or password';

    return res.render('vwAccount/auth/signin', {
      error_message: msg,
      old: { email },
    });
  }
});

// POST /signup
router.post('/signup', async function (req, res) {
  const { fullname, email, address } = req.body;

  try {
    const result = await userService.registerUser({
      fullname: req.body.fullname,
      email: req.body.email,
      address: req.body.address,
      password: req.body.password,
      confirmPassword: req.body.confirmPassword,
      recaptchaResponse: req.body['g-recaptcha-response']
    });

    if (!result.success) {
      return res.render('vwAccount/auth/signup', {
        errors: result.errors,
        old: result.old,
        error_message: 'Please correct the errors below.',
      });
    }

    return res.redirect(`/account/verify-email?email=${encodeURIComponent(result.email)}`);

  } catch (err) {
    console.error(err);
    return res.render('vwAccount/auth/signup', {
      error_message: 'System error. Please try again later.',
      old: { fullname, email, address }
    });
  }
});

// POST /verify-email
router.post('/verify-email', async (req, res) => {
  const { email, otp } = req.body;

  try {
    await accountService.verifyEmail(email, otp)

    req.session.success_message =
      'Your email has been verified. You can sign in now.';
    return res.redirect('/account/signin');
  } catch (e) {
    return res.render('vwAccount/verify-otp', {
      email,
      error_message: e.message,
    });
  }

});

// POST /resend-otp
router.post('/resend-otp', async (req, res) => {
  const { email } = req.body;

  const user = await userModel.findByEmail(email);
  if (!user) {
    return res.render('vwAccount/auth/verify-otp', {
      email,
      error_message: 'User not found.',
    });
  }

  if (user.email_verified) {
    return res.render('vwAccount/auth/signin', {
      success_message: 'Your email is already verified. Please sign in.',
    });
  }

  const otp = generateOtp();
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 phút

  await userModel.createOtp({
    user_id: user.id,
    otp_code: otp,
    purpose: 'verify_email',
    expires_at: expiresAt,
  });

  await mailService.resendVerifyEmailOtp(email, user, otp);

  return res.render('vwAccount/verify-otp', {
    email,
    info_message: 'We have sent a new OTP to your email. Please check your inbox.',
  });
});

// GET /profile - HIỂN THỊ PROFILE & THÔNG BÁO
router.get('/profile', isAuthenticated, async (req, res) => {
  try {
    const currentUserId = req.session.authUser.id;
    const user = await userModel.findById(currentUserId);

    // 1. Kiểm tra query string "success=true" trên URL
    let success_message = null;
    if (req.query.success === 'true') {
      success_message = 'Profile updated successfully.';
    }
    if (req.query['send-request-upgrade'] === 'true') {
      success_message = 'Your upgrade request has been sent successfully.';
    }
    // 2. Render và truyền biến success_message xuống view
    res.render('vwAccount/profile', {
      user: user,
      success_message: success_message // Nếu null thì HBS sẽ không hiện
    });

  } catch (err) {
    console.error(err);
    res.render('vwAccount/profile', {
      user: req.session.authUser,
      err_message: 'Unable to load profile information.'
    });
  }
});

// PUT /profile - XỬ LÝ UPDATE
router.put('/profile', isAuthenticated, async (req, res) => {
  try {
    const userId = req.session.authUser.id;
    const updatedUser = await accountService.updateProfile(userId, req.body);

    req.session.authUser = updatedUser;

    return res.redirect('/account/profile?success=true');

  } catch (err) {
    return res.render('vwAccount/profile', {
      user: req.session.authUser,
      err_message: err.message || 'System error. Please try again later.'
    });
  }
});
router.post('/logout', isAuthenticated, (req, res) => {
  req.session.isAuthenticated = false;
  delete req.session.authUser;
  res.redirect('/');
});
router.get('/request-upgrade', isAuthenticated, async (req, res) => {
  const currentUserId = req.session.authUser.id;
  const upgradeRequest = await upgradeRequestModel.findByUserId(currentUserId);
  res.render('vwAccount/request-upgrade', { upgrade_request: upgradeRequest });
});
router.post('/request-upgrade', isAuthenticated, async (req, res) => {
  try {
    const currentUserId = req.session.authUser.id;
    await userModel.markUpgradePending(currentUserId);
    await upgradeRequestModel.createUpgradeRequest(currentUserId);
    return res.redirect('/account/profile?send-request-upgrade=true');
  } catch (err) {
    console.error(err);
    res.render('vwAccount/profile', {
      user: req.session.authUser,
      err_message: 'Unable to submit your request at this time. Please try again later.'
    });

  }
});
router.get('/watchlist', isAuthenticated, async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  
  const result = await accountService.calcWatchListPage(page)
  res.render('vwAccount/watchlist', result);
});

// Bidding Products - Sản phẩm đang tham gia đấu giá
router.get('/bidding', isAuthenticated, async (req, res) => {
  const currentUserId = req.session.authUser.id;
  const biddingProducts = await autoBiddingModel.getBiddingProductsByBidderId(currentUserId);

  res.render('vwAccount/bidding-products', {
    activeSection: 'bidding',
    products: biddingProducts
  });
});

// Won Auctions - Sản phẩm đã thắng (pending, sold, cancelled)
router.get('/auctions', isAuthenticated, async (req, res) => {
  const currentUserId = req.session.authUser.id;
  const wonAuctions = await accountService.getWonAuction(currentUserId);

  res.render('vwAccount/won-auctions', {
    activeSection: 'auctions',
    products: wonAuctions
  });
});

// Rate Seller - POST
router.post('/won-auctions/:productId/rate-seller', isAuthenticated, async (req, res) => {
  try {
    const currentUserId = req.session.authUser.id;
    const productId = req.params.productId;
    const payload = req.body;

    await accountService.rateSeller(currentUserId, productId, payload)

    res.json({ success: true });
  } catch (error) {
    console.error('Error rating seller:', error);
    res.json({ success: false, message: 'Failed to submit rating.' });
  }
});

// Rate Seller - PUT (Edit)
router.put('/won-auctions/:productId/rate-seller', isAuthenticated, async (req, res) => {
  try {
    const currentUserId = req.session.authUser.id;
    const productId = req.params.productId;
    const payload = req.body;

    await accountService.updateRateSeller(currentUserId, productId, payload)

    res.json({ success: true });
  } catch (error) {
    console.error('Error updating rating:', error);
    res.json({ success: false, message: 'Failed to update rating.' });
  }
});

// router.get('/seller/products', isAuthenticated, async (req, res) => {
//   res.render('vwAccount/my-products');
// });

// router.get('/seller/sold-products', isAuthenticated, async (req, res) => {
//   res.render('vwAccount/sold-products');
// });

// ===================== OAUTH ROUTES =====================

// Google OAuth
router.get('/auth/google',
  passport.authenticate('google', { scope: ['profile', 'email'] })
);

router.get('/auth/google/callback',
  passport.authenticate('google', { failureRedirect: '/account/signin' }),
  (req, res) => {
    // Lưu user vào session
    req.session.authUser = req.user;
    req.session.isAuthenticated = true;
    res.redirect('/');
  }
);

// Facebook OAuth
// NOTE: 'email' scope chỉ hoạt động với Admin/Developer/Tester trong Development Mode
// Tạm thời chỉ dùng 'public_profile' để test, sau đó thêm 'email' khi đã add tester
router.get('/auth/facebook',
  passport.authenticate('facebook', { scope: ['public_profile'] })
);

router.get('/auth/facebook/callback',
  passport.authenticate('facebook', { failureRedirect: '/account/signin' }),
  (req, res) => {
    req.session.authUser = req.user;
    req.session.isAuthenticated = true;
    res.redirect('/');
  }
);

// Twitter OAuth - DISABLED (Twitter API requires $100/month subscription)
// router.get('/auth/twitter',
//   passport.authenticate('twitter')
// );

// router.get('/auth/twitter/callback',
//   passport.authenticate('twitter', { failureRedirect: '/account/signin' }),
//   (req, res) => {
//     req.session.authUser = req.user;
//     req.session.isAuthenticated = true;
//     res.redirect('/');
//   }
// );

// GitHub OAuth
router.get('/auth/github',
  passport.authenticate('github', { scope: ['user:email'] })
);

router.get('/auth/github/callback',
  passport.authenticate('github', { failureRedirect: '/account/signin' }),
  (req, res) => {
    req.session.authUser = req.user;
    req.session.isAuthenticated = true;
    res.redirect('/');
  }
);

export default router;
