import db from '../utils/db.js';

const TABLE = "user_otps";

// ===================== OTP USING KNEX =====================

// Tạo OTP
export function createOtp({ user_id, otp_code, purpose, expires_at }) {
  return db(TABLE).insert({
    user_id,
    otp_code,
    purpose,
    expires_at
  });
}

// Tìm OTP còn hiệu lực
export function findValidOtp({ user_id, otp_code, purpose }) {
  return db(TABLE)
    .where({
      user_id,
      otp_code,
      purpose,
      used: false
    })
    .andWhere('expires_at', '>', db.fn.now())
    .orderBy('id', 'desc')
    .first();
}

// Đánh dấu OTP đã dùng
export function markOtpUsed(id) {
  return db(TABLE)
    .where('id', id)
    .update({ used: true });
}