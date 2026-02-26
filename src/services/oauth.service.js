import * as userModel from '../models/user.model.js';
import * as oauthModel from '../models/oauth.model.js';

export async function handleOAuth(provider, providerId, profile, done) {
  try {
    // Kiểm tra xem user đã tồn tại chưa
    let user = await oauthModel.findByOAuthProvider(provider, providerId);

    if (user) {
      // User đã tồn tại, đăng nhập
      return done(null, user);
    }

    // Kiểm tra email đã tồn tại chưa
    const email = profile.emails && profile.emails[0] ? profile.emails[0].value : null;
    if (email) {
      user = await userModel.findByEmail(email);
      if (user) {
        // Cập nhật OAuth provider cho user hiện có
        await oauthModel.addOAuthProvider(user.id, provider, providerId);
        return done(null, user);
      }
    }

    // Tạo user mới
    const newUser = await userModel.add({
      email: email || `${provider}_${profile.id}@oauth.local`,
      fullname: profile.displayName || profile.username || `${provider} user`,
      password_hash: null, address: '', role: 'bidder',
      email_verified: true,
      oauth_provider: provider,
      oauth_id: providerId
    });

    done(null, newUser);
  } catch (error) {
    done(error, null);
  }
}