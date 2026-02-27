import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * ============================================
 * INVOICE MODEL
 * ============================================
 * Quản lý hóa đơn thanh toán và vận chuyển
 * 
 * 2 loại invoice:
 * - payment: Hóa đơn thanh toán từ buyer
 * - shipping: Hóa đơn vận chuyển từ seller
 */

/**
 * Move uploaded files from temp folder to permanent folder
 * @param {Array} tempUrls - Array of temp URLs like ["uploads/123.jpg"]
 * @param {String} type - 'payment_proofs' or 'shipping_proofs'
 * @returns {Array} - Array of permanent URLs like ["images/payment_proofs/123.jpg"]
 */
export function moveUploadedFiles(tempUrls, type) {
  if (!tempUrls || tempUrls.length === 0) return [];

  const targetFolder = `public/images/${type}`;
  const publicPath = path.join(__dirname, '..', 'public');
  const targetPath = path.join(publicPath, 'images', type);

  // Create target folder if not exists
  if (!fs.existsSync(targetPath)) {
    fs.mkdirSync(targetPath, { recursive: true });
  }

  const permanentUrls = [];

  for (const tempUrl of tempUrls) {
    // tempUrl format: "uploads/1234567890-987654321-originalname.jpg"
    const tempFilename = path.basename(tempUrl);
    const tempPath = path.join(publicPath, tempUrl);

    // Extract extension from original filename
    const ext = path.extname(tempFilename);

    // Generate new short filename: timestamp-random.ext
    const timestamp = Date.now();
    const random = Math.round(Math.random() * 1E9);
    const newFilename = `${timestamp}-${random}${ext}`;

    const newPath = path.join(targetPath, newFilename);
    const newUrl = `images/${type}/${newFilename}`;

    try {
      // Move and rename file from temp to permanent
      if (fs.existsSync(tempPath)) {
        fs.renameSync(tempPath, newPath);
        permanentUrls.push(newUrl);
      } else {
        console.warn(`Temp file not found: ${tempPath}`);
      }
    } catch (error) {
      console.error(`Error moving file ${tempUrl}:`, error);
    }
  }

  return permanentUrls;
}