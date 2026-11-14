/**
 * Logic thuần (không phụ thuộc nền tảng): đọc file kết quả, chấm bài, ghép học sinh theo lớp, chuẩn hóa dữ liệu.
 * Được chuyển nguyên văn từ bản Google Apps Script (đã kiểm thử), chỉ đổi phần khai báo sang ES module.
 */

export const CAU_HINH = {
  DO_DAI_MA: 8,
  KY_TU_MA: 'ABCDEFGHJKMNPQRSTUVWXYZ23456789', // bỏ 0/O, 1/I/L
  DIEM_CAU_PHAN_I: 0.25,
  DIEM_CAU_PHAN_III: 0.5,
  DIEM_PHAN_II_THEO_SO_Y_DUNG: [0, 0.1, 0.25, 0.5, 1] // 0,1,2,3,4 ý đúng
};

/**
 * Đọc "sổ" theo mẫu: tab ThongTin (tùy chọn), DeThi (khuyến nghị), KetQua (bắt buộc).
 * Trả về { ok, loi, thongTin, cauHoi: {I:[], II:[], III:[]}, hocSinh: [...], canhBao: [] }
 */
export function phanTichFile_(so) {
  so = so || {};
  var tab = {};
  Object.keys(so).forEach(function (ten) { tab[khongDau_(ten)] = (so[ten] || []).map(function (r) { return (r || []).map(chuoi_); }); });
  var tenTab = Object.keys(tab);
  var ketQua = tab.ketqua || tab.ketquathi || (tenTab.length === 1 ? tab[tenTab[0]] : null);
  if (!ketQua) return { ok: false, loi: 'Không tìm thấy tab "KetQua" trong file. Hãy dùng đúng file mẫu.' };

  var canhBao = [];

  // --- ThongTin ---
  var tt = {};
  (tab.thongtin || []).forEach(function (r) { if (r[0]) tt[khongDau_(r[0])] = (r[1] || '').trim(); });
  var thongTin = {
    tieuDe: tt.tieudephieu || tt.tieude || tt.tenbaithi || 'PHIẾU KẾT QUẢ KIỂM TRA',
    moTa: tt.mota || '',
    ngayThi: chuanHoaNgay_(tt.ngaythi),
    nhanLop: tt.nhanlop || 'Lớp',
    diemCauI: soThuc_(tt.diemmoicauphani, CAU_HINH.DIEM_CAU_PHAN_I),
    diemCauIII: soThuc_(tt.diemmoicauphaniii, CAU_HINH.DIEM_CAU_PHAN_III),
    moTaPhan: { I: tt.motaphani || '', II: tt.motaphanii || '', III: tt.motaphaniii || '' },
    tenPhan: { I: tt.tenphani || 'Câu trắc nghiệm nhiều phương án lựa chọn.', II: tt.tenphanii || 'Câu trắc nghiệm đúng sai.', III: tt.tenphaniii || 'Tự luận' }
  };

  // --- DeThi ---
  var cauHoi = { I: [], II: [], III: [] };
  var deThi = tab.dethi || [];
  var hDe = timDongTieuDe_(deThi, function (k) { return k.indexOf('phan') >= 0 && k.indexOf('cau') >= 0; });
  if (hDe >= 0) {
    var k = deThi[hDe].map(khongDau_);
    var c = {
      phan: k.indexOf('phan'), cau: k.indexOf('cau'),
      chuDe: timChiSo_(k, ['chudekienthuc', 'chude']), mucDo: timChiSo_(k, ['mucdo']),
      noiDung: timChiSo_(k, ['noidungphantichcuthe', 'noidungphantich', 'noidung']),
      dapAn: timChiSo_(k, ['dapandung', 'dapan', 'dapso'])
    };
    var cotMaDe = [];
    k.forEach(function (x, j) { var m = /^dapan(?:made|ma)(.+)$/.exec(x); if (m) cotMaDe.push({ j: j, ma: m[1] }); });
    var o = function (r, j) { return j >= 0 ? String(r[j] == null ? '' : r[j]).trim() : ''; };
    deThi.slice(hDe + 1).forEach(function (r) {
      var phan = chuanHoaPhan_(o(r, c.phan)), cau = parseInt(o(r, c.cau), 10);
      if (!phan || !cau) return;
      var dapAn = { '': o(r, c.dapAn) };
      cotMaDe.forEach(function (x) { if (o(r, x.j)) dapAn[x.ma] = o(r, x.j); });
      cauHoi[phan].push({ cau: cau, chuDe: o(r, c.chuDe), mucDo: o(r, c.mucDo), noiDung: o(r, c.noiDung), dapAn: dapAn });
    });
  } else {
    canhBao.push('Không có tab "DeThi": phiếu sẽ không có chủ đề, nội dung và đáp án đúng.');
  }

  // --- KetQua ---
  var aliasTen = ['hoten', 'hovaten', 'tenhocsinh', 'hotenhocsinh'];
  var hKq = timDongTieuDe_(ketQua, function (k) { return timChiSo_(k, aliasTen) >= 0 || k.indexOf('mahs') >= 0; });
  if (hKq < 0) return { ok: false, loi: 'Tab KetQua cần có cột "Họ và tên" (hoặc "Mã HS").' };
  var hk = ketQua[hKq].map(khongDau_);
  var ck = {
    stt: hk.indexOf('stt'), maHs: timChiSo_(hk, ['mahs', 'mahocsinh']), ten: timChiSo_(hk, aliasTen),
    lop: timChiSo_(hk, ['lop', 'loptoan', 'lophoc']), maDe: timChiSo_(hk, ['made', 'madethi']),
    p1: timChiSo_(hk, ['diemphani', 'diemphan1', 'diemp1']), p2: timChiSo_(hk, ['diemphanii', 'diemphan2', 'diemp2']),
    p3: timChiSo_(hk, ['diemphaniii', 'diemphan3', 'diemp3']), tong: timChiSo_(hk, ['tongdiem', 'diemtong']),
    sdt: timChiSo_(hk, ['sdtphuhuynh', 'sdt', 'sodienthoai', 'sdtph']),
    uu: timChiSo_(hk, ['uudiem']), nhuoc: timChiSo_(hk, ['nhuocdiem']),
    khacPhuc: timChiSo_(hk, ['huongkhacphuc', 'khacphuc']), loiKhuyen: timChiSo_(hk, ['loikhuyen'])
  };
  var cotCau = [];
  ketQua[hKq].forEach(function (h, j) {
    var m = /^(III|II|I)[.\-_ ]*(\d+)$/i.exec(String(h).replace(/\s+/g, '').replace(/^câu/i, ''));
    if (m) cotCau.push({ j: j, phan: m[1].toUpperCase(), cau: parseInt(m[2], 10) });
  });

  // Câu có trong KetQua mà DeThi không có -> thêm câu trống
  cotCau.forEach(function (x) {
    if (!cauHoi[x.phan].some(function (q) { return q.cau === x.cau; })) {
      cauHoi[x.phan].push({ cau: x.cau, chuDe: '', mucDo: '', noiDung: '', dapAn: { '': '' } });
    }
  });
  ['I', 'II', 'III'].forEach(function (p) { cauHoi[p].sort(function (a, b) { return a.cau - b.cau; }); });

  var lay = function (r, j) { return j >= 0 ? String(r[j] == null ? '' : r[j]).trim() : ''; };
  var hocSinh = [];
  ketQua.slice(hKq + 1).forEach(function (r) {
    var ten = lay(r, ck.ten).replace(/\s+/g, ' '), maHs = lay(r, ck.maHs);
    if (!ten && !maHs) return;
    var traLoi = {};
    cotCau.forEach(function (x) { traLoi[x.phan + '.' + x.cau] = lay(r, x.j); });
    hocSinh.push({
      chiSo: hocSinh.length, stt: lay(r, ck.stt), maHs: maHs, hoTen: ten, lop: lay(r, ck.lop), maDe: lay(r, ck.maDe), sdt: lay(r, ck.sdt),
      traLoi: traLoi,
      diemNhap: { p1: lay(r, ck.p1), p2: lay(r, ck.p2), p3: lay(r, ck.p3), tong: lay(r, ck.tong) },
      nhanXet: { uu: lay(r, ck.uu), nhuoc: lay(r, ck.nhuoc), khacPhuc: lay(r, ck.khacPhuc), loiKhuyen: lay(r, ck.loiKhuyen) }
    });
  });
  if (!hocSinh.length) return { ok: false, loi: 'Tab KetQua chưa có học sinh nào.' };

  if (cauHoi.III.length && ck.p3 < 0 && !cotCau.some(function (x) { return x.phan === 'III'; })) {
    canhBao.push('Không có cột "Điểm phần III" và câu trả lời phần III: điểm phần III sẽ là 0.');
  }
  return { ok: true, thongTin: thongTin, cauHoi: cauHoi, hocSinh: hocSinh, canhBao: canhBao };
}

