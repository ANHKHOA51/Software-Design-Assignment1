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

export async function searchPageByKeywords(keywords, limit, offset, userId, logic = 'or', sort = '') {
  console.log("DEBUG: method productService.searchPageByKeywords");
  const searchQuery = removeAccents(keywords);

  const query = productModel.searchPageByKeywords(searchQuery, userId);

  applySearchCondition(query, searchQuery, logic);

  applySorting(query, sort);

  return query.limit(limit).offset(offset);
}

function removeAccents(keywords) {
  // Remove accents from keywords for search
  const searchQuery = keywords.toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Remove diacritics
    .replace(/đ/g, 'd').replace(/Đ/g, 'D'); // Vietnamese d
  return searchQuery;
}

function applySearchCondition(query, searchQuery, logic) {
  query.where((builder) => {
    const words = searchQuery.split(/\s+/).filter(w => w.length > 0);
    if (logic === 'and') {
      // AND logic: all keywords must match
      // Split words and each word must exist in product name OR category name OR parent category name
      words.forEach(word => {
        builder.where(function () {
          this.whereRaw(`LOWER(remove_accents(products.name)) LIKE ?`, [`%${word}%`])
            .orWhereRaw(`LOWER(remove_accents(categories.name)) LIKE ?`, [`%${word}%`])
            .orWhereRaw(`LOWER(remove_accents(parent_category.name)) LIKE ?`, [`%${word}%`]);
        });
      });
    } else {
      // OR logic: any keyword can match in product name OR category name OR parent category name
      words.forEach(word => {
        builder.orWhere(function () {
          this.whereRaw(`LOWER(remove_accents(products.name)) LIKE ?`, [`%${word}%`])
            .orWhereRaw(`LOWER(remove_accents(categories.name)) LIKE ?`, [`%${word}%`])
            .orWhereRaw(`LOWER(remove_accents(parent_category.name)) LIKE ?`, [`%${word}%`]);
        });
      });
    }
  })
}

function applySorting(query, sort) {
  // Apply sorting
  if (sort === 'price_asc') {
    query = query.orderBy('products.current_price', 'asc');
  } else if (sort === 'price_desc') {
    query = query.orderBy('products.current_price', 'desc');
  } else if (sort === 'newest') {
    query = query.orderBy('products.created_at', 'desc');
  } else if (sort === 'oldest') {
    query = query.orderBy('products.created_at', 'asc');
  } else {
    // Default: sort by end_at ascending (ending soonest first)
    query = query.orderBy('products.end_at', 'asc');
  }
}