import db from '../utils/db.js';

export async function add(user) {
  // PostgreSQL
  const rows = await db('users')
    .insert(user)
    .returning(['id', 'email', 'fullname', 'address', 'role', 'email_verified']);
  return rows[0]; // object: { id, email, fullname, ... }
}
export function findById(id) {
  return db('users').where('id', id).first();
}
export function loadAllUsers() {
  return db('users').orderBy('id', 'desc');
}
export function findUsersByRole(role) {
  return db('users')
    .select('users.id', 'users.fullname', 'users.email', 'users.role')
    .where('users.role', role)
    .orderBy('users.fullname', 'asc');
}
export function findByUserName(username) {
  return db('users').where('username', username).first();
}
export async function update(id, user) {
  // SỬA: Thêm await
  const rows = await db('users')
    .where('id', id)
    .update(user)
    .returning('*');

  return rows[0];
}
export function findByEmail(email) {
  return db('users').where('email', email).first();
}
export async function deleteUser(id) {
  return db('users')
    .where('id', id)
    .del();
}
export function updateUserInfo(user_id, { email, fullname, address }) {
  return db('users')
    .where('id', user_id)
    .update({ email, fullname, address });
}
export function updateUserRole(user_id, role) {
  return db('users')
    .where('id', user_id)
    .update({ role: role, is_upgrade_pending: false });
}

// Verify email user
export function verifyUserEmail(user_id) {
  return db('users')
    .where('id', user_id)
    .update({ email_verified: true });
}

export function markUpgradePending(user_id) {
  return db('users')
    .where('id', user_id)
    .update({ is_upgrade_pending: true });
}