/** Chấm bài 1 học sinh: so đáp án, tính điểm các phần (ưu tiên điểm giáo viên đã nhập). */
export function chamBai_(kq, h) {
  var maDe = khongDau_(h.maDe);
  var dapAnCua = function (q) { return (maDe && q.dapAn[maDe]) || q.dapAn[''] || ''; };
  // Chủ đề / nội dung riêng theo mã đề (khi các mã đề đảo thứ tự câu hỏi)
  var ttCau = function (q) { return (maDe && q.theoDe && q.theoDe[maDe]) || q; };
  var tt = kq.thongTin;

  var phan1 = kq.cauHoi.I.map(function (q) {
    var hs = h.traLoi['I.' + q.cau] || '', dung = dapAnCua(q);
    return { cau: q.cau, chuDe: ttCau(q).chuDe, mucDo: ttCau(q).mucDo, noiDung: ttCau(q).noiDung, hs: hs, dung: dung,
      ok: !!hs && !!dung && chuanHoaDapAn_(hs) === chuanHoaDapAn_(dung) };
  });

  var bangII = CAU_HINH.DIEM_PHAN_II_THEO_SO_Y_DUNG;
  var diemII = 0;
  var phan2 = kq.cauHoi.II.map(function (q) {
    var hs = h.traLoi['II.' + q.cau] || '', dung = dapAnCua(q);
    var a = chuoiDungSai_(hs), b = chuoiDungSai_(dung), soDung = 0;
    var kyTu = a.split('').map(function (ch, i) {
      var ok = ch !== '_' && i < b.length && ch === b[i];
      if (ok) soDung++;
      return { c: ch === 'D' ? 'Đ' : ch === 'S' ? 'S' : '–', ok: ok };
    });
    diemII += b.length === 4 ? bangII[soDung] : (b.length ? soDung / b.length : 0);
    return { cau: q.cau, chuDe: ttCau(q).chuDe, mucDo: ttCau(q).mucDo, noiDung: ttCau(q).noiDung, hs: hs, kyTu: kyTu, dung: dung, soDung: soDung };
  });

  var phan3 = kq.cauHoi.III.map(function (q) {
    var hs = h.traLoi['III.' + q.cau] || '', dung = dapAnCua(q);
    return { cau: q.cau, chuDe: ttCau(q).chuDe, mucDo: ttCau(q).mucDo, noiDung: ttCau(q).noiDung, hs: hs, dung: dung,
      ok: !!hs && !!dung && chuanHoaDapAn_(hs) === chuanHoaDapAn_(dung) };
  });

  var dn = h.diemNhap;
  var p1 = dn.p1 !== '' ? soThuc_(dn.p1, 0) : phan1.filter(function (x) { return x.ok; }).length * tt.diemCauI;
  var p2 = dn.p2 !== '' ? soThuc_(dn.p2, 0) : diemII;
  var p3 = dn.p3 !== '' ? soThuc_(dn.p3, 0) : phan3.filter(function (x) { return x.ok; }).length * tt.diemCauIII;
  var tong = dn.tong !== '' ? soThuc_(dn.tong, 0) : p1 + p2 + p3;
  var max1 = phan1.length * tt.diemCauI, max2 = phan2.length * 1, max3 = phan3.length * tt.diemCauIII;

  return {
    phan1: phan1, phan2: phan2, phan3: phan3,
    coTraLoiIII: phan3.some(function (x) { return x.hs; }),
    diem: { p1: dinhDangDiem_(p1), p2: dinhDangDiem_(p2), p3: dinhDangDiem_(p3), tong: dinhDangDiem_(tong),
      max1: dinhDangSo_(max1), max2: dinhDangSo_(max2), max3: dinhDangSo_(max3), maxTong: dinhDangSo_(max1 + max2 + max3) }
  };
}

/**
 * Ghép từng dòng file kết quả với DANH SÁCH HỌC SINH CỦA LỚP đã chọn.
 *   1. Có Mã HS  -> đúng em đó (phải thuộc lớp và họ tên khớp, nếu không -> hỏi giáo viên)
 *   2. Không có  -> theo họ tên trong lớp (duy nhất)
 *   3. Còn lại   -> hỏi giáo viên: chọn em trong lớp / em ở lớp khác / học sinh mới / bỏ qua
 * quyetDinh = { chỉ số dòng: Mã HS | 'moi' | 'boqua' }.
 * tuThemMoi: khi LỚP CHƯA CÓ HỌC SINH NÀO, dòng không trùng tên ai trong hệ thống -> tự coi là học sinh mới của lớp.
 * Trả về { dong: [ {hs, themVaoLop} | {moi} | {boQua} | {canChon, ungVien} | {loi} ], vang: [học sinh lớp không có kết quả], siSo }
 */
