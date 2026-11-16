/**
 * KHỐI CÓ SẴN trong mẫu phiếu: phần lớn của phiếu do hệ thống tự dựng từ dữ liệu chấm của từng học sinh.
 * Trong mẫu: <div class="khoi" data-khoi="phan-tich" data-phan="I"></div>  (data-phan trống = mọi phần)
 * dungKhoi(html, d) thay mọi khối bằng HTML dựng từ phiếu d (cham, tenPhan, moTaPhan, lichSu, nhanXet…).
 * Chủ đề / nội dung từng câu đã lấy theo đúng mã đề khi chấm -> khối luôn khớp mã đề của học sinh.
 */

export const CAC_KHOI = [
  { ma: 'phan-tich', ten: 'Bảng phân tích từng câu', moTa: 'Câu – Chủ đề – Nội dung – Đáp án của bạn – Đáp án đúng, theo từng phần; số câu, chủ đề theo đề và mã đề' },
  { ma: 'bang-diem', ten: 'Điểm các phần', moTa: 'Điểm theo từng dạng bài, VD Trắc nghiệm: …/…; Đúng sai: …/…; Tự luận: …/…; Tổng điểm: …/…' },
  { ma: 'cac-lan', ten: 'Kết quả các lần làm', moTa: 'Điểm các lần làm trước + so với lần trước (chỉ hiện từ lần 2)' },
  { ma: 'xep-hang', ten: 'Xếp hạng', moTa: 'Hạng trong lớp, VD 3 / 33 (khi file có cột Thứ hạng)' },
  { ma: 'nhan-xet', ten: 'Nhận xét', moTa: 'Ưu điểm, Nhược điểm, Hướng khắc phục, Lời khuyên (mục trống tự ẩn)' },
  { ma: 'theo-chu-de', ten: 'Kết quả theo chủ đề', moTa: 'Mỗi chủ đề kiến thức: số câu đúng / tổng và các câu chưa đúng (chủ đề yếu lên đầu; không tính câu tự luận)' }
];

