/**
 * CẤU TRÚC ĐỀ + DẠNG CÂU HỎI (bộ chấm v2, dùng cho nhiều môn)
 *
 * Một cấu trúc đề = danh sách phần; mỗi phần có 1 dạng câu và cách tính điểm:
 *   { ma: 'I', ten: 'Trắc nghiệm nhiều phương án', dang: 'trac_nghiem', soCau: 12, diemMoiCau: 0.25, phuongAn: 'ABCD' }
 * Mỗi dạng câu là 1 module: chấm 1 câu (cham), điểm tối đa 1 câu (toiDa), nhận dạng đáp án (nhanDang — để đoán phần khi file không ghi).
 * Logic thuần, không phụ thuộc nền tảng (chạy được cả ở Worker lẫn trình duyệt / Node để kiểm thử).
 */

/* ---------- chuẩn hóa ---------- */

function chuoi(s) { return String(s == null ? '' : s).normalize('NFC').trim(); }

/** Đáp án trắc nghiệm / trả lời ngắn — giữ nguyên cách so của v1 để điểm Toán không đổi. */
export function chuanHoaDapAn(s) {
  return String(s).normalize('NFC').toUpperCase().replace(/\s+/g, '').replace(/,/g, '.').replace(/[;|]/g, ';');
}

/** "Đ,S,Đ,S" / "DSDS" / "đ s đ s" -> "DSDS"; ý bỏ trống giữ vị trí bằng "_" khi có dấu phân cách. */
export function chuoiDungSai(s) {
  s = String(s == null ? '' : s).normalize('NFC').toUpperCase().replace(/Đ/g, 'D');
  if (!s.replace(/[^DS]/g, '')) return '';
  if (/[,;|]/.test(s)) return s.split(/[,;|]/).map(function (x) { x = x.replace(/[^DS]/g, ''); return x ? x.charAt(0) : '_'; }).join('');
  return s.replace(/[^DS]/g, '');
}