export function ghepTheoLop_(dsKq, dsHs, nhom, quyetDinh, tuThemMoi) {
  quyetDinh = quyetDinh || {};
  var theoMa = {};
  dsHs.forEach(function (x) { theoMa[x.maHs] = x; });
  var lop = dsHs.filter(function (x) { return thuocNhom_(x, nhom); });
  var cungTen = function (h) { return dsHs.filter(function (x) { return khongDau_(x.hoTen) === khongDau_(h.hoTen); }); };
  var ghepMot = function (h, i) {
    var qd = quyetDinh[i];
    if (qd === 'boqua') return { boQua: true };
    if (qd === 'moi') return { moi: true };
    if (qd && theoMa[qd]) return { hs: theoMa[qd], themVaoLop: !thuocNhom_(theoMa[qd], nhom) };
    if (h.maHs) {
      var x = theoMa[h.maHs];
      if (!x) return { canChon: 'maLa', ungVien: cungTen(h) };
      if (!thuocNhom_(x, nhom)) return { canChon: 'ngoaiLop', ungVien: [x] };
      if (h.hoTen && khongDau_(h.hoTen) !== khongDau_(x.hoTen)) return { canChon: 'lechTen', ungVien: [x] };
      return { hs: x };
    }
    var trongLop = lop.filter(function (x) { return khongDau_(x.hoTen) === khongDau_(h.hoTen); });
    if (trongLop.length === 1) return { hs: trongLop[0] };
    if (trongLop.length > 1) return { canChon: 'trungTen', ungVien: trongLop };
    var khac = cungTen(h);
    // Lớp chưa có danh sách (lần gửi đầu) -> tự thêm. Lớp đã có danh sách -> tên lạ thường là gõ sai, phải hỏi giáo viên.
    if (!khac.length && tuThemMoi && !lop.length) return { moi: true, tuDong: true };
    return { canChon: 'khongCo', ungVien: khac };
  };
  var daGap = {};
  var dong = dsKq.map(function (h, i) {
    var r = ghepMot(h, i);
    if (r.hs) {
      if (daGap[r.hs.maHs]) r = { loi: 'Trùng học sinh với một dòng khác trong file (' + r.hs.maHs + ')' };
      else daGap[r.hs.maHs] = true;
    }
    return r;
  });
  return { dong: dong, vang: lop.filter(function (x) { return !daGap[x.maHs]; }), siSo: lop.length };
}

export function chuoi_(x) { return x == null ? '' : String(x).trim(); }

/** "Toán 2; Tiếng Anh A1" -> ['Toán 2', 'Tiếng Anh A1'] (bỏ trùng, chấp nhận ; hoặc ,) */
export function tachNhom_(s) {
  var daCo = {}, ds = [];
  String(s == null ? '' : s).split(/[;,\n]/).forEach(function (x) {
    x = x.replace(/\s+/g, ' ').trim();
    if (x && !daCo[khongDau_(x)]) { daCo[khongDau_(x)] = true; ds.push(x); }
  });
  return ds;
}

export function noiNhom_(ds) { return tachNhom_((ds || []).join(';')).join('; '); }

export function thuocNhom_(hs, nhom) {
  var k = khongDau_(nhom);
  return (hs.nhom || tachNhom_(hs.lop)).some(function (n) { return khongDau_(n) === k; });
}

export function chuanHoaSdt_(s) { return String(s || '').replace(/\D/g, '').replace(/^84/, '0'); }

/** Bỏ dấu, chữ thường, bỏ ký tự không phải chữ/số — để so tên cột, tên tab, họ tên. */
export function khongDau_(s) {
  return String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[đĐ]/g, 'd').toLowerCase().replace(/[^a-z0-9]/g, '');
}

export function timChiSo_(dsKhoa, dsTen) {
  for (var i = 0; i < dsTen.length; i++) { var j = dsKhoa.indexOf(dsTen[i]); if (j >= 0) return j; }
  return -1;
}

export function timDongTieuDe_(bang, dieuKien) {
  for (var i = 0; i < Math.min(15, bang.length); i++) if (dieuKien(bang[i].map(khongDau_))) return i;
  return -1;
}

export function chuanHoaPhan_(s) {
  var k = khongDau_(s).replace(/^phan/, '');
  return { i: 'I', '1': 'I', ii: 'II', '2': 'II', iii: 'III', '3': 'III' }[k] || '';
}

export function chuanHoaDapAn_(s) {
  return String(s).normalize('NFC').toUpperCase().replace(/\s+/g, '').replace(/,/g, '.').replace(/[;|]/g, ';');
}

/** "Đ,S,Đ,S" / "DSDS" / "đ s đ s" -> "DSDS" */
export function chuoiDungSai_(s) {
  s = String(s == null ? '' : s).normalize('NFC').toUpperCase().replace(/Đ/g, 'D');
  if (!s.replace(/[^DS]/g, '')) return '';
  // Có dấu phân cách ("Đ,S,,Đ" / ",Đ,Đ,S"): giữ đúng vị trí ý bỏ trống bằng "_"
  if (/[,;|]/.test(s)) return s.split(/[,;|]/).map(function (x) { x = x.replace(/[^DS]/g, ''); return x ? x.charAt(0) : '_'; }).join('');
  return s.replace(/[^DS]/g, '');
}

export function soThuc_(s, macDinh) {
  var n = parseFloat(String(s == null ? '' : s).replace(',', '.'));
  return isNaN(n) ? macDinh : n;
}

export function dinhDangDiem_(n) { return (Math.round(n * 100) / 100).toFixed(2); }

export function dinhDangSo_(n) { return String(Math.round(n * 100) / 100); }

/** Điểm đọc từ Sheet có thể là số (8.5) hoặc chuỗi ("8.50") -> luôn trả "8.50". */
export function chuoiDiem_(x) { return x === '' || x == null ? '' : dinhDangDiem_(soThuc_(x, 0)); }

/** "5/9/2026", "05-09-2026", "2026-09-05" -> "05/09/2026" ('' nếu không hiểu). */
export function chuanHoaNgay_(s) {
  s = chuoi_(s);
  var m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s);
  if (m) return ('0' + m[3]).slice(-2) + '/' + ('0' + m[2]).slice(-2) + '/' + m[1];
  m = /^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/.exec(s);
  if (m) return ('0' + m[1]).slice(-2) + '/' + ('0' + m[2]).slice(-2) + '/' + m[3];
  return '';
}

/** "05/09/2026" -> 20260905 để sắp xếp theo thời gian. */
export function soThuTuNgay_(s) {
  var m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(chuanHoaNgay_(s));
  return m ? Number(m[3] + m[2] + m[1]) : 0;
}

export function chuanHoaMa_(s) { return String(s == null ? '' : s).toUpperCase().replace(/[^A-Z0-9]/g, ''); }

export function hienThiMa_(ma) { return ma.slice(0, 4) + '-' + ma.slice(4); }

export const LY_DO_CAN_CHON = {
  maLa: 'Mã HS trong file không có trong hệ thống',
  ngoaiLop: 'Học sinh này chưa thuộc lớp — thêm vào lớp?',
  lechTen: 'Họ tên trong file khác với họ tên của Mã HS',
  trungTen: 'Lớp có nhiều học sinh trùng họ tên — chọn đúng em',
  khongCo: 'Không tìm thấy trong lớp'
};