/** Đọc điểm thành chữ: 7.25 -> "Bảy phẩy hai lăm" (trường «Điểm_bằng_chữ»). */
export function diemBangChu(x) {
  var n = parseFloat(x); if (isNaN(n)) return '';
  var SO = ['không', 'một', 'hai', 'ba', 'bốn', 'năm', 'sáu', 'bảy', 'tám', 'chín'];
  var doc2 = function (k) {
    if (k < 10) return SO[k];
    var c = Math.floor(k / 10), dv = k % 10, t = (c === 1 ? 'mười' : SO[c] + ' mươi');
    if (!dv) return t;
    return t + ' ' + (dv === 5 ? 'lăm' : dv === 1 && c > 1 ? 'mốt' : dv === 4 && c > 1 ? 'tư' : SO[dv]);
  };
  var nguyen = Math.floor(n + 1e-9), le = Math.round((n - nguyen) * 100), s = doc2(nguyen);
  if (le) s += ' phẩy ' + (le % 10 ? (le < 10 ? 'không ' + SO[le] : doc2(le)) : SO[le / 10]);
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function e(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
var DO = 'color:#d40000;font-weight:bold', XANH = 'color:#00a040;font-weight:bold';
var BANG = 'border-collapse:collapse;width:100%;margin:3pt 0 8pt';
var O = 'border:1px solid #000;padding:2pt 4pt;vertical-align:middle';
var OG = O + ';text-align:center';
var TH = O + ';text-align:center;font-weight:bold';

/** Các phần của phiếu: theo cấu trúc đề (v2: cham.phan) hoặc 3 phần cố định (v1). Dùng chung cho mẫu mặc định (phieu.js) và các khối. */
export function cacPhan(c) {
  // phiếu chấm theo cấu trúc có sẵn trước 15/11/2026: phần III ghi "tra_loi_ngan" -> nay là Tự luận
  var cuCoSan = /^thpt2025-/.test((c.cauTruc && c.cauTruc.id) || '');
  if (Array.isArray(c.phan) && c.phan.length) return c.phan.map(function (p, i) { return { ma: p.ma, ten: p.ten, dang: cuCoSan && p.dang === 'tra_loi_ngan' ? 'tu_luan' : p.dang, cau: p.cau, diem: p.diem, toiDa: p.toiDa, so: i + 1 }; });
  var dm = c.diem || {}, ds = [];
  [['I', 'trac_nghiem', c.phan1, dm.p1, dm.max1], ['II', 'dung_sai', c.phan2, dm.p2, dm.max2], ['III', 'tu_luan', c.phan3, dm.p3, dm.max3]].forEach(function (x) {
    if ((x[2] || []).length) ds.push({ ma: x[0], dang: x[1], cau: x[2], diem: x[3], toiDa: x[4], so: ds.length + 1 });
  });
  return ds;
}

/** Tiêu đề 1 phần trên phiếu: tên phần trong file đáp án (tab Thông tin) nếu có, không thì tên phần trong cấu trúc đề. */
export function tieuDePhan(d, p) { return (d.tenPhan && d.tenPhan[p.ma]) || p.ten || TEN_NGAN_DANG[p.dang] || ''; }

/** Dòng điểm tự động theo cấu trúc đề: mỗi phần 1 dòng; nhãn = tên dạng bài, 2 phần cùng dạng thì ghi "Phần I", "Phần II". */
export function dongDiemTuDong(c) {
  var ds = cacPhan(c).filter(function (p) { return (p.cau || []).length; }), dem = {};
  ds.forEach(function (p) { dem[p.dang] = (dem[p.dang] || 0) + 1; });
  return ds.map(function (p) { return { ma: p.ma, dang: p.dang, nhan: dem[p.dang] > 1 || !TEN_NGAN_DANG[p.dang] ? 'Phần ' + p.ma : TEN_NGAN_DANG[p.dang], diem: p.diem, toiDa: p.toiDa }; });
}

function bangPhan(d, p, tenRieng) {
  var tenPhan = tenRieng || tieuDePhan(d, p), moTa = d.moTaPhan && d.moTaPhan[p.ma];
  var coHs = p.dang !== 'tu_luan' && (p.dang !== 'tra_loi_ngan' || p.cau.some(function (q) { return q.hs; }));
  // tenRieng: tiêu đề giáo viên tự đặt cho khối (thay cả dòng "1. PHẦN I: …")
  var h = '<p style="margin:6pt 0 2pt"><b>' + (tenRieng ? e(tenRieng) : p.so + '. PHẦN ' + e(p.ma) + ': ' + e(tenPhan)) + '</b></p>' + (moTa ? '<p style="margin:0 0 2pt">' + e(moTa) + '</p>' : '');
  h += '<table style="' + BANG + '"><tr><th style="' + TH + ';width:6%">Câu</th><th style="' + TH + ';width:22%">Chủ đề kiến thức</th><th style="' + TH + '">Nội dung phân tích cụ thể</th>' +
    (coHs ? '<th style="' + TH + ';width:11%;color:#d40000">Đáp án<br>của bạn</th>' : '') + '<th style="' + TH + ';width:11%;color:#00a040">' + (p.dang === 'tra_loi_ngan' || p.dang === 'tu_luan' ? 'Đáp số' : 'Đáp án<br>đúng') + '</th></tr>';
  p.cau.forEach(function (q) {
    var hs;
    if (p.dang === 'dung_sai') hs = (q.kyTu || []).length ? q.kyTu.map(function (k, i) { return (i ? ',' : '') + '<span style="' + (k.ok ? XANH : DO) + '">' + e(k.c) + '</span>'; }).join('') : '<span style="' + DO + '">—</span>';
    else hs = '<span style="' + (q.ok ? XANH : DO) + '">' + e(q.hs || '—') + '</span>';
    h += '<tr><td style="' + OG + '">' + e(q.cau) + '</td><td style="' + O + '">' + e(q.chuDe) + (q.mucDo ? '<br>(' + e(q.mucDo) + ')' : '') + '</td>' +
      '<td style="' + O + ';font-size:0.9em;white-space:pre-line">' + e(q.noiDung) + '</td>' + (coHs ? '<td style="' + OG + '">' + hs + '</td>' : '') +
      '<td style="' + OG + ';' + XANH + '">' + e(q.dung) + '</td></tr>';
  });
  h += '<tr><td colspan="3" style="' + OG + '"><b>Tổng điểm</b></td><td style="' + OG + ';' + DO + '">' + e(p.diem) + '/' + e(p.toiDa) + '</td>' + (coHs ? '<td style="' + O + '"></td>' : '') + '</tr></table>';
  return h;
}

var DUNG = {
  // data-dang: các phần có dạng bài đó (VD trac_nghiem); data-phan: theo mã phần (mẫu cũ); không có = mọi phần
  'phan-tich': function (d, phan, tt) {
    tt = tt || {};
    var dang = tt.dang || '', ten = (dang || phan) && tt.ten;
    return cacPhan(d.cham || {}).filter(function (p) { return dang ? p.dang === dang : !phan || p.ma === phan; }).map(function (p) { return bangPhan(d, p, ten); }).join('');
  },
  // Điểm theo DẠNG BÀI (không theo số thứ tự phần): data-thutu = thứ tự dạng ("dung_sai,trac_nghiem"),
  // data-nhan = nhãn tự đặt ("trac_nghiem=Phần I – Trắc nghiệm|dung_sai=…"); dạng có trong đề mà chưa xếp thì nối vào cuối
  // Không có data-muc / data-thutu / data-nhan: tự động theo cấu trúc đề (mỗi phần 1 dòng)
  'bang-diem': function (d, phan, tt) {
    var c = d.cham || {}, dm = c.diem || {}, tuDong = !tt.muc && !tt.thutu && !tt.nhan;
    return '<p style="margin:2pt 0">' + (tuDong ? dongDiemTuDong(c) : diemTheoDang(c, tt)).map(function (x) { return e(x.nhan) + ': <span style="' + DO + '">' + e(x.diem) + '</span>/' + e(x.toiDa) + '; '; }).join('') +
      '<b>Tổng điểm: <span style="' + DO + '">' + e(dm.tong) + '</span>/' + e(dm.maxTong) + '</b></p>';
  },
  'cac-lan': function (d) {
    var ls = d.lichSu || [];
    if (!ls.length) return '';
    var nho = '<br><span style="font-weight:normal;font-size:0.85em">';
    return '<table style="' + BANG + ';width:auto"><tr><th style="' + TH + '">Kết quả các lần làm</th>' +
      ls.map(function (x) { return '<th style="' + TH + '">Lần ' + e(x.lan) + (x.ngayThi ? nho + e(x.ngayThi) + '</span>' : '') + '</th>'; }).join('') +
      '<th style="' + TH + '">Lần ' + e(d.lan) + ' (lần này)' + (d.ngayThi ? nho + e(d.ngayThi) + '</span>' : '') + '</th><th style="' + TH + '">So với lần trước</th></tr>' +
      '<tr><td style="' + OG + '"><b>Tổng điểm</b></td>' + ls.map(function (x) { return '<td style="' + OG + '">' + e(x.tong) + '</td>'; }).join('') +
      '<td style="' + OG + ';' + DO + '">' + e((d.cham || {}).diem && d.cham.diem.tong) + '</td><td style="' + OG + ';' + (d.tangDiem ? XANH : d.giamDiem ? DO : '') + '">' +
      e(d.chenhLech) + (d.tangDiem ? ' ▲' : d.giamDiem ? ' ▼' : '') + '</td></tr></table>';
  },
  'theo-chu-de': function (d) {
    var cd = {}, thuTu = [];
    cacPhan(d.cham || {}).forEach(function (p) {
      if (p.dang === 'tu_luan') return;
      (p.cau || []).forEach(function (q) {
        var k = q.chuDe || '(Chưa ghi chủ đề)'; if (!cd[k]) { cd[k] = { dung: 0, tong: 0, sai: [] }; thuTu.push(k); }
        var ok = p.dang === 'dung_sai' ? (q.kyTu || []).length && q.kyTu.every(function (x) { return x.ok; }) : q.ok;
        cd[k].tong++; if (ok) cd[k].dung++; else cd[k].sai.push(p.ma + '.' + q.cau);
      });
    });
    if (!thuTu.length) return '';
    thuTu.sort(function (a, b) { return cd[a].dung / cd[a].tong - cd[b].dung / cd[b].tong; });
    return '<p style="margin:6pt 0 2pt"><b>Kết quả theo chủ đề</b></p><table style="' + BANG + '"><tr><th style="' + TH + ';text-align:left">Chủ đề kiến thức</th><th style="' + TH + ';width:16%">Đúng / Tổng</th><th style="' + TH + ';width:34%">Câu chưa đúng</th></tr>' +
      thuTu.map(function (k) {
        var x = cd[k], tot = x.dung === x.tong;
        return '<tr><td style="' + O + '">' + e(k) + '</td><td style="' + OG + ';' + (tot ? XANH : x.dung * 2 < x.tong ? DO : 'font-weight:bold') + '">' + x.dung + ' / ' + x.tong + '</td><td style="' + O + '">' + (x.sai.length ? e(x.sai.join(', ')) : '<span style="' + XANH + '">Đúng hết</span>') + '</td></tr>';
      }).join('') + '</table>';
  },
  'xep-hang': function (d) {
    return d.thuHang ? '<span style="' + DO + '">' + e(d.thuHang) + '</span>' + (d.soXepHang ? ' / ' + e(d.soXepHang) : '') : '';
  },
  'nhan-xet': function (d) {
    var nx = d.nhanXet || {}, h = '', NX = 'color:#d40000;font-weight:bold;font-style:italic';
    if (nx.uu || nx.nhuoc) {
      h += '<p style="margin:4pt 0 2pt;' + NX + '">- Ưu và nhược điểm qua bài thi:</p>';
      if (nx.uu) h += '<p style="margin:0 0 2pt 18pt"><i>+ Ưu điểm: ' + e(nx.uu) + '</i></p>';
      if (nx.nhuoc) h += '<p style="margin:0 0 2pt 18pt"><i>+ ' + e(nx.nhanNhuoc || 'Nhược điểm') + ': ' + e(nx.nhuoc) + '</i></p>';
    }
    if (nx.khacPhuc) h += '<p style="margin:2pt 0"><span style="' + NX + '">- Hướng khắc phục:</span> <i>' + e(nx.khacPhuc) + '</i></p>';
    h += '<p style="margin:2pt 0"><b>Lời khuyên:</b> ' + (nx.loiKhuyen ? e(nx.loiKhuyen)
      : 'Dựa vào phân tích trên, trong thời gian tới, em hãy cố gắng khắc phục những hạn chế và phát huy những ưu điểm. Chúc <span style="' + DO + '">' + e(d.hoTen) + '</span> đạt được kết quả cao trong kỳ thi tiếp theo!') + '</p>';
    return h;
  }
};

/** Tên ngắn của dạng bài (nhãn mặc định trong khối "Điểm các phần"). */
export var TEN_NGAN_DANG = { trac_nghiem: 'Trắc nghiệm', dung_sai: 'Đúng sai', tra_loi_ngan: 'Trả lời ngắn', tu_luan: 'Tự luận', dien_tu: 'Điền từ', sap_xep: 'Sắp xếp' };
/** "a=X|b=Y" <-> { a: 'X', b: 'Y' } (nhãn khối Điểm các phần). */
export function docNhan(s) {
  var o = {};
  String(s || '').split('|').forEach(function (x) { var i = x.indexOf('='); if (i > 0) o[x.slice(0, i)] = x.slice(i + 1); });
  return o;
}
export function ghiNhan(o) {
  return Object.keys(o || {}).filter(function (k) { return o[k]; }).map(function (k) { return k + '=' + String(o[k]).replace(/[|=]/g, ' ').trim(); }).join('|');
}
/** data-muc "trac_nghiem:Trắc nghiệm|dung_sai:Đúng sai" <-> [{ dang, nhan }] (các dòng của khối Điểm các phần). */
export function docMuc(s) {
  return String(s || '').split('|').map(function (x) { var i = x.indexOf(':'); return i > 0 ? { dang: x.slice(0, i), nhan: x.slice(i + 1) } : null; }).filter(Boolean);
}
export function ghiMuc(ds) {
  return (ds || []).filter(function (x) { return x && x.dang; }).map(function (x) { return x.dang + ':' + String(x.nhan || '').replace(/\|/g, ' ').trim(); }).join('|');
}
/** Điểm gộp theo dạng bài, theo các dòng của khối (data-muc: nhãn + dạng bài; mẫu cũ: data-thutu / data-nhan). */
export function diemTheoDang(c, tt) {
  tt = tt || {};
  if (tt.muc) {
    var tong = {};
    cacPhan(c).forEach(function (p) {
      var k = p.dang || p.ma; if (!tong[k]) tong[k] = { diem: 0, toiDa: 0 };
      tong[k].diem += parseFloat(p.diem) || 0; tong[k].toiDa += parseFloat(p.toiDa) || 0;
    });
    // dòng chọn dạng bài mà đề không có -> không hiện; dạng không có dòng nào -> không hiện riêng (vẫn tính vào Tổng điểm)
    return docMuc(tt.muc).filter(function (m) { return tong[m.dang]; }).map(function (m) {
      return { dang: m.dang, nhan: m.nhan || TEN_NGAN_DANG[m.dang] || m.dang, diem: tong[m.dang].diem.toFixed(2), toiDa: String(Math.round(tong[m.dang].toiDa * 100) / 100) };
    });
  }
  var nhan = docNhan(tt.nhan), thuTu = String(tt.thutu || '').split(',').filter(Boolean), nhom = {}, ds = [];
  cacPhan(c).forEach(function (p) {
    var k = p.dang || p.ma;
    if (!nhom[k]) { nhom[k] = { dang: k, diem: 0, toiDa: 0 }; ds.push(k); }
    nhom[k].diem += parseFloat(p.diem) || 0; nhom[k].toiDa += parseFloat(p.toiDa) || 0;
  });
  var xep = thuTu.filter(function (k) { return nhom[k]; }).concat(ds.filter(function (k) { return thuTu.indexOf(k) < 0; }));
  return xep.map(function (k) {
    var x = nhom[k];
    return { dang: k, nhan: nhan[k] || TEN_NGAN_DANG[k] || ('Phần ' + k), diem: x.diem.toFixed(2), toiDa: String(Math.round(x.toiDa * 100) / 100) };
  });
}

/** Mẫu hiện được những dạng bài nào: { tatCa: có khối "Tất cả các phần", dang: [dạng của các khối Bảng phân tích] } (để cảnh báo mẫu thiếu phần). */
export function dangTrongMau(html) {
  var kq = { tatCa: false, dang: [] }, MA = { I: 'trac_nghiem', II: 'dung_sai', III: 'tu_luan' };
  String(html || '').replace(/<(div|span) (class="khoi"[^>]*)>/g, function (m, the, tt) {
    var o = docThuocTinh(tt);
    if (o.khoi !== 'phan-tich') return m;
    var dg = o.dang || MA[o.phan || ''] || '';
    if (!dg && !o.phan) kq.tatCa = true; else if (dg && kq.dang.indexOf(dg) < 0) kq.dang.push(dg);
    return m;
  });
  return kq;
}

/** data-khoi / data-phan / data-ten của thẻ khối (đã bỏ mã hóa &amp; …). */
function docThuocTinh(s) {
  var o = {}, re = /data-([a-z]+)="([^"]*)"/g, m;
  while ((m = re.exec(s))) o[m[1]] = m[2].replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
  return o;
}

