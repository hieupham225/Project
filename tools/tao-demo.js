/**
 * Ghép bản dùng thử chạy trong trình duyệt (demo/index.html):
 *   - máy chủ Cloudflare Worker đã đóng gói bằng wrangler (chạy nguyên văn),
 *   - D1 thay bằng SQLite (sql.js bản asm.js, không cần WebAssembly),
 *   - giao diện thật: cloudflare/public/gv.html, index.html, phieu.js.
 * Chạy:  cd cloudflare && npm install && cd .. && node tools/tao-demo.js
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const os = require('os');

const goc = path.join(__dirname, '..');
const cf = path.join(goc, 'cloudflare');
const doc = (p) => fs.readFileSync(path.join(goc, p), 'utf8');

// 1. Đóng gói Worker
const ra = fs.mkdtempSync(path.join(os.tmpdir(), 'pkq-'));
execSync(`npx wrangler deploy --dry-run --outdir "${ra}"`, { cwd: cf, stdio: 'ignore' });
let worker = fs.readFileSync(path.join(ra, 'index.js'), 'utf8')
  .replace(/\/\/# sourceMappingURL=.*$/m, '')
  .replace(/export\s*\{\s*index_default as default\s*\};?/, '');
if (/^\s*(import|export)\s/m.test(worker)) throw new Error('Bản đóng gói còn import/export — không nhúng được.');

// 2. SQLite (asm.js)
const sqlAsm = fs.readFileSync(require.resolve('sql.js/dist/sql-asm-memory-growth.js', { paths: [cf] }), 'utf8');

// Nhúng an toàn trong thẻ <script>
const jsAnToan = (s) => s.replace(/<\/script/gi, '<\\/script').replace(/<!--/g, '<\\!--');
const json = (s) => JSON.stringify(s).replace(/</g, '\\u003c');

const html = doc('tools/demo-khung.html')
  .replace('__SQL_ASM__', () => jsAnToan(sqlAsm))
  .replace('__WORKER__', () => jsAnToan(worker))
  .replace('__GV__', () => json(doc('cloudflare/public/gv.html')))
  .replace('__PH__', () => json(doc('cloudflare/public/index.html')))
  .replace('__PHIEU__', () => json(doc('cloudflare/public/phieu.js')))
  .replace('__SCHEMA__', () => json(doc('cloudflare/schema.sql')));
fs.mkdirSync(path.join(goc, 'demo'), { recursive: true });
fs.writeFileSync(path.join(goc, 'demo', 'index.html'), html);
console.log('Đã tạo demo/index.html (' + Math.round(html.length / 1024) + ' KB)');