export const MAU_FILE_KET_QUA = {
  KetQua: [
    ['STT', 'Mã HS', 'Họ và tên', 'Lớp', 'Mã đề',
      'I.1', 'I.2', 'I.3', 'I.4', 'I.5', 'I.6', 'I.7', 'I.8', 'I.9', 'I.10', 'I.11', 'I.12',
      'II.1', 'II.2', 'II.3', 'II.4',
      'III.1', 'III.2', 'III.3', 'III.4', 'III.5', 'III.6',
      'Điểm phần I', 'Điểm phần II', 'Điểm phần III', 'Tổng điểm',
      'Ưu điểm', 'Nhược điểm', 'Hướng khắc phục', 'Lời khuyên'],
    ['1', '', 'Nguyễn Văn An', 'Toán 2', '105',
      'A', 'B', 'C', 'D', 'B', 'C', 'D', 'C', 'C', 'D', 'A', 'B',
      'Đ,Đ,S,S', 'Đ,Đ,Đ,S', 'Đ,S,Đ,S', 'Đ,S,S,S',
      '', '', '', '', '', '',
      '', '', '2.25', '',
      'Học lực giỏi, nắm bắt toàn diện kiến thức; nhận biết và thông hiểu tốt phần trắc nghiệm; phân tích và tư duy logic câu hỏi đúng/sai rất tốt.',
      'Chưa phát hiện nhược điểm lớn.', 'Phát huy phong độ hiện tại, mở rộng thêm các dạng bài nâng cao.', ''],
    ['2', '', 'Trần Thị Bình', 'Toán 2', '105',
      'A', 'C', 'C', 'D', 'B', 'A', 'D', 'A', 'B', 'D', 'A', 'C',
      'Đ,S,S,S', 'Đ,Đ,S,S', 'Đ,S,Đ,Đ', 'Đ,S,S,Đ',
      '', '', '', '', '', '',
      '', '', '1.5', '',
      'Chăm chỉ, nắm vững kiến thức cơ bản về lượng giác.', 'Còn nhầm lẫn khi biến đổi công thức lượng giác; chưa chắc phần cấp số nhân.',
      'Ôn lại công thức cộng, nhân đôi; luyện thêm bài tập cấp số nhân.', '']
  ],
  DeThi: [
    ['Phần', 'Câu', 'Chủ đề kiến thức', 'Mức độ', 'Nội dung phân tích cụ thể', 'Đáp án đúng'],
    ['I', '1', 'Lượng giác', '', 'Giá trị lượng giác của góc/cung lượng giác, góc phần tư', 'A'],
    ['I', '2', 'Lượng giác', '', 'Công thức lượng giác (cộng, nhân đôi, biến đổi tích-tổng)', 'B'],
    ['I', '3', 'Hàm số lượng giác', '', 'Tập xác định, tập giá trị, tính chẵn lẻ, chu kì tuần hoàn', 'C'],
    ['I', '4', 'Phương trình lượng giác', '', 'Nghiệm của phương trình lượng giác cơ bản (sin, cos, tan, cot)', 'D'],
    ['I', '5', 'Dãy số / Cấp số', '', 'Cấp số cộng (số hạng tổng quát, công sai)', 'B'],
    ['I', '6', 'Tổ hợp xác suất', '', 'Quy tắc đếm, hoán vị, chỉnh hợp, tổ hợp', 'C'],
    ['I', '7', 'Lượng giác', '', 'Biến đổi và tính giá trị lượng giác nâng cao', 'D'],
    ['I', '8', 'Phương trình lượng giác', '', 'Giải phương trình lượng giác cơ bản có điều kiện', 'A'],
    ['I', '9', 'Dãy số / Cấp số', '', 'Cấp số nhân hoặc tính tổng các số hạng của CSC/CSN', 'C'],
    ['I', '10', 'Xác suất', '', 'Tính xác suất của biến cố trong không gian mẫu cơ bản', 'D'],
    ['I', '11', 'Hàm số bậc hai', '', 'Tọa độ đỉnh, tính đồng biến/nghịch biến, GTLN-GTNN của Parabol', 'A'],
    ['I', '12', 'Hình học tọa độ Oxy', '', 'Đường thẳng, khoảng cách từ điểm đến đường thẳng, đường tròn', 'B'],
    ['II', '1', 'Hàm số lượng giác & Đồ thị', '', 'a) Tập xác định hàm lượng giác\nb) Dựa vào đồ thị tìm GTLN / GTNN\nc) Tính giá trị lượng giác của góc a\nd) Công thức nhân đôi góc lượng giác', 'ĐĐSS'],
    ['II', '2', 'Phương trình lượng giác', '', 'a) Kiểm tra nghiệm cụ thể\nb) Biến đổi tương đương phương trình cơ bản\nc) Số nghiệm trên một khoảng/đoạn cho trước\nd) Tổng các nghiệm thuộc đoạn cho trước', 'ĐĐĐS'],
    ['II', '3', 'Cấp số cộng / Cấp số nhân', '', 'a) Nhận biết CSC/CSN và tìm công sai/công bội\nb) Tính số hạng tổng quát thứ n\nc) Tính tổng n số hạng đầu tiên\nd) Tìm chỉ số n của số hạng thỏa mãn điều kiện', 'ĐSĐS'],
    ['II', '4', 'Ứng dụng thực tế (Parabol)', '', 'a) Độ cao ban đầu (tại thời điểm t = 0)\nb) Tính độ cao tại thời điểm t bất kỳ\nc) Thời điểm vật đạt độ cao lớn nhất (đỉnh Parabol)\nd) Khoảng thời gian vật ở trên một độ cao cho trước', 'ĐSSĐ'],
    ['III', '1', 'Lượng giác', 'Thông hiểu', 'Cho giá trị sin/cos và khoảng góc, tính giá trị lượng giác còn lại và biểu thức chứa sin2a, cos2a', '-4/5; 7/25'],
    ['III', '2', 'Phương trình lượng giác', 'Vận dụng', 'Giải phương trình lượng giác quy về phương trình bậc hai hoặc phương trình cơ bản, tìm nghiệm thuộc khoảng/đoạn', '3π/4; 7π/4'],
    ['III', '3', 'Quy hoạch tuyến tính', 'Vận dụng', 'Bài toán thực tế sản xuất xưởng: lập hệ bất phương trình, xác định miền nghiệm và tìm giá trị lớn nhất của tiền lãi', '500 nghìn đồng'],
    ['III', '4', 'Hình học tọa độ Oxy', 'Vận dụng', 'Viết phương trình tổng quát đường thẳng AB và phương trình đường tròn có tâm và tiếp xúc với đường thẳng', '2'],
    ['III', '5', 'Tổ hợp nâng cao', 'Vận dụng cao', 'Bài toán đếm nâng cao: sắp xếp học sinh xen kẽ, lập số tự nhiên thỏa điều kiện chữ số, chia nhóm', '72'],
    ['III', '6', 'Xác suất nâng cao', 'Vận dụng cao', 'Xác suất chọn số, gieo xúc xắc/đồng xu thỏa mãn các điều kiện tổng chia hết, tích chẵn/lẻ hoặc có mặt nhiều hơn', '1/3']
  ],
  ThongTin: [
    ['Mục', 'Giá trị', 'Ghi chú'],
    ['Tiêu đề phiếu', 'PHÂN TÍCH BÀI THI - THÁNG 9 NĂM 2026', 'Dòng tiêu đề lớn trên phiếu; cũng là tên đợt thi mặc định'],
    ['Mô tả', 'Bài thi cuối khóa 1 – Lớp 11', 'Dòng ngay dưới tiêu đề'],
    ['Ngày thi', '28/09/2026', 'dd/mm/yyyy — để sắp xếp các bài thi và lần làm theo thời gian'],
    ['Nhãn lớp', 'Lớp toán', 'Chữ hiển thị trước tên lớp trên phiếu'],
    ['Điểm mỗi câu phần I', '0.25', 'Dùng khi cột "Điểm phần I" để trống'],
    ['Điểm mỗi câu phần III', '0.5', 'Dùng khi cột "Điểm phần III" để trống và có nhập câu trả lời phần III'],
    ['Mô tả phần I', 'Phần này gồm 12 câu hỏi trắc nghiệm khách quan, các câu hỏi ở mức độ 1.', ''],
    ['Mô tả phần II', 'Phần này gồm 4 câu hỏi. Mỗi câu hỏi gồm 4 ý (a, b, c, d), yêu cầu học sinh phải nắm vững bản chất vấn đề và xét tính đúng/sai của từng mệnh đề độc lập.', ''],
    ['Mô tả phần III', 'Phần này gồm 6 câu hỏi, đòi hỏi tư duy cao hơn. Học sinh phải tự giải quyết bài toán và điền đáp án cuối cùng.', '']
  ],
  HuongDan: [
    ['HƯỚNG DẪN ĐIỀN FILE KẾT QUẢ'],
    ['• Tab KetQua: mỗi học sinh 1 dòng. Tải mẫu từ bảng điều khiển sau khi chọn lớp thì cột "Mã HS" và "Họ và tên" đã được điền sẵn — KHÔNG sửa cột Mã HS.'],
    ['• Cột I.1 … I.12: đáp án học sinh chọn ở phần I (A/B/C/D).'],
    ['• Cột II.1 … II.4: đáp án đúng/sai của 4 ý, viết "Đ,S,Đ,S" hoặc "ĐSĐS".'],
    ['• Cột III.1 … III.6: đáp số học sinh điền (có thể để trống nếu chấm tay và nhập thẳng "Điểm phần III").'],
    ['• Cột điểm để trống thì hệ thống tự tính: phần I 0,25đ/câu; phần II theo số ý đúng (1 ý 0,1 – 2 ý 0,25 – 3 ý 0,5 – 4 ý 1đ); phần III 0,5đ/câu.'],
    ['• Muốn thêm/bớt câu: thêm/xóa cột trong KetQua (vd I.13) và dòng tương ứng trong DeThi.'],
    ['• Tab DeThi: chủ đề, nội dung và đáp án đúng của từng câu. Nhiều mã đề: thêm cột "Đáp án mã 106", "Đáp án mã 107"…'],
    ['• Cùng 1 bài thi làm lại nhiều lần: gửi file mới và chọn đúng tên bài thi cũ → hệ thống tự ghi Lần 2, Lần 3… (giữ nguyên các lần trước).'],
    ['• Nhận xét (Ưu điểm, Nhược điểm, Hướng khắc phục, Lời khuyên) để trống thì phiếu sẽ bỏ qua mục đó (Lời khuyên có câu mặc định).']
  ]
};

