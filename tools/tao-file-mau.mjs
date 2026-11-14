/**
 * Sinh 2 file Excel mẫu trong thư mục mau/ từ đúng logic của máy chủ (cloudflare/src/logic.js):
 *   mau/Mau_bang_ket_qua.xlsx       — bảng kết quả học sinh
 *   mau/Mau_dap_an_theo_ma_de.xlsx  — bảng đáp án theo mã đề (+ thông tin câu hỏi)
 * Chạy:  cd cloudflare && npm install && cd .. && node tools/tao-file-mau.mjs
 */
import { createRequire } from 'module';
import path from 'path';
import { fileURLToPath } from 'url';
import * as L from '../cloudflare/src/logic.js';

const goc = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const XLSX = createRequire(path.join(goc, 'cloudflare', 'package.json'))('xlsx');

import fs from 'fs';
fs.mkdirSync(path.join(goc, 'mau'), { recursive: true });

function luu(so, ten) {
  const wb = XLSX.utils.book_new();
  for (const tab of Object.keys(so)) {
    const ws = XLSX.utils.aoa_to_sheet(so[tab]);
    for (const k of Object.keys(ws)) if (k[0] !== '!') { ws[k].t = 's'; ws[k].z = '@'; }
    ws['!cols'] = so[tab][0].map((h) => ({ wch: /^Câu \d+$/.test(h) ? 8 : /Họ và tên|Nội dung|Giá trị|Chủ đề|Ưu|Nhược|khắc phục|Lời khuyên|HƯỚNG DẪN|Ghi chú/.test(h) ? 34 : 12 }));
    XLSX.utils.book_append_sheet(wb, ws, tab);
  }
  XLSX.writeFile(wb, path.join(goc, 'mau', ten));
  console.log('Đã tạo mau/' + ten);
}
luu(L.taoMauKetQua([], 'Toán 1'), 'Mau_bang_ket_qua.xlsx');
luu(L.taoMauDapAn(), 'Mau_dap_an_theo_ma_de.xlsx');
