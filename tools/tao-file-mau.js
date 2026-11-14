/**
 * Sinh file Excel mẫu (mau/Mau_ket_qua_thi.xlsx) từ biến MAU_FILE_KET_QUA trong apps-script/Code.gs,
 * để file Excel và nút "Tạo file mẫu" trong bảng điều khiển luôn giống nhau.
 *
 * Cách chạy:  npm install xlsx@0.18.5  &&  node tools/tao-file-mau.js
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const XLSX = require('xlsx');

const goc = path.join(__dirname, '..');
const ctx = {};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(goc, 'apps-script', 'Code.gs'), 'utf8') + '\nthis.__MAU = MAU_FILE_KET_QUA;', ctx);
const mau = ctx.__MAU;

const wb = XLSX.utils.book_new();
const doRong = {
  KetQua: (h) => (/^(I|II|III)\./.test(h) ? 7 : /Họ và tên/.test(h) ? 22 : /Ưu|Nhược|khắc phục|Lời khuyên/.test(h) ? 40 : 11),
  DeThi: (h) => ({ 'Phần': 6, 'Câu': 6, 'Chủ đề kiến thức': 26, 'Mức độ': 13, 'Nội dung phân tích cụ thể': 70, 'Đáp án đúng': 16 }[h] || 14),
  ThongTin: (h) => ({ 'Mục': 24, 'Giá trị': 70, 'Ghi chú': 60 }[h] || 20),
  HuongDan: () => 140
};
Object.keys(mau).forEach((ten) => {
  const ws = XLSX.utils.aoa_to_sheet(mau[ten]);
  ws['!cols'] = mau[ten][0].map((h) => ({ wch: doRong[ten](h) }));
  // Lưu mọi ô dạng văn bản để Excel không tự đổi "2.25" -> ngày tháng, "I.1" ...
  Object.keys(ws).forEach((k) => { if (k[0] !== '!') { ws[k].t = 's'; ws[k].z = '@'; } });
  ws['!freeze'] = { xSplit: 0, ySplit: 1 };
  XLSX.utils.book_append_sheet(wb, ws, ten);
});
const ra = path.join(goc, 'mau', 'Mau_ket_qua_thi.xlsx');
XLSX.writeFile(wb, ra);
console.log('Đã tạo', ra);