/* =====================================================================
 * HAI FILE TẢI LÊN
 *   1. Bảng kết quả học sinh  — mỗi học sinh 1 dòng: Họ và tên, Lớp, Số báo danh, Mã đề thi, Câu 1…N (đáp án học sinh chọn),
 *      Điểm trắc nghiệm / đúng sai / điền từ, Tổng điểm, nhận xét. (Đọc được nguyên file giáo viên đang dùng để trộn thư Word.)
 *   2. Bảng đáp án theo mã đề — tab DapAn: mỗi mã đề 1 dòng (Mã đề | Câu 1…N);
 *      tab CauHoi (tùy chọn): Câu | Phần | Chủ đề | Mức độ | Nội dung (| Mã đề nếu riêng từng mã đề); tab ThongTin (tùy chọn).
 * Kết quả trả về cùng dạng với phanTichFile_() để dùng chung chamBai_().
 * ===================================================================== */

var ALIAS_TEN = ['hoten', 'hovaten', 'tenhocsinh', 'hotenhocsinh'];

function oChuoi_(r, j) { return j >= 0 ? String(r[j] == null ? '' : r[j]).trim() : ''; }

function chuanHoaSo_(so) {
  var tab = {};
  Object.keys(so || {}).forEach(function (ten) { tab[khongDau_(ten)] = { ten: ten, dong: (so[ten] || []).map(function (r) { return (r || []).map(chuoi_); }) }; });
  return tab;
}

/** "Câu 12" | "Cau12" | "C12" -> 12 ; "12" -> null (cột số trần là đáp án đúng chép theo dòng, xử lý riêng) */
function soCauTuTieuDe_(h) {
  var m = /^(?:cau|c)\s*(\d+)$/.exec(khongDau_(h).replace(/(\d)/, ' $1').replace(/\s+/g, ''));
  if (m) return parseInt(m[1], 10);
  m = /^c(?:au)?(\d+)$/.exec(khongDau_(h));
  return m ? parseInt(m[1], 10) : null;
}

/** Tách ô "+ Ưu điểm: …\n+ Nhược điểm: …" thành 2 phần. */
export function tachNhanXet(s) {
  s = String(s || '').replace(/\r/g, '');
  var kq = { uu: '', nhuoc: '' };
  var mu = /ưu\s*điểm\s*:?\s*([\s\S]*?)(?=\n?\s*\+?\s*nhược\s*điểm|$)/i.exec(s);
  var mn = /nhược\s*điểm\s*:?\s*([\s\S]*)$/i.exec(s);
  if (mu) kq.uu = mu[1].replace(/^\s*\+\s*/, '').trim();
  if (mn) kq.nhuoc = mn[1].replace(/^\s*\+\s*/, '').trim();
  if (!mu && !mn) kq.uu = s.trim();
  return kq;
}

