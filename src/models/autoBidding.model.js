import db from '../utils/db.js';

/**
 * Thêm hoặc cập nhật auto bidding record cho một bidder
 * @param {number} productId - ID sản phẩm
 * @param {number} bidderId - ID người đặt giá
 * @param {number} maxPrice - Giá tối đa người này sẵn sàng trả
 * @returns {Promise} Kết quả upsert
 */
export async function upsertAutoBid(productId, bidderId, maxPrice) {
  // Use PostgreSQL's ON CONFLICT to handle upsert
  return db.raw(`
    INSERT INTO auto_bidding (product_id, bidder_id, max_price)
    VALUES (?, ?, ?)
    ON CONFLICT (product_id, bidder_id)
    DO UPDATE SET 
      max_price = EXCLUDED.max_price,
      created_at = NOW()
    RETURNING *
  `, [productId, bidderId, maxPrice]);
}

/**
 * Lấy auto bid record của một bidder cho sản phẩm
 * @param {number} productId - ID sản phẩm
 * @param {number} bidderId - ID người đặt giá
 * @returns {Promise<Object>} Auto bid record
 */
export async function getAutoBid(productId, bidderId) {
  return db('auto_bidding')
    .where('product_id', productId)
    .where('bidder_id', bidderId)
    .first();
}

/**
 * Lấy tất cả auto bids cho một sản phẩm
 * @param {number} productId - ID sản phẩm
 * @returns {Promise<Array>} Danh sách auto bids
 */
export async function getAllAutoBids(productId) {
  return db('auto_bidding')
    .where('product_id', productId)
    .orderBy('max_price', 'desc');
}

/**
 * Xóa auto bid của một bidder
 * @param {number} productId - ID sản phẩm
 * @param {number} bidderId - ID người đặt giá
 * @returns {Promise} Kết quả xóa
 */
export async function deleteAutoBid(productId, bidderId) {
  return db('auto_bidding')
    .where('product_id', productId)
    .where('bidder_id', bidderId)
    .del();
}