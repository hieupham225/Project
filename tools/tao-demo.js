/**
 * Ghép bản dùng thử (demo/index.html): nhúng nguyên Code.gs, GiaoVien.html, Index.html, Phieu.html
 * vào tools/demo-khung.html — phần giả lập Google Sheet/Drive chạy ngay trong trình duyệt.
 * Cách chạy:  node tools/tao-demo.js
 */
const fs = require('fs');
const path = require('path');
const goc = path.join(__dirname, '..');
const doc = (p) => fs.readFileSync(path.join(goc, p), 'utf8');
// JSON nhúng trong <script>: mã hóa mọi dấu < để không đóng thẻ script sớm
const nhung = (s) => JSON.stringify(s).replace(/</g, '\\u003c');
let html = doc('tools/demo-khung.html')
  .replace('__CODE_GS__', () => nhung(doc('apps-script/Code.gs')))
  .replace('__GIAO_VIEN__', () => nhung(doc('apps-script/GiaoVien.html')))
  .replace('__INDEX__', () => nhung(doc('apps-script/Index.html')))
  .replace('__PHIEU__', () => nhung(doc('apps-script/Phieu.html')));
fs.mkdirSync(path.join(goc, 'demo'), { recursive: true });
fs.writeFileSync(path.join(goc, 'demo', 'index.html'), html);
console.log('Đã tạo demo/index.html (' + Math.round(html.length / 1024) + ' KB)');