/** Đọc bảng kết quả học sinh. */
export function docFileKetQua(so) {
  var tab = chuanHoaSo_(so), ds = Object.keys(tab);
  var bang = (tab.ketqua || tab.ketquathi || tab.tonghopdiem || tab[ds[0]] || { dong: [] }).dong;
  var hIdx = timDongTieuDe_(bang, function (k) { return timChiSo_(k, ALIAS_TEN) >= 0 || k.indexOf('mahs') >= 0; });
  if (hIdx < 0) return { ok: false, loi: 'Bảng kết quả cần có cột "Họ và tên" (hoặc "Mã HS").' };
  var tieuDe = bang[hIdx], hk = tieuDe.map(khongDau_);
  var c = {
    stt: hk.indexOf('stt'), thuHang: timChiSo_(hk, ['thuhang', 'xephang', 'hang']), maHs: timChiSo_(hk, ['mahs', 'mahocsinh']),
    ten: timChiSo_(hk, ALIAS_TEN), lop: timChiSo_(hk, ['lop', 'loptoan', 'lophoc', 'nhomlop', 'nhom']),
    sbd: timChiSo_(hk, ['sobaodanh', 'sbd']), maDe: timChiSo_(hk, ['madethi', 'made', 'ma']), sdt: timChiSo_(hk, ['sdtphuhuynh', 'sdt', 'sodienthoai']),
    p1: timChiSo_(hk, ['diemtracnghiem', 'diemphani', 'diemphan1', 'diemp1']),
    p2: timChiSo_(hk, ['diemdungsai', 'diemphanii', 'diemphan2', 'diemp2']),
    p3: timChiSo_(hk, ['diemdientu', 'diemtraloingan', 'diemtuluan', 'diemphaniii', 'diemphan3', 'diemp3']),
    tong: timChiSo_(hk, ['tongdiem', 'diemtong']),
    uuNhuoc: timChiSo_(hk, ['uunhuoc', 'uunhuocdiem', 'nhanxet']), uu: timChiSo_(hk, ['uudiem']), nhuoc: timChiSo_(hk, ['nhuocdiem']),
    khacPhuc: timChiSo_(hk, ['huongkhacphuc', 'khacphuc']), loiKhuyen: timChiSo_(hk, ['loikhuyen'])
  };
  var cotCau = [], cotDapAnDong = [];
  tieuDe.forEach(function (h, j) {
    var n = soCauTuTieuDe_(h);
    if (n) cotCau.push({ j: j, n: n });
    else if (/^\d{1,3}$/.test(String(h).trim())) cotDapAnDong.push({ j: j, n: parseInt(h, 10) }); // đáp án đúng chép theo từng dòng (kiểu trộn thư)
  });
  var hocSinh = [], dapAnTrongDong = {}, xepHang = 0;
  bang.slice(hIdx + 1).forEach(function (r) {
    var ten = oChuoi_(r, c.ten).replace(/\s+/g, ' '), maHs = oChuoi_(r, c.maHs);
    if (!ten && !maHs) return;
    var traLoiGoc = {};
    cotCau.forEach(function (x) { traLoiGoc[x.n] = oChuoi_(r, x.j); });
    var maDe = oChuoi_(r, c.maDe);
    if (cotDapAnDong.length && maDe) {
      var k = khongDau_(maDe);
      if (!dapAnTrongDong[k]) dapAnTrongDong[k] = { ten: maDe, dapAn: {} };
      cotDapAnDong.forEach(function (x) { var v = oChuoi_(r, x.j); if (v && !dapAnTrongDong[k].dapAn[x.n]) dapAnTrongDong[k].dapAn[x.n] = v; });
    }
    var nx = c.uuNhuoc >= 0 ? tachNhanXet(oChuoi_(r, c.uuNhuoc)) : { uu: '', nhuoc: '' };
    if (oChuoi_(r, c.thuHang)) xepHang++;
    hocSinh.push({
      chiSo: hocSinh.length, stt: oChuoi_(r, c.stt), thuHang: oChuoi_(r, c.thuHang), maHs: maHs, hoTen: ten, lop: oChuoi_(r, c.lop),
      sbd: oChuoi_(r, c.sbd), maDe: maDe, sdt: oChuoi_(r, c.sdt), traLoiGoc: traLoiGoc,
      diemNhap: { p1: oChuoi_(r, c.p1), p2: oChuoi_(r, c.p2), p3: oChuoi_(r, c.p3), tong: oChuoi_(r, c.tong) },
      nhanXet: { uu: oChuoi_(r, c.uu) || nx.uu, nhuoc: oChuoi_(r, c.nhuoc) || nx.nhuoc, khacPhuc: oChuoi_(r, c.khacPhuc), loiKhuyen: oChuoi_(r, c.loiKhuyen) }
    });
  });
  if (!hocSinh.length) return { ok: false, loi: 'Bảng kết quả chưa có học sinh nào.' };
  return { ok: true, hocSinh: hocSinh, soCau: cotCau.map(function (x) { return x.n; }), dapAnTrongDong: dapAnTrongDong, soXepHang: xepHang };
}

/** Đọc bảng đáp án theo mã đề. */
export function docFileDapAn(so) {
  var tab = chuanHoaSo_(so), ds = Object.keys(tab);
  var bangDa = (tab.dapan || tab.dapantheomade || tab[ds[0]] || { dong: [] }).dong;
  var hIdx = timDongTieuDe_(bangDa, function (k) { return timChiSo_(k, ['made', 'madethi']) >= 0; });
  if (hIdx < 0) return { ok: false, loi: 'File đáp án cần có tab "DapAn" với cột "Mã đề" và các cột "Câu 1", "Câu 2"…' };
  var h = bangDa[hIdx], cMa = timChiSo_(h.map(khongDau_), ['made', 'madethi']);
  var cot = [];
  h.forEach(function (t, j) { var n = soCauTuTieuDe_(t) || (/^\d{1,3}$/.test(String(t).trim()) ? parseInt(t, 10) : null); if (n && j !== cMa) cot.push({ j: j, n: n }); });
  var dapAn = {};
  bangDa.slice(hIdx + 1).forEach(function (r) {
    var ma = oChuoi_(r, cMa);
    if (!ma) return;
    var x = { ten: ma, dapAn: {} };
    cot.forEach(function (c) { var v = oChuoi_(r, c.j); if (v) x.dapAn[c.n] = v; });
    dapAn[khongDau_(ma)] = x;
  });
  if (!Object.keys(dapAn).length) return { ok: false, loi: 'File đáp án chưa có mã đề nào.' };

  // Thông tin từng câu (tùy chọn)
  var cauHoi = {}, theoDe = {};
  var bangCh = (tab.cauhoi || tab.dethi || { dong: [] }).dong;
  var hc = timDongTieuDe_(bangCh, function (k) { return k.indexOf('cau') >= 0; });
  if (hc >= 0) {
    var k = bangCh[hc].map(khongDau_);
    var cc = { cau: k.indexOf('cau'), phan: k.indexOf('phan'), chuDe: timChiSo_(k, ['chudekienthuc', 'chude']), mucDo: timChiSo_(k, ['mucdo']),
      noiDung: timChiSo_(k, ['noidungphantichcuthe', 'noidungphantich', 'noidung']), maDe: timChiSo_(k, ['made', 'madethi']) };
    bangCh.slice(hc + 1).forEach(function (r) {
      var n = parseInt(oChuoi_(r, cc.cau), 10);
      if (!n) return;
      var tt = { phan: chuanHoaPhan_(oChuoi_(r, cc.phan)), chuDe: oChuoi_(r, cc.chuDe), mucDo: oChuoi_(r, cc.mucDo), noiDung: oChuoi_(r, cc.noiDung) };
      var ma = khongDau_(oChuoi_(r, cc.maDe));
      if (ma) { (theoDe[n] = theoDe[n] || {})[ma] = tt; } else cauHoi[n] = tt;
    });
  }
  // Thông tin chung (tùy chọn) — giống tab ThongTin của mẫu cũ
  var tt = {};
  ((tab.thongtin || { dong: [] }).dong).forEach(function (r) { if (r[0]) tt[khongDau_(r[0])] = (r[1] || '').trim(); });
  return { ok: true, dapAn: dapAn, cauHoi: cauHoi, theoDe: theoDe, tt: tt };
}

