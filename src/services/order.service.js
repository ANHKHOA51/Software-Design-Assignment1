import db from '../utils/db.js';
import * as orderModel from '../models/order.model.js';

export async function updateStatus(orderId, newStatus, userId, note = null) {
  console.log("DEBUG: function orderService.updateStatus");

  const trx = await db.transaction();

  try {
    // Lấy trạng thái cũ
    const order = await trx('orders')
      .where('id', orderId)
      .first();

    if (!order) {
      throw new Error('Order not found');
    }

    const oldStatus = order.status;

    // Cập nhật order
    const updateData = buildStatusUpdateData(newStatus, userId, note);

    const updatedOrder = await orderModel.updateStatus(
      orderId,
      updateData,
      trx
    );

    // Ghi log vào order_status_history
    await orderModel.insertStatusHistory({
      order_id: orderId,
      from_status: oldStatus,
      to_status: newStatus,
      changed_by: userId,
      note
    }, trx);


    await trx.commit();

    return updatedOrder;
  } catch (error) {
    await trx.rollback();
    throw error;
  }
}


function buildStatusUpdateData(newStatus, userId, note) {
  // Cập nhật order
  const updateData = {
    status: newStatus,
    updated_at: db.fn.now()
  };

  // Cập nhật timestamp tương ứng
  switch (newStatus) {
    case 'payment_submitted':
      updateData.payment_submitted_at = db.fn.now();
      break;
    case 'payment_confirmed':
      updateData.payment_confirmed_at = db.fn.now();
      break;
    case 'shipped':
      updateData.shipped_at = db.fn.now();
      break;
    case 'delivered':
      updateData.delivered_at = db.fn.now();
      break;
    case 'completed':
      updateData.completed_at = db.fn.now();
      break;
    case 'cancelled':
      updateData.cancelled_at = db.fn.now();
      updateData.cancelled_by = userId;
      if (note) {
        updateData.cancellation_reason = note;
      }
      break;
  }

  return updateData;
}