import db from '../utils/db.js';
import * as fileService from '../utils/fileService.js';

/**
 * Tạo hóa đơn thanh toán (từ buyer)
 */
export async function createPaymentInvoice(invoiceData) {
  const {
    order_id,
    issuer_id,
    payment_method,
    permanentUrls,
    note
  } = invoiceData;

  const rows = await db('invoices').insert({
    order_id,
    issuer_id,
    invoice_type: 'payment',
    payment_method,
    payment_proof_urls: permanentUrls,
    note,
    is_verified: false,
    created_at: db.fn.now()
  }).returning('*');

  return rows[0];
}

/**
 * Tạo hóa đơn vận chuyển (từ seller)
 */
export async function createShippingInvoice(invoiceData) {
  const {
    order_id,
    issuer_id,
    tracking_number,
    shipping_provider,
    permanentUrls,
    note
  } = invoiceData;


  const rows = await db('invoices').insert({
    order_id,
    issuer_id,
    invoice_type: 'shipping',
    tracking_number,
    shipping_provider,
    shipping_proof_urls: permanentUrls,
    note,
    is_verified: false,
    created_at: db.fn.now()
  }).returning('*');

  return rows[0];
}

/**
 * Lấy invoice theo ID
 */
export async function findById(invoiceId) {
  return db('invoices')
    .where('id', invoiceId)
    .first();
}

/**
 * Lấy tất cả invoices của một order
 */
export async function findByOrderId(orderId) {
  return db('invoices')
    .leftJoin('users as issuer', 'invoices.issuer_id', 'issuer.id')
    .leftJoin('users as verifier', 'invoices.verified_by', 'verifier.id')
    .where('invoices.order_id', orderId)
    .select(
      'invoices.*',
      'issuer.fullname as issuer_name',
      'verifier.fullname as verifier_name'
    )
    .orderBy('invoices.created_at', 'desc');
}

/**
 * Lấy payment invoice của một order
 */
export async function getPaymentInvoice(orderId) {
  return db('invoices')
    .leftJoin('users as issuer', 'invoices.issuer_id', 'issuer.id')
    .where('invoices.order_id', orderId)
    .where('invoices.invoice_type', 'payment')
    .select(
      'invoices.*',
      'issuer.fullname as issuer_name'
    )
    .first();
}

/**
 * Lấy shipping invoice của một order
 */
export async function getShippingInvoice(orderId) {
  return db('invoices')
    .leftJoin('users as issuer', 'invoices.issuer_id', 'issuer.id')
    .where('invoices.order_id', orderId)
    .where('invoices.invoice_type', 'shipping')
    .select(
      'invoices.*',
      'issuer.fullname as issuer_name'
    )
    .first();
}

/**
 * Xác minh invoice
 */
export async function verifyInvoice(invoiceId) {
  const rows = await db('invoices')
    .where('id', invoiceId)
    .update({
      is_verified: true,
      verified_at: db.fn.now(),
      updated_at: db.fn.now()
    })
    .returning('*');

  return rows[0];
}

/**
 * Cập nhật invoice
 */
export async function updateInvoice(invoiceId, updateData) {
  const rows = await db('invoices')
    .where('id', invoiceId)
    .update({
      ...updateData,
      updated_at: db.fn.now()
    })
    .returning('*');

  return rows[0];
}

/**
 * Xóa invoice
 */
export async function deleteInvoice(invoiceId) {
  return db('invoices')
    .where('id', invoiceId)
    .del();
}

/**
 * Kiểm tra xem order đã có payment invoice chưa
 */
export async function hasPaymentInvoice(orderId) {
  const count = await db('invoices')
    .where('order_id', orderId)
    .where('invoice_type', 'payment')
    .count('* as count')
    .first();

  return count.count > 0;
}

/**
 * Kiểm tra xem order đã có shipping invoice chưa
 */
export async function hasShippingInvoice(orderId) {
  const count = await db('invoices')
    .where('order_id', orderId)
    .where('invoice_type', 'shipping')
    .count('* as count')
    .first();

  return count.count > 0;
}

/**
 * Lấy tất cả invoices chưa xác minh
 */
export async function getUnverifiedInvoices() {
  return db('invoices')
    .leftJoin('orders', 'invoices.order_id', 'orders.id')
    .leftJoin('products', 'orders.product_id', 'products.id')
    .leftJoin('users as issuer', 'invoices.issuer_id', 'issuer.id')
    .where('invoices.is_verified', false)
    .select(
      'invoices.*',
      'products.name as product_name',
      'issuer.fullname as issuer_name'
    )
    .orderBy('invoices.created_at', 'desc');
}
