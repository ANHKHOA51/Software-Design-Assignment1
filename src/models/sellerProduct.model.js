import db from "../utils/db.js";

// Seller Statistics Functions
export function countProductsBySellerId(sellerId) {
  return db('products')
    .where('seller_id', sellerId)
    .count('id as count')
    .first();
}

export function countActiveProductsBySellerId(sellerId) {
  return db('products')
    .where('seller_id', sellerId)
    .where('end_at', '>', new Date())
    .whereNull('closed_at')
    .count('id as count')
    .first();
}

export function countSoldProductsBySellerId(sellerId) {
  return db('products')
    .where('seller_id', sellerId)
    .where('end_at', '<=', new Date())
    .where('is_sold', true)
    .count('id as count')
    .first();
}

export function countPendingProductsBySellerId(sellerId) {
  return db('products')
    .where('seller_id', sellerId)
    .where(function () {
      this.where('end_at', '<=', new Date())
        .orWhereNotNull('closed_at');
    })
    .whereNotNull('highest_bidder_id')
    .whereNull('is_sold')
    .count('id as count')
    .first();
}

export function countExpiredProductsBySellerId(sellerId) {
  return db('products')
    .where('seller_id', sellerId)
    .where(function () {
      this.where(function () {
        this.where('end_at', '<=', new Date())
          .whereNull('highest_bidder_id');
      })
        .orWhere('is_sold', false);
    })
    .count('id as count')
    .first();
}

export async function getSellerStats(sellerId) {
  const [total, active, sold, pending, expired, pendingRevenue, completedRevenue] = await Promise.all([
    countProductsBySellerId(sellerId),
    countActiveProductsBySellerId(sellerId),
    countSoldProductsBySellerId(sellerId),
    countPendingProductsBySellerId(sellerId),
    countExpiredProductsBySellerId(sellerId),
    // Pending Revenue: Sản phẩm hết hạn hoặc closed, có người thắng nhưng chưa thanh toán
    db('products')
      .where('seller_id', sellerId)
      .where(function () {
        this.where('end_at', '<=', new Date())
          .orWhereNotNull('closed_at');
      })
      .whereNotNull('highest_bidder_id')
      .whereNull('is_sold')
      .sum('current_price as revenue')
      .first(),
    // Completed Revenue: Sản phẩm đã bán thành công
    db('products')
      .where('seller_id', sellerId)
      .where('is_sold', true)
      .sum('current_price as revenue')
      .first()
  ]);

  const pendingRev = parseFloat(pendingRevenue.revenue) || 0;
  const completedRev = parseFloat(completedRevenue.revenue) || 0;

  return {
    total_products: parseInt(total.count) || 0,
    active_products: parseInt(active.count) || 0,
    sold_products: parseInt(sold.count) || 0,
    pending_products: parseInt(pending.count) || 0,
    expired_products: parseInt(expired.count) || 0,
    pending_revenue: pendingRev,
    completed_revenue: completedRev,
    total_revenue: pendingRev + completedRev
  };
}

export function findAllProductsBySellerId(sellerId) {
  return db('products')
    .leftJoin('categories', 'products.category_id', 'categories.id')
    .where('seller_id', sellerId)
    .select(
      'products.*', 'categories.name as category_name',
      db.raw(`
        (
          SELECT COUNT(*) 
          FROM bidding_history 
          WHERE bidding_history.product_id = products.id
        ) AS bid_count
      `),
      db.raw(`
        CASE
          WHEN is_sold IS TRUE THEN 'Sold'
          WHEN is_sold IS FALSE THEN 'Cancelled'
          WHEN (end_at <= NOW() OR closed_at IS NOT NULL) AND highest_bidder_id IS NOT NULL AND is_sold IS NULL THEN 'Pending'
          WHEN end_at <= NOW() AND highest_bidder_id IS NULL THEN 'No Bidders'
          WHEN end_at > NOW() AND closed_at IS NULL THEN 'Active'
        END AS status
      `)
    );
}

export function findActiveProductsBySellerId(sellerId) {
  return db('products')
    .leftJoin('categories', 'products.category_id', 'categories.id')
    .where('seller_id', sellerId)
    .where('end_at', '>', new Date())
    .whereNull('closed_at')
    .select(
      'products.*', 'categories.name as category_name',
      db.raw(`
        (
          SELECT COUNT(*) 
          FROM bidding_history 
          WHERE bidding_history.product_id = products.id
        ) AS bid_count
      `)
    );
}

export function findPendingProductsBySellerId(sellerId) {
  return db('products')
    .leftJoin('categories', 'products.category_id', 'categories.id')
    .leftJoin('users', 'products.highest_bidder_id', 'users.id')
    .where('seller_id', sellerId)
    .where(function () {
      this.where('end_at', '<=', new Date())
        .orWhereNotNull('closed_at');
    })
    .whereNotNull('highest_bidder_id')
    .whereNull('is_sold')
    .select(
      'products.*',
      'categories.name as category_name',
      'users.fullname as highest_bidder_name',
      'users.email as highest_bidder_email',
      db.raw(`
        (
          SELECT COUNT(*) 
          FROM bidding_history
          WHERE bidding_history.product_id = products.id
        ) AS bid_count
      `)
    );
}

export function findSoldProductsBySellerId(sellerId) {
  return db('products')
    .leftJoin('categories', 'products.category_id', 'categories.id')
    .leftJoin('users', 'products.highest_bidder_id', 'users.id')
    .where('seller_id', sellerId)
    .where('end_at', '<=', new Date())
    .where('is_sold', true)
    .select(
      'products.*',
      'categories.name as category_name',
      'users.fullname as highest_bidder_name',
      'users.email as highest_bidder_email',
      db.raw(`
        (
          SELECT COUNT(*) 
          FROM bidding_history
          WHERE bidding_history.product_id = products.id
        ) AS bid_count
      `)
    );
}

export function findExpiredProductsBySellerId(sellerId) {
  return db('products')
    .leftJoin('categories', 'products.category_id', 'categories.id')
    .where('seller_id', sellerId)
    .where(function () {
      this.where(function () {
        this.where('end_at', '<=', new Date())
          .whereNull('highest_bidder_id');
      })
        .orWhere('is_sold', false);
    })
    .select(
      'products.*',
      'categories.name as category_name',
      db.raw(`
        CASE
          WHEN highest_bidder_id IS NULL THEN 'No Bidders'
          ELSE 'Cancelled'
        END AS status
      `)
    );
}