/** Thay các khối trong mẫu bằng nội dung dựng từ phiếu d. */
export function dungKhoi(html, d) {
  return String(html).replace(/<(div|span) (class="khoi"[^>]*)>[\s\S]*?<\/\1>/g, function (m, the, thuocTinh) {
    var tt = docThuocTinh(thuocTinh), f = DUNG[tt.khoi];
    return f ? '<' + the + ' class="khoi-da-dung">' + f(d, tt.phan || '', tt) + '</' + the + '>' : '';
  });
}

/** HTML giữ chỗ của 1 khối trong mẫu (trình chỉnh hiển thị nhãn). */
export function giuChoKhoi(ma, phan) {
  var k = CAC_KHOI.find(function (x) { return x.ma === ma; });
  var the = ma === 'xep-hang' ? 'span' : 'div'; // xếp hạng nằm trong dòng chữ ("Xếp hạng: 3 / 33")
  return '<' + the + ' class="khoi" data-khoi="' + ma + '"' + (phan ? ' data-phan="' + e(phan) + '"' : '') + '>' + e(k ? k.ten + (phan ? ' · Phần ' + phan : '') : ma) + '</' + the + '>';
}

/** Dựng 1 khối (trình chỉnh mẫu hiển thị bản minh họa bên trong khối). */
export function dungMotKhoi(ma, phan, d, tt) { var f = DUNG[ma]; return f ? f(d, phan || '', tt || {}) : ''; }

