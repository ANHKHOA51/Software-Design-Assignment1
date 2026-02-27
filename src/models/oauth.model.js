import db from '../utils/db.js';

// ===================== OAUTH SUPPORT =====================

// Tìm user theo OAuth provider
export function findByOAuthProvider(provider, oauth_id) {
  return db('users')
    .where({
      oauth_provider: provider,
      oauth_id: oauth_id
    })
    .first();
}

// Thêm OAuth provider cho user hiện có
export function addOAuthProvider(user_id, provider, oauth_id) {
  return db('users')
    .where('id', user_id)
    .update({
      oauth_provider: provider,
      oauth_id: oauth_id,
      email_verified: true
    });
}