/**
 * Đóng gói các file trong public/ thành src/trang.js để Worker tự phục vụ (không cần Workers Static Assets).
 * Tự chạy trước `wrangler dev` / `wrangler deploy` (xem [build] trong wrangler.toml).
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const goc = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const LOAI = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.txt': 'text/plain; charset=utf-8' };
const trang = {};
for (const ten of fs.readdirSync(path.join(goc, 'public'))) {
  const duoi = path.extname(ten);
  if (!LOAI[duoi]) continue;
  trang['/' + ten] = { loai: LOAI[duoi], noiDung: fs.readFileSync(path.join(goc, 'public', ten), 'utf8') };
}
// Module dùng chung máy chủ + trình duyệt: đọc file Word thành mẫu phiếu
for (const ten of ['mau-word.js', 'khoi-phieu.js']) trang['/' + ten] = { loai: LOAI['.js'], noiDung: fs.readFileSync(path.join(goc, 'src', ten), 'utf8') };
const dich = path.join(goc, 'src', 'trang.js');
const noiDung = '// Tự sinh bởi scripts/dong-goi-trang.mjs từ thư mục public/ — không sửa tay.\nexport default ' + JSON.stringify(trang) + ';\n';
// Chỉ ghi khi nội dung đổi: src/ nằm trong watch_dir của `wrangler dev`, ghi lại y hệt sẽ gây build lặp vô hạn.
const cu = fs.existsSync(dich) ? fs.readFileSync(dich, 'utf8') : '';
if (cu !== noiDung) fs.writeFileSync(dich, noiDung);
console.log('Đã đóng gói ' + Object.keys(trang).length + ' trang vào src/trang.js' + (cu === noiDung ? ' (không đổi)' : ''));