/** Dữ liệu minh họa (1 học sinh, đề rút gọn) để trình chỉnh mẫu cho thấy mỗi phần tự động trông thế nào. */
export function phieuMinhHoa() {
  var cau = function (n, chuDe, noiDung, hs, dung) { return { cau: n, chuDe: chuDe, mucDo: '', noiDung: noiDung, hs: hs, dung: dung, ok: hs === dung }; };
  var ds = function (n, chuDe, noiDung, hs, dung) {
    var kyTu = hs.split(',').map(function (c, i) { return { c: c, ok: c.replace('Đ', 'D') === dung[i] }; });
    return { cau: n, chuDe: chuDe, mucDo: '', noiDung: noiDung, hs: hs, dung: dung, kyTu: kyTu, soDung: kyTu.filter(function (k) { return k.ok; }).length };
  };
  return {
    hoTen: 'Nguyễn Văn An', thuHang: '3', soXepHang: 33, lan: 2, ngayThi: '28/09/2026',
    tenPhan: { I: 'Câu trắc nghiệm nhiều phương án lựa chọn.', II: 'Câu trắc nghiệm đúng sai.', III: 'Tự luận' },
    moTaPhan: { I: '(Minh họa: rút gọn còn vài câu — khi tạo phiếu sẽ đủ số câu và đúng chủ đề theo mã đề của từng học sinh.)' },
    lichSu: [{ lan: 1, ngayThi: '28/08/2026', tong: '7.25' }], chenhLech: '+1.25', tangDiem: true,
    nhanXet: { uu: 'Nắm vững kiến thức cơ bản, trình bày cẩn thận.', nhuoc: 'Còn nhầm lẫn ở câu vận dụng.', khacPhuc: 'Luyện thêm các dạng bài vận dụng.' },
    cham: {
      phan: [
        { ma: 'I', dang: 'trac_nghiem', diem: '2.50', toiDa: '3', cau: [cau(1, 'Lượng giác', 'Giá trị lượng giác của góc', 'A', 'A'), cau(2, 'Hàm số lượng giác', 'Tập xác định, tập giá trị', 'C', 'B'), cau(3, 'Dãy số / Cấp số', 'Cấp số cộng', 'D', 'D')] },
        { ma: 'II', dang: 'dung_sai', diem: '3.50', toiDa: '4', cau: [ds(1, 'Hàm số lượng giác', 'a) Tập xác định…\nb) GTLN / GTNN…', 'Đ,S,Đ,S', 'DSDS'), ds(2, 'Phương trình lượng giác', 'a) Kiểm tra nghiệm…\nb) Số nghiệm…', 'Đ,Đ,S,S', 'DDSD')] },
        { ma: 'III', dang: 'tu_luan', diem: '2.50', toiDa: '3', cau: [cau(1, 'Lượng giác', 'Tính giá trị biểu thức', '-4/5', '-4/5'), cau(2, 'Tổ hợp', 'Bài toán đếm nâng cao', '70', '72')] }
      ],
      diem: { tong: '8.50', maxTong: '10' }
    }
  };
}
