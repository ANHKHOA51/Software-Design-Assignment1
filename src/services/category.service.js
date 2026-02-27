import * as categoryModel from '../models/category.model.js';

export async function findByCategoryId(id) {
	const category = await categoryModel.findByCategoryId(id);
	const childrenCount = await categoryModel.countProductsInChildren(id);
	category.product_count = parseInt(category.product_count) + parseInt(childrenCount.count);
}