/** Phần I (A/B/C/D) · II (4 ý Đ/S) · III (còn lại), đoán theo đáp án nếu file không ghi "Phần". */
function doanPhan_(dsDapAn) {
  var co = dsDapAn.filter(Boolean);
  if (!co.length) return '';
  if (co.every(function (v) { return /^[A-D]$/i.test(v.trim()); })) return 'I';
  if (co.every(function (v) { return chuoiDungSai_(v).length === 4 && v.replace(/[\s,;.|]/g, '').length === 4; })) return 'II';
  return 'III';
}

/**
 * Ghép bảng kết quả + bảng đáp án -> dữ liệu dùng chung với chamBai_().
 * da = null: dùng đáp án chép trong từng dòng của bảng kết quả (nếu có).
 */
export function ghepHaiFile(kqF, da, thongTinThem) {
  if (!kqF.ok) return kqF;
  if (da && !da.ok) return da;
  var canhBao = [];
  var dapAn = da ? da.dapAn : kqF.dapAnTrongDong;
  if (!da && Object.keys(dapAn).length) canhBao.push('Chưa có file đáp án: đang dùng đáp án đúng chép trong từng dòng của bảng kết quả.');
  if (!da && !Object.keys(dapAn).length) canhBao.push('Chưa có file đáp án: phiếu sẽ không có cột đáp án đúng.');
  var tt = (da && da.tt) || {};
  var thongTin = {
    tieuDe: tt.tieudephieu || tt.tieude || (thongTinThem && thongTinThem.tieuDe) || 'PHIẾU KẾT QUẢ KIỂM TRA',
    moTa: tt.mota || '', ngayThi: chuanHoaNgay_(tt.ngaythi), nhanLop: tt.nhanlop || 'Lớp',
    diemCauI: soThuc_(tt.diemmoicauphani, CAU_HINH.DIEM_CAU_PHAN_I), diemCauIII: soThuc_(tt.diemmoicauphaniii, CAU_HINH.DIEM_CAU_PHAN_III),
    moTaPhan: { I: tt.motaphani || '', II: tt.motaphanii || '', III: tt.motaphaniii || '' },
    tenPhan: { I: tt.tenphani || 'Câu trắc nghiệm nhiều phương án lựa chọn.', II: tt.tenphanii || 'Câu trắc nghiệm đúng sai.', III: tt.tenphaniii || 'Tự luận' }
  };
  // Danh sách câu: từ file đáp án, bảng kết quả, và thông tin câu hỏi
  var soCau = {};
  kqF.soCau.forEach(function (n) { soCau[n] = 1; });
  Object.keys(dapAn).forEach(function (m) { Object.keys(dapAn[m].dapAn).forEach(function (n) { soCau[n] = 1; }); });
  if (da) Object.keys(da.cauHoi).forEach(function (n) { soCau[n] = 1; });
  var dsCau = Object.keys(soCau).map(Number).sort(function (a, b) { return a - b; });
  var cauHoi = { I: [], II: [], III: [] }, viTri = {};
  dsCau.forEach(function (n) {
    var meta = (da && da.cauHoi[n]) || {};
    var phan = meta.phan || doanPhan_(Object.keys(dapAn).map(function (m) { return dapAn[m].dapAn[n]; })) ||
      doanPhan_(kqF.hocSinh.map(function (h) { return h.traLoiGoc[n]; })) || 'III';
    var q = { cau: cauHoi[phan].length + 1, cauGoc: n, chuDe: meta.chuDe || '', mucDo: meta.mucDo || '', noiDung: meta.noiDung || '', dapAn: { '': '' } };
    Object.keys(dapAn).forEach(function (m) { if (dapAn[m].dapAn[n]) q.dapAn[m] = dapAn[m].dapAn[n]; });
    if (da && da.theoDe[n]) { q.theoDe = {}; Object.keys(da.theoDe[n]).forEach(function (m) { var x = da.theoDe[n][m]; q.theoDe[m] = { chuDe: x.chuDe || q.chuDe, mucDo: x.mucDo || q.mucDo, noiDung: x.noiDung || q.noiDung }; }); }
    cauHoi[phan].push(q);
    viTri[n] = phan + '.' + q.cau;
  });
  // Mã đề của học sinh không có trong đáp án
  var thieu = {};
  kqF.hocSinh.forEach(function (h) { var m = khongDau_(h.maDe); if (Object.keys(dapAn).length && (!m || !dapAn[m])) thieu[h.maDe || '(trống)'] = (thieu[h.maDe || '(trống)'] || 0) + 1; });
  Object.keys(thieu).forEach(function (m) { canhBao.push('Mã đề ' + m + ' không có trong file đáp án (' + thieu[m] + ' học sinh) — phiếu của các em này không có đáp án đúng.'); });
  var hocSinh = kqF.hocSinh.map(function (h) {
    var traLoi = {};
    Object.keys(h.traLoiGoc).forEach(function (n) { if (viTri[n]) traLoi[viTri[n]] = h.traLoiGoc[n]; });
    var x = {}; Object.keys(h).forEach(function (k) { if (k !== 'traLoiGoc') x[k] = h[k]; });
    x.traLoi = traLoi;
    return x;
  });
  var kq = { ok: true, thongTin: thongTin, cauHoi: cauHoi, hocSinh: hocSinh, canhBao: canhBao, soXepHang: kqF.soXepHang,
    maDe: Object.keys(dapAn).map(function (m) { return dapAn[m].ten; }) };
  // Đối chiếu: điểm giáo viên nhập so với điểm tính từ đáp án (phát hiện nhầm file đáp án / nhầm mã đề)
  if (Object.keys(dapAn).length) {
    var lech = { p1: 0, p2: 0 };
    hocSinh.forEach(function (h) {
      if (!dapAn[khongDau_(h.maDe)]) return;
      var tu = chamBai_(kq, Object.assign({}, h, { diemNhap: { p1: '', p2: '', p3: h.diemNhap.p3 || '0', tong: '' } }));
      if (h.diemNhap.p1 !== '' && Math.abs(soThuc_(h.diemNhap.p1, 0) - soThuc_(tu.diem.p1, 0)) > 0.001) lech.p1++;
      if (h.diemNhap.p2 !== '' && Math.abs(soThuc_(h.diemNhap.p2, 0) - soThuc_(tu.diem.p2, 0)) > 0.001) lech.p2++;
    });
    if (lech.p1) canhBao.push(lech.p1 + ' học sinh có "điểm trắc nghiệm" khác với điểm tính từ đáp án — kiểm tra lại file đáp án hoặc mã đề. Phiếu dùng điểm giáo viên nhập.');
    if (lech.p2) canhBao.push(lech.p2 + ' học sinh có "điểm đúng sai" khác với điểm tính từ đáp án — kiểm tra lại. Phiếu dùng điểm giáo viên nhập.');
  }
  return kq;
}

/* =====================================================================
 * FILE MẪU (2 file): giáo viên tải về, điền, rồi tải lên
 * ===================================================================== */

