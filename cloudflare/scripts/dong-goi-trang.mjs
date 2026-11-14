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
fs.writeFileSync(path.join(goc, 'src', 'trang.js'),
  '// Tự sinh bởi scripts/dong-goi-trang.mjs từ thư mục public/ — không sửa tay.\nexport default ' + JSON.stringify(trang) + ';\n');
console.log('Đã đóng gói ' + Object.keys(trang).length + ' trang vào src/trang.js');
