import * as productModel from '../models/product.model.js';

export async function findByProductIdForAdmin(productId, userId) {
  console.log("DEBUG: function productService.findByProductIdForAdmin");
  const rows = await productModel.findByProductIdForAdmin(productId, userId);

  return mapProductRows(rows);
}

function mapProductRows(rows) {
  // Nếu không tìm thấy sản phẩm nào
  if (rows.length === 0) return null;

  // SQL trả về nhiều dòng (do 1 sp có nhiều ảnh), ta lấy dòng đầu tiên làm thông tin chính
  const product = rows[0];

  // Gom tất cả img_link của các dòng lại thành mảng sub_images
  // Để phục vụ vòng lặp {{#each product.sub_images}} bên View
  product.sub_images = rows
    .map(row => row.img_link)
    .filter(link => link && link !== product.thumbnail); // Lọc bỏ ảnh null hoặc trùng thumbnail

  return product;
}