/** Điền từ / viết lại câu: không phân biệt hoa thường, gộp khoảng trắng, thống nhất dấu nháy, bỏ dấu câu cuối. */
export function chuanHoaCau(s) {
  return chuoi(s).toLowerCase()
    .replace(/[‘’ʼ`´]/g, "'").replace(/[“”]/g, '"')
    .replace(/\s+([,.;:!?])/g, '$1').replace(/\s+/g, ' ')
    .replace(/[\s.!?;,]+$/, '').trim();
}

/** Sắp xếp: "a-c-b-d" | "acbd" | "a, c, b, d" | "1-3-2-4" -> "ACBD" / "1324" */
export function chuanHoaThuTu(s) {
  return chuoi(s).toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/* ---------- dạng câu hỏi ---------- */

export const DANG_CAU = {
  trac_nghiem: {
    ten: 'Trắc nghiệm nhiều phương án',
    toiDa: function (p) { return p.diemMoiCau; },
    cham: function (hs, dung, p) {
      var ok = !!hs && !!dung && chuanHoaDapAn(hs) === chuanHoaDapAn(dung);
      return { ok: ok, diem: ok ? p.diemMoiCau : 0 };
    },
    nhanDang: function (v, p) { var pa = (p && p.phuongAn) || 'ABCD'; return new RegExp('^[' + pa + ']$', 'i').test(chuoi(v)); }
  },

  dung_sai: {
    ten: 'Trắc nghiệm đúng sai',
    toiDa: function (p) { return p.diemMoiCau || 1; },
    cham: function (hs, dung, p) {
      var a = chuoiDungSai(hs), b = chuoiDungSai(dung), soDung = 0;
      var kyTu = a.split('').map(function (ch, i) {
        var ok = ch !== '_' && i < b.length && ch === b[i];
        if (ok) soDung++;
        return { c: ch === 'D' ? 'Đ' : ch === 'S' ? 'S' : '–', ok: ok };
      });
      var bang = p.bangDiem || [0, 0.1, 0.25, 0.5, 1], toiDa = p.diemMoiCau || 1;
      var diem = b.length === bang.length - 1 ? bang[soDung] : (b.length ? soDung / b.length * toiDa : 0);
      return { kyTu: kyTu, soDung: soDung, diem: diem };
    },
    nhanDang: function (v, p) { var n = (p && p.soY) || 4; return chuoiDungSai(v).length === n && String(v).replace(/[\s,;.|]/g, '').length === n; }
  },

  tra_loi_ngan: {
    ten: 'Trả lời ngắn',
    toiDa: function (p) { return p.diemMoiCau; },
    cham: function (hs, dung, p) {
      var ok = !!hs && !!dung && chuanHoaDapAn(hs) === chuanHoaDapAn(dung);
      return { ok: ok, diem: ok ? p.diemMoiCau : 0 };
    },
    nhanDang: function (v) { return /^-?[\d.,/]+$/.test(chuoi(v).replace(/\s+/g, '')); }
  },

  dien_tu: {
    ten: 'Điền từ / viết lại câu',
    toiDa: function (p) { return p.diemMoiCau; },
    cham: function (hs, dung, p) {
      var a = chuanHoaCau(hs);
      // nhiều đáp án đúng ngăn bằng " / " hoặc xuống dòng
      var ok = !!a && String(dung || '').split(/\s*\/\s*|\n/).some(function (x) { return x && chuanHoaCau(x) === a; });
      return { ok: ok, diem: ok ? p.diemMoiCau : 0 };
    },
    nhanDang: function (v) { return /[a-z]{2,}/i.test(chuoi(v)); }
  },

  sap_xep: {
    ten: 'Sắp xếp câu / đoạn',
    toiDa: function (p) { return p.diemMoiCau; },
    cham: function (hs, dung, p) {
      var a = chuanHoaThuTu(hs), b = chuanHoaThuTu(dung);
      var ok = !!a && !!b && a === b;
      return { ok: ok, diem: ok ? p.diemMoiCau : 0 };
    },
    nhanDang: function (v) { return /^([a-e1-9])([\s,.\-–>]+[a-e1-9]){2,}$/i.test(chuoi(v)); }
  }
};

/* ---------- cấu trúc có sẵn (định dạng thi tốt nghiệp THPT từ 2025) ---------- */

var BANG_DUNG_SAI = [0, 0.1, 0.25, 0.5, 1]; // 0..4 ý đúng
var TEN = {
  I: 'Câu trắc nghiệm nhiều phương án lựa chọn.', II: 'Câu trắc nghiệm đúng sai.', III: 'Tự luận'
};
function baPhan(soI, soII, soIII, diemIII) {
  var ds = [
    { ma: 'I', ten: TEN.I, dang: 'trac_nghiem', soCau: soI, diemMoiCau: 0.25, phuongAn: 'ABCD' },
    { ma: 'II', ten: TEN.II, dang: 'dung_sai', soCau: soII, soY: 4, diemMoiCau: 1, bangDiem: BANG_DUNG_SAI }
  ];
  if (soIII) ds.push({ ma: 'III', ten: TEN.III, dang: 'tra_loi_ngan', soCau: soIII, diemMoiCau: diemIII });
  return ds;
}

export const CAU_TRUC_CO_SAN = [
  { id: 'thpt2025-toan', mon: 'Toán', ten: 'THPT 2025 – Toán', phan: baPhan(12, 4, 6, 0.5) },
  { id: 'thpt2025-vat-li', mon: 'Vật lí', ten: 'THPT 2025 – Vật lí', phan: baPhan(18, 4, 6, 0.25) },
  { id: 'thpt2025-hoa-hoc', mon: 'Hóa học', ten: 'THPT 2025 – Hóa học', phan: baPhan(18, 4, 6, 0.25) },
  { id: 'thpt2025-sinh-hoc', mon: 'Sinh học', ten: 'THPT 2025 – Sinh học', phan: baPhan(18, 4, 6, 0.25) },
  { id: 'thpt2025-lich-su', mon: 'Lịch sử', ten: 'THPT 2025 – Lịch sử', phan: baPhan(24, 4, 0) },
  { id: 'thpt2025-dia-li', mon: 'Địa lí', ten: 'THPT 2025 – Địa lí', phan: baPhan(24, 4, 0) },
  { id: 'thpt2025-tieng-anh', mon: 'Tiếng Anh', ten: 'THPT 2025 – Tiếng Anh',
    phan: [{ ma: 'I', ten: 'Câu trắc nghiệm nhiều phương án lựa chọn.', dang: 'trac_nghiem', soCau: 40, diemMoiCau: 0.25, phuongAn: 'ABCD' }] }
];

export function layCauTrucCoSan(id) {
  var x = CAU_TRUC_CO_SAN.filter(function (c) { return c.id === id; })[0];
  return x ? JSON.parse(JSON.stringify(x)) : null;
}

/** Cấu trúc Toán của v1, áp điểm mỗi câu phần I / III ghi trong tab ThongTin (nếu có). */
export function cauTrucToanV1(thongTin) {
  var ct = layCauTrucCoSan('thpt2025-toan');
  if (thongTin) {
    if (thongTin.diemCauI != null) ct.phan[0].diemMoiCau = thongTin.diemCauI;
    if (thongTin.diemCauIII != null) ct.phan[2].diemMoiCau = thongTin.diemCauIII;
    ['I', 'II', 'III'].forEach(function (m, i) { if (thongTin.tenPhan && thongTin.tenPhan[m]) ct.phan[i].ten = thongTin.tenPhan[m]; });
  }
  return ct;
}

/** Điểm tối đa của cả đề. */
export function diemToiDa(ct) {
  return ct.phan.reduce(function (s, p) { return s + p.soCau * DANG_CAU[p.dang].toiDa(p); }, 0);
}

/** Kiểm tra cấu trúc hợp lệ -> danh sách lỗi (rỗng = hợp lệ). */
export function kiemTraCauTruc(ct) {
  var loi = [];
  if (!ct || !Array.isArray(ct.phan) || !ct.phan.length) return ['Cấu trúc đề cần có ít nhất 1 phần.'];
  if (!chuoi(ct.ten)) loi.push('Cấu trúc đề cần có tên.');
  var ma = {};
  ct.phan.forEach(function (p, i) {
    var t = 'Phần ' + (p.ma || i + 1) + ': ';
    if (!p.ma) loi.push(t + 'thiếu mã phần.');
    else if (ma[p.ma]) loi.push(t + 'trùng mã phần.'); else ma[p.ma] = 1;
    if (!DANG_CAU[p.dang]) loi.push(t + 'dạng câu "' + p.dang + '" không hỗ trợ.');
    if (!(p.soCau >= 1 && p.soCau <= 200 && Math.floor(p.soCau) === p.soCau)) loi.push(t + 'số câu phải là số nguyên từ 1 đến 200.');
    if (p.dang !== 'dung_sai' && !(p.diemMoiCau > 0)) loi.push(t + 'điểm mỗi câu phải lớn hơn 0.');
    if (p.dang === 'dung_sai' && p.bangDiem && p.bangDiem.length !== (p.soY || 4) + 1) loi.push(t + 'bảng điểm đúng sai phải có ' + ((p.soY || 4) + 1) + ' mức.');
  });
  return loi;
}