/** Mẫu bảng kết quả: cột giống bảng giáo viên đang dùng để trộn thư; điền sẵn danh sách lớp nếu có. */
export function taoMauKetQua(dsHocSinh, tenLop, soCau) {
  soCau = soCau || 22;
  var cau = []; for (var i = 1; i <= soCau; i++) cau.push('Câu ' + i);
  var tieuDe = ['STT', 'Mã HS', 'Họ và tên', 'Lớp', 'Số báo danh', 'Mã đề thi'].concat(cau,
    ['Điểm trắc nghiệm', 'Điểm đúng sai', 'Điểm điền từ', 'Tổng điểm', 'Thứ hạng', 'Ưu điểm', 'Nhược điểm', 'Hướng khắc phục', 'Lời khuyên']);
  var dong = (dsHocSinh || []).map(function (h, j) {
    var r = tieuDe.map(function () { return ''; });
    r[0] = String(j + 1); r[1] = h.maHs; r[2] = h.hoTen; r[3] = tenLop || '';
    return r;
  });
  if (!dong.length) {
    var vd = tieuDe.map(function () { return ''; });
    vd[0] = '1'; vd[2] = 'Nguyễn Văn An'; vd[3] = tenLop || 'Toán 1'; vd[4] = '210101'; vd[5] = '105';
    'A B C D B C D A C D A B'.split(' ').forEach(function (x, k) { vd[6 + k] = x; });
    ['Đ,Đ,S,S', 'Đ,Đ,Đ,S', 'Đ,S,Đ,S', 'Đ,S,S,Đ'].forEach(function (x, k) { vd[18 + k] = x; });
    vd[6 + soCau] = '3'; vd[7 + soCau] = '4'; vd[8 + soCau] = '2.65'; vd[9 + soCau] = '9.65';
    vd[11 + soCau] = 'Học lực giỏi, nắm bắt toàn diện kiến thức.'; vd[12 + soCau] = 'Chưa phát hiện nhược điểm lớn.';
    vd[13 + soCau] = 'Phát huy phong độ hiện tại, mở rộng thêm các dạng bài nâng cao.';
    dong.push(vd);
  }
  return {
    KetQua: [tieuDe].concat(dong),
    HuongDan: [
      ['HƯỚNG DẪN — BẢNG KẾT QUẢ HỌC SINH'],
      ['• Mỗi học sinh 1 dòng. KHÔNG sửa cột "Mã HS" (đã điền sẵn khi tải mẫu của lớp) — đó là mã để nhận đúng học sinh.'],
      ['• "Mã đề thi": mã đề học sinh làm. Đáp án đúng của từng mã đề nằm ở file đáp án riêng — KHÔNG cần chép đáp án vào từng dòng.'],
      ['• "Câu 1" … "Câu N": đáp án học sinh chọn. Trắc nghiệm: A/B/C/D. Đúng/sai: "Đ,S,Đ,S" (ý bỏ trống để trống giữa 2 dấu phẩy). Điền từ: có thể để trống.'],
      ['• Cột điểm để trống thì hệ thống tự tính (trắc nghiệm 0,25đ/câu; đúng/sai: 1 ý 0,1 – 2 ý 0,25 – 3 ý 0,5 – 4 ý 1đ; điền từ 0,5đ/câu).'],
      ['• Nhận xét: dùng 2 cột "Ưu điểm", "Nhược điểm", hoặc 1 cột "Ưu, nhược" dạng "+ Ưu điểm: …  + Nhược điểm: …".'],
      ['• Có thể dùng luôn bảng tổng hợp điểm đang dùng để trộn thư Word: các cột đáp án đúng ở cuối mỗi dòng sẽ được bỏ qua.']
    ]
  };
}

/** Mẫu bảng đáp án theo mã đề. */
export function taoMauDapAn() {
  var de = MAU_FILE_KET_QUA.DeThi.slice(1); // Phần | Câu | Chủ đề | Mức độ | Nội dung | Đáp án (mã 105)
  var cauHoi = [['Câu', 'Phần', 'Chủ đề kiến thức', 'Mức độ', 'Nội dung phân tích cụ thể']];
  var dapAn105 = [], dapAn106 = [];
  var doi = { A: 'B', B: 'C', C: 'D', D: 'A' };
  de.forEach(function (r, i) {
    cauHoi.push([String(i + 1), r[0], r[2], r[3], r[4]]);
    dapAn105.push(r[5]);
    dapAn106.push(r[0] === 'I' ? doi[r[5]] : r[0] === 'II' ? r[5].split('').reverse().join('') : r[5]);
  });
  var tieuDe = ['Mã đề'].concat(de.map(function (r, i) { return 'Câu ' + (i + 1); }));
  return {
    DapAn: [tieuDe, ['105'].concat(dapAn105), ['106'].concat(dapAn106)],
    CauHoi: cauHoi,
    ThongTin: [
      ['Mục', 'Giá trị', 'Ghi chú'],
      ['Tiêu đề phiếu', 'PHÂN TÍCH BÀI THI - THÁNG 9 NĂM 2026', 'Dòng tiêu đề lớn trên phiếu (để trống: dùng tên bài thi)'],
      ['Mô tả', 'Bài thi cuối khóa 1 – Lớp 11', 'Dòng ngay dưới tiêu đề'],
      ['Ngày thi', '28/09/2026', 'dd/mm/yyyy'],
      ['Nhãn lớp', 'Lớp toán', 'Chữ hiển thị trước tên lớp trên phiếu'],
      ['Tên phần III', 'Tự luận', 'vd: Trả lời ngắn / Điền từ'],
      ['Mô tả phần I', 'Phần này gồm 12 câu hỏi trắc nghiệm khách quan, các câu hỏi ở mức độ 1.', ''],
      ['Mô tả phần II', 'Phần này gồm 4 câu hỏi. Mỗi câu hỏi gồm 4 ý (a, b, c, d), yêu cầu học sinh phải nắm vững bản chất vấn đề và xét tính đúng/sai của từng mệnh đề độc lập.', ''],
      ['Mô tả phần III', 'Phần này gồm 6 câu hỏi, đòi hỏi tư duy cao hơn. Học sinh phải tự giải quyết bài toán và điền đáp án cuối cùng.', '']
    ],
    HuongDan: [
      ['HƯỚNG DẪN — BẢNG ĐÁP ÁN THEO MÃ ĐỀ'],
      ['• Tab DapAn: mỗi mã đề 1 dòng. Cột "Câu 1" … "Câu N" là đáp án đúng. Đúng/sai viết "ĐSĐS" hoặc "Đ,S,Đ,S".'],
      ['• Tab CauHoi (tùy chọn): chủ đề, mức độ, nội dung từng câu — hiện trên phiếu. "Phần" (I/II/III) để trống thì hệ thống tự nhận theo đáp án.'],
      ['• Nếu các mã đề đảo thứ tự câu hỏi: thêm cột "Mã đề" vào tab CauHoi và ghi chủ đề riêng cho từng mã đề.'],
      ['• Tab ThongTin (tùy chọn): tiêu đề phiếu, mô tả, ngày thi, tên/mô tả từng phần.']
    ]
  };
}
