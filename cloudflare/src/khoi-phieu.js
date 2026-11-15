/**
 * KHỐI CÓ SẴN trong mẫu phiếu: phần lớn của phiếu do hệ thống tự dựng từ dữ liệu chấm của từng học sinh.
 * Trong mẫu: <div class="khoi" data-khoi="phan-tich" data-phan="I"></div>  (data-phan trống = mọi phần)
 * dungKhoi(html, d) thay mọi khối bằng HTML dựng từ phiếu d (cham, tenPhan, moTaPhan, lichSu, nhanXet…).
 * Chủ đề / nội dung từng câu đã lấy theo đúng mã đề khi chấm -> khối luôn khớp mã đề của học sinh.
 */

export const CAC_KHOI = [
  { ma: 'phan-tich', ten: 'Bảng phân tích từng câu', moTa: 'Câu – Chủ đề – Nội dung – Đáp án của bạn – Đáp án đúng, theo từng phần; số câu, chủ đề theo đề và mã đề' },
  { ma: 'bang-diem', ten: 'Điểm các phần', moTa: 'Phần 1: …/…; Phần 2: …/…; … Tổng điểm: …/…' },
  { ma: 'cac-lan', ten: 'Kết quả các lần làm', moTa: 'Điểm các lần làm trước + so với lần trước (chỉ hiện từ lần 2)' },
  { ma: 'xep-hang', ten: 'Xếp hạng', moTa: 'Hạng trong lớp, VD 3 / 33 (khi file có cột Thứ hạng)' },
  { ma: 'nhan-xet', ten: 'Nhận xét', moTa: 'Ưu điểm, Nhược điểm, Hướng khắc phục, Lời khuyên (mục trống tự ẩn)' }
];

function e(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
var DO = 'color:#d40000;font-weight:bold', XANH = 'color:#00a040;font-weight:bold';
var BANG = 'border-collapse:collapse;width:100%;margin:3pt 0 8pt';
var O = 'border:1px solid #000;padding:2pt 4pt;vertical-align:middle';
var OG = O + ';text-align:center';
var TH = O + ';text-align:center;font-weight:bold';

/** Các phần của phiếu: theo cấu trúc đề (v2: cham.phan) hoặc 3 phần cố định (v1). */
function cacPhan(c) {
  if (Array.isArray(c.phan) && c.phan.length) return c.phan.map(function (p, i) { return { ma: p.ma, ten: p.ten, dang: p.dang, cau: p.cau, diem: p.diem, toiDa: p.toiDa, so: i + 1 }; });
  var dm = c.diem || {}, ds = [];
  [['I', 'trac_nghiem', c.phan1, dm.p1, dm.max1], ['II', 'dung_sai', c.phan2, dm.p2, dm.max2], ['III', 'tra_loi_ngan', c.phan3, dm.p3, dm.max3]].forEach(function (x) {
    if ((x[2] || []).length) ds.push({ ma: x[0], dang: x[1], cau: x[2], diem: x[3], toiDa: x[4], so: ds.length + 1 });
  });
  return ds;
}

function bangPhan(d, p) {
  var tenPhan = (d.tenPhan && d.tenPhan[p.ma]) || p.ten || '', moTa = d.moTaPhan && d.moTaPhan[p.ma];
  var coHs = p.dang !== 'tra_loi_ngan' || p.cau.some(function (q) { return q.hs; });
  var h = '<p style="margin:6pt 0 2pt"><b>' + p.so + '. PHẦN ' + e(p.ma) + ': ' + e(tenPhan) + '</b></p>' + (moTa ? '<p style="margin:0 0 2pt">' + e(moTa) + '</p>' : '');
  h += '<table style="' + BANG + '"><tr><th style="' + TH + ';width:6%">Câu</th><th style="' + TH + ';width:22%">Chủ đề kiến thức</th><th style="' + TH + '">Nội dung phân tích cụ thể</th>' +
    (coHs ? '<th style="' + TH + ';width:11%;color:#d40000">Đáp án<br>của bạn</th>' : '') + '<th style="' + TH + ';width:11%;color:#00a040">' + (p.dang === 'tra_loi_ngan' ? 'Đáp số' : 'Đáp án<br>đúng') + '</th></tr>';
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
  'phan-tich': function (d, phan) {
    return cacPhan(d.cham || {}).filter(function (p) { return !phan || p.ma === phan; }).map(function (p) { return bangPhan(d, p); }).join('');
  },
  'bang-diem': function (d) {
    var c = d.cham || {}, dm = c.diem || {};
    return '<p style="margin:2pt 0">' + cacPhan(c).map(function (p) { return 'Phần ' + p.so + ': <span style="' + DO + '">' + e(p.diem) + '</span>/' + e(p.toiDa) + '; '; }).join('') +
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
  'xep-hang': function (d) {
    return d.thuHang ? '<span style="' + DO + '">' + e(d.thuHang) + '</span>' + (d.soXepHang ? ' / ' + e(d.soXepHang) : '') : '';
  },
  'nhan-xet': function (d) {
    var nx = d.nhanXet || {}, h = '', NX = 'color:#d40000;font-weight:bold;font-style:italic';
    if (nx.uu || nx.nhuoc) {
      h += '<p style="margin:4pt 0 2pt;' + NX + '">- Ưu và nhược điểm qua bài thi:</p>';
      if (nx.uu) h += '<p style="margin:0 0 2pt 18pt"><i>+ Ưu điểm: ' + e(nx.uu) + '</i></p>';
      if (nx.nhuoc) h += '<p style="margin:0 0 2pt 18pt"><i>+ Nhược điểm: ' + e(nx.nhuoc) + '</i></p>';
    }
    if (nx.khacPhuc) h += '<p style="margin:2pt 0"><span style="' + NX + '">- Hướng khắc phục:</span> <i>' + e(nx.khacPhuc) + '</i></p>';
    h += '<p style="margin:2pt 0"><b>Lời khuyên:</b> ' + (nx.loiKhuyen ? e(nx.loiKhuyen)
      : 'Dựa vào phân tích trên, trong thời gian tới, em hãy cố gắng khắc phục những hạn chế và phát huy những ưu điểm. Chúc <span style="' + DO + '">' + e(d.hoTen) + '</span> đạt được kết quả cao trong kỳ thi tiếp theo!') + '</p>';
    return h;
  }
};

/** Thay các khối trong mẫu bằng nội dung dựng từ phiếu d. */
export function dungKhoi(html, d) {
  return String(html).replace(/<(div|span) class="khoi" data-khoi="([a-z-]+)"(?: data-phan="([^"]*)")?[^>]*>[\s\S]*?<\/\1>/g, function (m, the, ma, phan) {
    var f = DUNG[ma];
    return f ? '<' + the + ' class="khoi-da-dung">' + f(d, phan || '') + '</' + the + '>' : '';
  });
}

/** HTML giữ chỗ của 1 khối trong mẫu (trình chỉnh hiển thị nhãn). */
export function giuChoKhoi(ma, phan) {
  var k = CAC_KHOI.find(function (x) { return x.ma === ma; });
  var the = ma === 'xep-hang' ? 'span' : 'div'; // xếp hạng nằm trong dòng chữ ("Xếp hạng: 3 / 33")
  return '<' + the + ' class="khoi" data-khoi="' + ma + '"' + (phan ? ' data-phan="' + e(phan) + '"' : '') + '>' + e(k ? k.ten + (phan ? ' · Phần ' + phan : '') : ma) + '</' + the + '>';
}
