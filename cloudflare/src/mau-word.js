/**
 * MẪU PHIẾU TỪ WORD (.docx trộn thư hoặc Word thường)
 *
 * docMauWord(tep) đọc các tệp bên trong gói .docx (đã giải nén: { 'word/document.xml': Uint8Array|string, ... })
 * và dựng thành mẫu phiếu HTML giữ bố cục: đoạn văn, kiểu chữ, căn lề, bảng (gộp ô, viền, nền), ảnh, khổ giấy.
 * Trường trộn thư «Tên» (MERGEFIELD) và ký hiệu {{Tên}} gõ trong Word thành chỗ chờ điền:
 *   <span class="truong" data-truong="Tên" style="…">«Tên»</span>
 * dienMau(html, giaTri) điền dữ liệu 1 học sinh vào mẫu.
 * Logic thuần (không DOM): chạy được ở trình duyệt, Worker và Node.
 */

/* ===================== XML tối giản ===================== */

var THUC_THE = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
function giaiThucThe(s) {
  return s.indexOf('&') < 0 ? s : s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, function (m, k) {
    if (k[0] === '#') return String.fromCodePoint(k[1] === 'x' || k[1] === 'X' ? parseInt(k.slice(2), 16) : parseInt(k.slice(1), 10));
    return THUC_THE[k] != null ? THUC_THE[k] : m;
  });
}
/** Phân tích XML -> cây { n: tên, a: {thuộc tính}, c: [con] } ; nút chữ là chuỗi. */
export function docXml(s) {
  var goc = { n: '#goc', a: {}, c: [] }, chong = [goc], i = 0, L = s.length;
  while (i < L) {
    var lt = s.indexOf('<', i);
    if (lt < 0) lt = L;
    if (lt > i) { var chu = s.slice(i, lt); if (chong.length > 1) chong[chong.length - 1].c.push(giaiThucThe(chu)); }
    if (lt >= L) break;
    if (s.startsWith('<?', lt)) { i = s.indexOf('?>', lt) + 2; continue; }
    if (s.startsWith('<!--', lt)) { i = s.indexOf('-->', lt) + 3; continue; }
    if (s.startsWith('<![CDATA[', lt)) { var e = s.indexOf(']]>', lt); chong[chong.length - 1].c.push(s.slice(lt + 9, e)); i = e + 3; continue; }
    if (s.startsWith('<!', lt)) { i = s.indexOf('>', lt) + 1; continue; }
    var gt = s.indexOf('>', lt);
    // '>' trong giá trị thuộc tính: bỏ qua phần trong ngoặc kép
    var q = s.slice(lt, gt + 1);
    while ((q.split('"').length - 1) % 2) { gt = s.indexOf('>', gt + 1); q = s.slice(lt, gt + 1); }
    if (q[1] === '/') { chong.pop(); i = gt + 1; continue; }
    var tuDong = q[q.length - 2] === '/';
    var m = /^<([^\s/>]+)/.exec(q), nut = { n: m[1], a: {}, c: [] };
    q.replace(/([^\s=]+)\s*=\s*"([^"]*)"/g, function (_, k, v) { nut.a[k] = giaiThucThe(v); return ''; });
    chong[chong.length - 1].c.push(nut);
    if (!tuDong) chong.push(nut);
    i = gt + 1;
  }
  return goc;
}
function con(nut, ten) { if (!nut) return null; for (var i = 0; i < nut.c.length; i++) if (nut.c[i].n === ten) return nut.c[i]; return null; }
function cacCon(nut, ten) { return nut ? nut.c.filter(function (x) { return x.n === ten; }) : []; }
function tim(nut, ten) { // tìm sâu
  if (!nut || typeof nut === 'string') return null;
  if (nut.n === ten) return nut;
  for (var i = 0; i < nut.c.length; i++) { var x = tim(nut.c[i], ten); if (x) return x; }
  return null;
}
function chuTrong(nut) { return typeof nut === 'string' ? nut : nut.c.map(chuTrong).join(''); }
function val(nut) { return nut ? nut.a['w:val'] : undefined; }
function bat(nut) { if (!nut) return undefined; var v = nut.a['w:val']; return v === undefined || !(v === '0' || v === 'false' || v === 'off' || v === 'none'); }

/* ===================== tiện ích ===================== */

function chuoiTuByte(b) { return typeof b === 'string' ? b : new TextDecoder('utf-8').decode(b); }
function base64(b) {
  var s = '';
  for (var i = 0; i < b.length; i += 0x8000) s += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000));
  return btoa(s);
}
export function anToan(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
function pt(twip) { return Math.round(twip / 20 * 100) / 100 + 'pt'; }
var MAU_TO = { yellow: '#FFFF00', green: '#00FF00', cyan: '#00FFFF', magenta: '#FF00FF', blue: '#0000FF', red: '#FF0000', darkBlue: '#000080', darkCyan: '#008080',
  darkGreen: '#008000', darkMagenta: '#800080', darkRed: '#800000', darkYellow: '#808000', darkGray: '#808080', lightGray: '#C0C0C0', black: '#000000', white: '#FFFFFF' };

/* ===================== kiểu (styles.xml) ===================== */

function gopThuocTinh(dich, nguon) { // ghép pPr/rPr: phần tử con của nguồn ghi đè cùng tên
  if (!nguon) return dich;
  var kq = { n: nguon.n, a: Object.assign({}, dich ? dich.a : {}, nguon.a), c: (dich ? dich.c : []).slice() };
  nguon.c.forEach(function (x) {
    if (typeof x === 'string') return;
    var j = kq.c.findIndex(function (y) { return y.n === x.n; });
    if (j >= 0) kq.c[j] = x.n === 'w:spacing' || x.n === 'w:ind' || x.n === 'w:rFonts' ? { n: x.n, a: Object.assign({}, kq.c[j].a, x.a), c: x.c } : x;
    else kq.c.push(x);
  });
  return kq;
}
function docKieu(stylesXml) {
  var ks = { theoId: {}, macDinhP: null, macDinhBang: null, pGoc: null, rGoc: null };
  if (!stylesXml) return ks;
  var g = con(docXml(stylesXml), 'w:styles');
  var dd = con(g, 'w:docDefaults');
  ks.rGoc = con(con(dd, 'w:rPrDefault'), 'w:rPr');
  ks.pGoc = con(con(dd, 'w:pPrDefault'), 'w:pPr');
  cacCon(g, 'w:style').forEach(function (s) {
    var id = s.a['w:styleId'];
    ks.theoId[id] = { loai: s.a['w:type'], dua: val(con(s, 'w:basedOn')), pPr: con(s, 'w:pPr'), rPr: con(s, 'w:rPr'), tblPr: con(s, 'w:tblPr'),
      tcPr: con(s, 'w:tcPr') };
    if (s.a['w:default'] === '1' && s.a['w:type'] === 'paragraph') ks.macDinhP = id;
    if (s.a['w:default'] === '1' && s.a['w:type'] === 'table') ks.macDinhBang = id;
  });
  return ks;
}
function chuoiKieu(ks, id, truong) { // pPr / rPr gộp theo chuỗi basedOn (gốc trước)
  var ds = [], dem = 0;
  while (id && ks.theoId[id] && dem++ < 20) { ds.unshift(ks.theoId[id][truong]); id = ks.theoId[id].dua; }
  return ds.reduce(gopThuocTinh, null);
}

/* ===================== CSS từ thuộc tính ===================== */

function cssChu(rPr) {
  if (!rPr) return '';
  var css = [];
  var f = con(rPr, 'w:rFonts');
  if (f) { var ten = f.a['w:ascii'] || f.a['w:hAnsi'] || f.a['w:cs']; if (ten) css.push("font-family:'" + ten.replace(/['"]/g, '') + "',serif"); }
  var sz = val(con(rPr, 'w:sz')); if (sz) css.push('font-size:' + (Number(sz) / 2) + 'pt');
  if (con(rPr, 'w:b')) css.push('font-weight:' + (bat(con(rPr, 'w:b')) ? 'bold' : 'normal'));
  if (con(rPr, 'w:i')) css.push('font-style:' + (bat(con(rPr, 'w:i')) ? 'italic' : 'normal'));
  var gach = [];
  var u = con(rPr, 'w:u'); if (u && val(u) && val(u) !== 'none') gach.push('underline');
  if (bat(con(rPr, 'w:strike')) || bat(con(rPr, 'w:dstrike'))) gach.push('line-through');
  if (gach.length) css.push('text-decoration:' + gach.join(' '));
  var mau = val(con(rPr, 'w:color')); if (mau && mau !== 'auto') css.push('color:#' + mau);
  var hl = val(con(rPr, 'w:highlight')); if (hl && MAU_TO[hl]) css.push('background:' + MAU_TO[hl]);
  var shd = con(rPr, 'w:shd'); if (shd && shd.a['w:fill'] && shd.a['w:fill'] !== 'auto') css.push('background:#' + shd.a['w:fill']);
  var va = val(con(rPr, 'w:vertAlign')); if (va === 'superscript') css.push('vertical-align:super;font-size:smaller'); if (va === 'subscript') css.push('vertical-align:sub;font-size:smaller');
  if (bat(con(rPr, 'w:caps'))) css.push('text-transform:uppercase');
  if (bat(con(rPr, 'w:smallCaps'))) css.push('font-variant:small-caps');
  if (bat(con(rPr, 'w:vanish'))) css.push('display:none');
  return css.join(';');
}
function cssVien(b) {
  if (!b) return null;
  var v = b.a['w:val'];
  if (!v || v === 'nil' || v === 'none') return 'none';
  var day = Math.max(0.5, Number(b.a['w:sz'] || 4) / 8), mau = b.a['w:color'] && b.a['w:color'] !== 'auto' ? '#' + b.a['w:color'] : '#000';
  var kieu = v === 'double' ? 'double' : v === 'dotted' ? 'dotted' : /dash/.test(v) ? 'dashed' : 'solid';
  return (kieu === 'double' ? Math.max(day, 2.25) : day) + 'pt ' + kieu + ' ' + mau;
}
function cssDoan(pPr, coChu) {
  var css = [];
  if (!pPr) return '';
  var jc = val(con(pPr, 'w:jc'));
  if (jc) css.push('text-align:' + ({ both: 'justify', distribute: 'justify', center: 'center', right: 'right', end: 'right', left: 'left', start: 'left' }[jc] || 'left'));
  var sp = con(pPr, 'w:spacing');
  if (sp) {
    if (sp.a['w:before'] != null && sp.a['w:beforeAutospacing'] !== '1') css.push('margin-top:' + pt(Number(sp.a['w:before'])));
    if (sp.a['w:after'] != null && sp.a['w:afterAutospacing'] !== '1') css.push('margin-bottom:' + pt(Number(sp.a['w:after'])));
    if (sp.a['w:line'] != null) {
      var r = sp.a['w:lineRule'] || 'auto', l = Number(sp.a['w:line']);
      // Word "single" ~ 1.15 chiều cao chữ với Times New Roman
      css.push('line-height:' + (r === 'auto' ? Math.round(l / 240 * 1.15 * 100) / 100 : pt(l)));
    }
  }
  var ind = con(pPr, 'w:ind');
  if (ind) {
    var trai = Number(ind.a['w:left'] || ind.a['w:start'] || 0), phai = Number(ind.a['w:right'] || ind.a['w:end'] || 0);
    if (trai) css.push('margin-left:' + pt(trai));
    if (phai) css.push('margin-right:' + pt(phai));
    if (ind.a['w:firstLine']) css.push('text-indent:' + pt(Number(ind.a['w:firstLine'])));
    if (ind.a['w:hanging']) css.push('text-indent:-' + pt(Number(ind.a['w:hanging'])));
  }
  var bd = con(pPr, 'w:pBdr');
  if (bd) ['top', 'bottom', 'left', 'right'].forEach(function (k) { var v = cssVien(con(bd, 'w:' + k)); if (v && v !== 'none') css.push('border-' + k + ':' + v + ';padding-' + k + ':1pt'); });
  var shd = con(pPr, 'w:shd'); if (shd && shd.a['w:fill'] && shd.a['w:fill'] !== 'auto') css.push('background:#' + shd.a['w:fill']);
  if (bat(con(pPr, 'w:pageBreakBefore'))) css.push('break-before:page');
  return css.join(';');
}

/* ===================== trường trộn thư ===================== */

/** "MERGEFIELD Họ_và_tên \* MERGEFORMAT" -> { ten, truoc, sau } (null nếu không phải MERGEFIELD) */
export function phanTichTruong(instr) {
  var m = /^\s*MERGEFIELD\s+("([^"]+)"|(\S+))(.*)$/i.exec(instr || '');
  if (!m) return null;
  var du = m[4] || '', truoc = /\\b\s+"([^"]*)"/.exec(du), sau = /\\f\s+"([^"]*)"/.exec(du);
  return { ten: (m[2] || m[3]).trim(), truoc: truoc ? truoc[1] : '', sau: sau ? sau[1] : '' };
}
/** Tên trường Word đặt cho cột Excel khi trộn thư: dấu cách -> "_", bỏ ký tự đặc biệt, bắt đầu bằng số -> "M_…", cột không tiêu đề -> "F<số cột>". */
export function tenTruongWord(tieuDe, chiSoCot) {
  var s = String(tieuDe == null ? '' : tieuDe).normalize('NFC').trim();
  if (!s) return 'F' + (chiSoCot + 1);
  s = s.replace(/\s+/g, '_').replace(/[^\p{L}\p{N}_]/gu, '');
  if (/^\d/.test(s)) s = 'M_' + s;
  return s;
}
export function khoaTruong(s) { return String(s || '').normalize('NFC').toLowerCase().replace(/[\s_]+/g, '_'); }

/* ===================== dựng HTML ===================== */

export function docMauWord(tep, tuyChon) {
  var lay = function (ten) { var k = Object.keys(tep).find(function (x) { return x.replace(/^\/+/, '').toLowerCase() === ten.toLowerCase(); }); return k ? tep[k] : null; };
  var docGoc = lay('word/document.xml');
  if (!docGoc) return { ok: false, loi: 'File không phải Word (.docx) hợp lệ — không tìm thấy nội dung tài liệu.' };
  var ks = docKieu(lay('word/styles.xml') ? chuoiTuByte(lay('word/styles.xml')) : '');
  var rels = {};
  var relXml = lay('word/_rels/document.xml.rels');
  if (relXml) cacCon(con(docXml(chuoiTuByte(relXml)), 'Relationships'), 'Relationship').forEach(function (r) { rels[r.a.Id] = r.a.Target; });
  var body = con(con(docXml(chuoiTuByte(docGoc)), 'w:document'), 'w:body');
  var truong = [], daCo = {}, canhBao = [], soAnh = 0, soIf = 0;
  // Trường đang mở — dùng chung giữa các đoạn: kết quả trộn của 1 trường có thể trải qua nhiều đoạn văn.
  // Vị trí bắt đầu trường đánh dấu bằng \u0000<số>\u0000; nội dung thật điền vào khi gặp 'end'.
  var truongMo = [], soTruong = 0, ketQuaTruong = {}, soBang = 0;
  var dsDoan = []; // các đoạn văn (mảnh chữ) — dò trường rồi mới dựng HTML
  var rongBangToiDa = 0; // twip — bảng có thể lấn ra lề phải (như trong Word)
  var themTruong = function (ten) { var k = khoaTruong(ten); if (!daCo[k]) { daCo[k] = 1; truong.push(ten); } };

  var anhUri = function (rid) {
    var dich = rels[rid]; if (!dich) return '';
    var duong = ('word/' + dich).replace(/\/[^/]+\/\.\.\//g, '/').replace(/^word\/\//, 'word/');
    var b = lay(duong); if (!b || typeof b === 'string') return '';
    var duoi = (dich.split('.').pop() || 'png').toLowerCase();
    var mime = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', bmp: 'image/bmp', svg: 'image/svg+xml', webp: 'image/webp' }[duoi];
    if (!mime) { canhBao.push('Ảnh định dạng .' + duoi + ' chưa hiển thị được trên web.'); return ''; }
    soAnh++;
    return 'data:' + mime + ';base64,' + base64(b);
  };
  var veAnh = function (drawing) {
    var khung = con(drawing, 'wp:inline') || con(drawing, 'wp:anchor');
    var blip = tim(drawing, 'a:blip'), ext = khung && con(khung, 'wp:extent');
    if (!blip) return '';
    var src = anhUri(blip.a['r:embed']); if (!src) return '';
    var r = ext ? Number(ext.a.cx) / 12700 : 0, c = ext ? Number(ext.a.cy) / 12700 : 0;
    var noi = khung && khung.n === 'wp:anchor';
    var ph = noi && tim(khung, 'wp:align'), canh = ph ? chuTrong(ph) : '';
    return '<img src="' + src + '" alt="" style="' + (r ? 'width:' + r.toFixed(1) + 'pt;height:' + c.toFixed(1) + 'pt;' : 'max-width:100%;') +
      (noi ? (canh === 'right' ? 'float:right;margin-left:6pt;' : 'float:left;margin-right:6pt;') : 'vertical-align:bottom;') + '">';
  };

  /**
   * Đoạn văn: các run + trường (MERGEFIELD trải qua nhiều run: begin / instr / separate / kết quả / end).
   * Đoạn được giữ dạng danh sách mảnh { chu, css } (chữ — bộ dò trường có thể thay) | { html } (ảnh, xuống dòng, trường trộn thư)
   * rồi mới dựng HTML ở cuối (sau khi dò trường). Trả về dấu \u0001<số>\u0001 thay cho đoạn.
   */
  var veDoan = function (p, ngucanh) {
    var pPrRieng = con(p, 'w:pPr');
    var idKieu = val(con(pPrRieng, 'w:pStyle')) || ks.macDinhP;
    var pPr = [ks.pGoc, ngucanh.pPrBang, chuoiKieu(ks, idKieu, 'pPr'), pPrRieng].reduce(gopThuocTinh, null);
    var rPrDoan = [ks.rGoc, ngucanh.rPrBang, chuoiKieu(ks, idKieu, 'rPr')].reduce(gopThuocTinh, null);
    var manh = [], coNoiDung = false;
    var them = function (m) { var cuoi = manh[manh.length - 1]; if (m.chu != null && cuoi && cuoi.chu != null && cuoi.css === m.css) cuoi.chu += m.chu; else manh.push(m); coNoiDung = true; };
    var batDauTrongKetQua = truongMo.length > 0 && truongMo[truongMo.length - 1].tach;
    var veRun = function (r) {
      var rPr = [rPrDoan, chuoiKieu(ks, val(con(con(r, 'w:rPr'), 'w:rStyle')), 'rPr'), con(r, 'w:rPr')].reduce(gopThuocTinh, null);
      var css = cssChu(rPr);
      r.c.forEach(function (x) {
        if (typeof x === 'string') return;
        if (x.n === 'w:fldChar') {
          var loai = x.a['w:fldCharType'];
          if (loai === 'begin') {
            var id = ++soTruong;
            truongMo.push({ id: id, instr: '', tach: false, rPr: rPr, ketQua: '' });
            var dau = '\u0000' + id + '\u0000';
            if (truongMo.length > 1) truongMo[truongMo.length - 2].ketQua += dau; else them({ html: dau });
          }
          else if (loai === 'separate' && truongMo.length) truongMo[truongMo.length - 1].tach = true;
          else if (loai === 'end' && truongMo.length) {
            var t = truongMo.pop(), mf = phanTichTruong(t.instr);
            var dauRa;
            if (mf) { themTruong(mf.ten); dauRa = '<span class="truong" data-truong="' + anToan(mf.ten) + '"' + (mf.truoc ? ' data-truoc="' + anToan(mf.truoc) + '"' : '') + (mf.sau ? ' data-sau="' + anToan(mf.sau) + '"' : '') + ' style="' + cssChu(t.rPrKetQua || t.rPr) + '">«' + anToan(mf.ten) + '»</span>'; }
            else { if (/^\s*IF\b/i.test(t.instr)) soIf++; dauRa = t.ketQua; } // trường khác (IF, PAGE…): giữ kết quả Word đã tính
            ketQuaTruong[t.id] = dauRa;
          }
          return;
        }
        if (x.n === 'w:instrText') { if (truongMo.length && !truongMo[truongMo.length - 1].tach) truongMo[truongMo.length - 1].instr += chuTrong(x); return; }
        var dangTrongTruong = truongMo.length > 0;
        var phan = null;
        if (x.n === 'w:t') phan = { chu: chuTrong(x), css: css };
        else if (x.n === 'w:tab') phan = { html: '<span style="display:inline-block;min-width:24pt"></span>' };
        else if (x.n === 'w:br') phan = { html: x.a['w:type'] === 'page' ? '<span class="ngat-trang"></span>' : '<br>' };
        else if (x.n === 'w:cr') phan = { html: '<br>' };
        else if (x.n === 'w:noBreakHyphen') phan = { chu: '‑', css: css };
        else if (x.n === 'w:sym') phan = { html: '<span style="' + css + '">&#x' + (x.a['w:char'] || '25A1').replace(/^F0/i, '') + ';</span>' };
        else if (x.n === 'w:drawing') phan = { html: veAnh(x) };
        else if (x.n === 'w:pict' || x.n === 'mc:AlternateContent') { var d = tim(x, 'w:drawing'); phan = d ? { html: veAnh(d) } : null; }
        if (!phan || (phan.html === '')) return;
        if (dangTrongTruong) {
          var tt = truongMo[truongMo.length - 1];
          if (tt.tach) { if (!tt.rPrKetQua) tt.rPrKetQua = rPr; tt.ketQua += phan.chu != null ? '<span style="' + phan.css + '">' + anToan(phan.chu) + '</span>' : phan.html; }
          return;
        }
        them(phan);
      });
    };
    var duyet = function (nut) {
      nut.c.forEach(function (x) {
        if (typeof x === 'string') return;
        if (x.n === 'w:r') veRun(x);
        else if (x.n === 'w:hyperlink' || x.n === 'w:smartTag' || x.n === 'w:ins' || x.n === 'w:customXml' || x.n === 'w:sdt' || x.n === 'w:sdtContent' || x.n === 'w:fldSimple') {
          if (x.n === 'w:fldSimple') {
            var mf = phanTichTruong(x.a['w:instr']);
            if (mf) { themTruong(mf.ten); var r0 = tim(x, 'w:r'); them({ html: '<span class="truong" data-truong="' + anToan(mf.ten) + '" style="' + cssChu([rPrDoan, r0 && con(r0, 'w:rPr')].reduce(gopThuocTinh, null)) + '">«' + anToan(mf.ten) + '»</span>' }); return; }
          }
          duyet(x);
        }
      });
    };
    duyet(p);
    if (!coNoiDung && batDauTrongKetQua) return ''; // đoạn chỉ chứa phần kết quả trộn cũ của 1 trường (trải nhiều đoạn) -> bỏ
    var doanCss = cssDoan(pPr);
    dsDoan.push({ manh: manh, css: 'margin:0;' + cssChu(rPrDoan) + (doanCss ? ';' + doanCss : ''), viTri: ngucanh.viTri || null, rong: !coNoiDung });
    return '\u0001' + (dsDoan.length - 1) + '\u0001';
  };
  /** Dựng HTML 1 đoạn (sau khi dò trường). */
  var dungDoan = function (d) {
    if (d.bo) return '';
    var html = d.manh.map(function (m) {
      if (m.truong) return '<span class="truong" data-truong="' + anToan(m.truong) + '" data-do="' + m.doId + '" data-goc="' + anToan(m.goc) + '" style="' + m.css + '">«' + anToan(m.truong) + '»</span>';
      return m.chu != null ? '<span style="' + m.css + '">' + anToan(m.chu) + '</span>' : m.html;
    }).join('');
    // ký hiệu {{Tên trường}} gõ thẳng trong Word -> trường (gộp cả khi Word tách thành nhiều run)
    html = html.replace(/\{\{((?:[^{}<]|<[^>]*>)+?)\}\}/g, function (m, trong) {
      var ten = trong.replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').trim();
      if (!ten) return m;
      themTruong(ten);
      return '<span class="truong" data-truong="' + anToan(ten) + '">«' + anToan(ten) + '»</span>';
    });
    if (d.rong) html = '&#8203;'; // đoạn trống vẫn giữ chiều cao 1 dòng
    return '<p style="' + d.css + '">' + html + '</p>';
  };

  var veBang = function (tbl, ngucanh) {
    var tblPr = con(tbl, 'w:tblPr');
    var idKieu = val(con(tblPr, 'w:tblStyle')) || ks.macDinhBang;
    var kieuBang = idKieu && ks.theoId[idKieu] ? ks.theoId[idKieu] : null;
    var tblPrDu = [kieuBang && chuoiKieu(ks, idKieu, 'tblPr'), tblPr].reduce(gopThuocTinh, null);
    var vien = con(tblPrDu, 'w:tblBorders');
    var ngucanhCon = { pPrBang: kieuBang ? chuoiKieu(ks, idKieu, 'pPr') : null, rPrBang: kieuBang ? chuoiKieu(ks, idKieu, 'rPr') : null };
    var cot = cacCon(con(tbl, 'w:tblGrid'), 'w:gridCol').map(function (g) { return Number(g.a['w:w'] || 0); });
    var le = con(tblPrDu, 'w:tblCellMar');
    var leTrai = le && con(le, 'w:left') ? Number(con(le, 'w:left').a['w:w']) : 108, lePhai = le && con(le, 'w:right') ? Number(con(le, 'w:right').a['w:w']) : 108;
    var hang = cacCon(tbl, 'w:tr');
    // lưới ô: xử lý gridBefore / gridSpan / vMerge (gộp dọc)
    var luoi = hang.map(function (tr) {
      var trPr = con(tr, 'w:trPr'), viTri = Number(val(con(trPr, 'w:gridBefore')) || 0), dsO = [];
      cacCon(tr, 'w:tc').forEach(function (tc) {
        var tcPr = con(tc, 'w:tcPr'), span = Number(val(con(tcPr, 'w:gridSpan')) || 1), vm = con(tcPr, 'w:vMerge');
        dsO.push({ tc: tc, tcPr: tcPr, cot: viTri, span: span, vm: vm ? (val(vm) === 'restart' ? 'dau' : 'tiep') : '', rowspan: 1 });
        viTri += span;
      });
      return { tr: tr, trPr: trPr, truoc: Number(val(con(trPr, 'w:gridBefore')) || 0), o: dsO };
    });
    luoi.forEach(function (h, i) {
      h.o.forEach(function (o) {
        if (o.vm !== 'tiep') return;
        for (var k = i - 1; k >= 0; k--) { var tren = luoi[k].o.find(function (x) { return x.cot === o.cot; }); if (tren && tren.vm !== 'tiep') { tren.rowspan++; break; } if (!tren) break; }
      });
    });
    var nHang = luoi.length, tongCot = cot.length, idBang = ++soBang;
    var veO = function (o, i) {
      var ngucanhO = { pPrBang: ngucanhCon.pPrBang, rPrBang: ngucanhCon.rPrBang, viTri: { bang: idBang, hang: i, cot: o.cot } };
      var tcB = con(o.tcPr, 'w:tcBorders');
      var canh = function (k, ngoai, trong) {
        var rieng = tcB && con(tcB, 'w:' + k);
        if (rieng) return cssVien(rieng);
        var b = vien && con(vien, 'w:' + (ngoai ? k : trong));
        return b ? cssVien(b) : 'none';
      };
      var cuoiHang = i + o.rowspan - 1 === nHang - 1, cuoiCot = o.cot + o.span >= tongCot;
      var css = ['border-top:' + canh('top', i === 0, 'insideH'), 'border-bottom:' + canh('bottom', cuoiHang, 'insideH'),
        'border-left:' + canh('left', o.cot === 0, 'insideV'), 'border-right:' + canh('right', cuoiCot, 'insideV'),
        'padding:0 ' + pt(lePhai) + ' 0 ' + pt(leTrai)];
      var va = val(con(o.tcPr, 'w:vAlign')); css.push('vertical-align:' + (va === 'center' ? 'middle' : va === 'bottom' ? 'bottom' : 'top'));
      var shd = con(o.tcPr, 'w:shd'); if (shd && shd.a['w:fill'] && shd.a['w:fill'] !== 'auto') css.push('background:#' + shd.a['w:fill']);
      var noi = o.tc.c.filter(function (x) { return typeof x !== 'string' && (x.n === 'w:p' || x.n === 'w:tbl' || x.n === 'w:sdt'); })
        .map(function (x) { return x.n === 'w:tbl' ? veBang(x, ngucanhCon) : x.n === 'w:sdt' ? veKhoi(con(x, 'w:sdtContent'), ngucanhO) : veDoan(x, ngucanhO); }).join('');
      return '<td' + (o.span > 1 ? ' colspan="' + o.span + '"' : '') + (o.rowspan > 1 ? ' rowspan="' + o.rowspan + '"' : '') + ' style="' + css.join(';') + '">' + noi + '</td>';
    };
    var than = luoi.map(function (h, i) {
      var cao = con(h.trPr, 'w:trHeight'), css = cao ? 'height:' + pt(Number(cao.a['w:val'])) : '';
      var o = h.o.filter(function (x) { return x.vm !== 'tiep'; }).map(function (x) { return veO(x, i); }).join('');
      var dau = h.truoc ? '<td colspan="' + h.truoc + '" style="border:none"></td>' : '';
      return '<tr' + (css ? ' style="' + css + '"' : '') + '>' + dau + o + '</tr>';
    }).join('');
    // cột lưới thừa ở cuối (hàng có gridAfter, không ô nào dùng tới) không tính vào bề rộng bảng
    var dungToi = luoi.reduce(function (m, h) { return Math.max(m, h.o.reduce(function (s, o) { return Math.max(s, o.cot + o.span); }, h.truoc)); }, 0);
    if (dungToi > 0 && dungToi < cot.length) cot = cot.slice(0, dungToi);
    var rong = cot.reduce(function (a, b) { return a + b; }, 0);
    var jc = val(con(tblPrDu, 'w:jc')), ind = con(tblPrDu, 'w:tblInd');
    rongBangToiDa = Math.max(rongBangToiDa, rong + (ind && ind.a['w:w'] ? Number(ind.a['w:w']) : 0));
    var cssBang = 'border-collapse:collapse;table-layout:fixed;width:' + pt(rong) + ';max-width:100%' +
      (jc === 'center' ? ';margin-left:auto;margin-right:auto' : jc === 'right' ? ';margin-left:auto' : ind && ind.a['w:w'] ? ';margin-left:' + pt(Number(ind.a['w:w'])) : '');
    return '<table style="' + cssBang + '"><colgroup>' + cot.map(function (w) { return '<col style="width:' + pt(w) + '">'; }).join('') + '</colgroup><tbody>' + than + '</tbody></table>';
  };

  var veKhoi = function (nut, ngucanh) {
    return (nut ? nut.c : []).map(function (x) {
      if (typeof x === 'string') return '';
      if (x.n === 'w:p') return veDoan(x, ngucanh);
      if (x.n === 'w:tbl') return veBang(x, ngucanh);
      if (x.n === 'w:sdt') return veKhoi(con(x, 'w:sdtContent'), ngucanh);
      return '';
    }).join('');
  };

  var noiDung = veKhoi(body, {});
  // Word thường (không có trường trộn thư) -> tự dò chỗ cần điền: theo file Excel mẫu (nếu có) hoặc theo nhãn "Họ và tên: …"
  var doDuoc = [];
  if (!truong.length || (tuyChon && tuyChon.duLieu)) doDuoc = doTruong(dsDoan, tuyChon && tuyChon.duLieu, themTruong);
  noiDung = noiDung.replace(/\u0001(\d+)\u0001/g, function (m, i) { return dungDoan(dsDoan[+i]); });
  for (var vong = 0; vong < 5 && noiDung.indexOf('\u0000') >= 0; vong++) noiDung = noiDung.replace(/\u0000(\d+)\u0000/g, function (m, id) { return ketQuaTruong[id] != null ? ketQuaTruong[id] : ''; });
  // khổ giấy + lề (section cuối)
  var sect = con(body, 'w:sectPr'), pg = con(sect, 'w:pgSz'), mar = con(sect, 'w:pgMar');
  var trang = {
    rong: pg ? Number(pg.a['w:w']) / 20 : 595.3, cao: pg ? Number(pg.a['w:h']) / 20 : 841.9,
    tren: mar ? Number(mar.a['w:top']) / 20 : 72, duoi: mar ? Number(mar.a['w:bottom']) / 20 : 72,
    trai: mar ? Number(mar.a['w:left']) / 20 : 72, phai: mar ? Number(mar.a['w:right']) / 20 : 72
  };
  trang.rongToiDa = Math.max(trang.rong - trang.trai - trang.phai, rongBangToiDa / 20); // bề rộng thực của nội dung (pt)
  if (soIf) canhBao.push(soIf + ' trường điều kiện (IF) đang hiển thị theo giá trị lúc lưu file Word — chưa tính lại theo từng học sinh.');
  if (/<w:txbxContent/.test(chuoiTuByte(docGoc))) canhBao.push('File có hộp văn bản (text box): nội dung trong hộp có thể chưa hiển thị đúng vị trí.');
  var html = '<div class="mau-word" style="width:' + (trang.rong - trang.trai - trang.phai).toFixed(1) + 'pt;font-family:\'Times New Roman\',serif;font-size:11pt;line-height:1.15;color:#000">' + noiDung + '</div>';
  return { ok: true, html: html, truong: truong, trang: trang, canhBao: canhBao, soAnh: soAnh, doDuoc: doDuoc };
}

/* ===================== tự dò trường (Word thường) ===================== */

function chuanSo(s) { // so sánh giá trị: gộp khoảng trắng, NFC; số thập phân "2,75" = "2.75"
  s = String(s == null ? '' : s).normalize('NFC').replace(/\s+/g, ' ').trim();
  return /^-?\d+(?:[.,]\d+)?$/.test(s) ? s.replace(',', '.') : s;
}
function khongDauNhe(s) { return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[đĐ]/g, 'd').toLowerCase().replace(/[^a-z0-9]/g, ''); }

var NHAN_HE_THONG = [
  { re: /(?:họ\s*(?:và)?\s*tên(?:\s*học\s*sinh)?|học\s*sinh)\s*:\s*/i, truong: 'Họ_và_tên' },
  { re: /(?:số\s*báo\s*danh|sbd)\s*:\s*/i, truong: 'Số_báo_danh' },
  { re: /mã\s*đề(?:\s*thi)?\s*:\s*/i, truong: 'Mã_đề_thi' },
  { re: /tổng\s*điểm\s*:\s*/i, truong: 'Tổng_điểm' },
  { re: /ngày\s*thi\s*:\s*/i, truong: 'Ngày_thi' },
  { re: /(?<![a-zà-ỹ])lớp(?:\s*[a-zà-ỹ]+)?\s*:\s*/i, truong: 'Lớp' }
];

/**
 * Dò chỗ cần điền trong các đoạn (Word thường đã điền sẵn dữ liệu 1 học sinh).
 * duLieu = { tieuDe: [tiêu đề cột Excel], dong: [[giá trị…], …] } (file kết quả dùng để trộn) — có thì dò theo giá trị, không thì theo nhãn.
 * Đổi mảnh chữ thành { truong, css, goc, doId } ngay trong dsDoan. Trả về danh sách đã dò [{ id, truong, goc, cach }].
 */
function doTruong(dsDoan, duLieu, themTruong) {
  var ketQua = [], soId = 0;
  var doanText = function (d) { return d.manh.map(function (m) { return m.chu != null ? m.chu : m.truong ? '\u0002' : '\u0003'; }).join(''); };
  /** Thay đoạn chữ [tu, den) (theo vị trí trong chuỗi doanText) của đoạn d bằng 1 trường. */
  var thay = function (d, tu, den, ten, cach) {
    var moi = [], viTri = 0, daDat = false, goc = doanText(d).slice(tu, den);
    d.manh.forEach(function (m) {
      var dai = m.chu != null ? m.chu.length : 1, a = viTri, b = viTri + dai;
      viTri = b;
      if (m.chu == null || b <= tu || a >= den) { moi.push(m); return; }
      if (a < tu) moi.push({ chu: m.chu.slice(0, tu - a), css: m.css });
      if (!daDat) { moi.push({ truong: ten, css: m.css, goc: goc, doId: ++soId }); daDat = true; }
      if (b > den) moi.push({ chu: m.chu.slice(den - a), css: m.css });
    });
    d.manh = moi;
    themTruong(ten);
    ketQua.push({ id: soId, truong: ten, goc: goc.trim(), cach: cach });
  };
  var chiChu = function (d) { return d.manh.length && d.manh.every(function (m) { return m.chu != null; }); };

  /* ---- 1. Theo file Excel: chọn dòng của học sinh có trong phiếu ---- */
  var dong = null, tieuDe = [], ten = [];
  if (duLieu && duLieu.tieuDe && duLieu.dong && duLieu.dong.length) {
    tieuDe = duLieu.tieuDe.map(function (x) { return String(x == null ? '' : x); });
    ten = tieuDe.map(function (h, j) { return tenTruongWord(h, j); });
    var toanVan = dsDoan.map(function (d) { return chuanSo(doanText(d)); }).join('\n');
    var diemTot = 0;
    duLieu.dong.forEach(function (r) {
      var diem = 0, daDem = {};
      r.forEach(function (v) { v = chuanSo(v); if (v.length >= 4 && !daDem[v] && toanVan.indexOf(v) >= 0) { daDem[v] = 1; diem += v.length >= 8 ? 2 : 1; } });
      if (diem > diemTot) { diemTot = diem; dong = r; }
    });
    if (diemTot < 3) dong = null;
  }
  if (dong) {
    var gt = dong.map(chuanSo);
    /* 1a. Bảng: cột ô khớp 1 chuỗi cột Excel ("Câu 1…Câu 12" -> Câu_1…; "1…22" -> M_1…) */
    var chuoi = {};
    tieuDe.forEach(function (h, j) {
      var m = /^(.*?)[\s_.-]*(\d+)$/.exec(h.trim()); if (!m) return;
      var k = khongDauNhe(m[1]); (chuoi[k] = chuoi[k] || []).push({ j: j, so: +m[2] });
    });
    var dsChuoi = Object.keys(chuoi).filter(function (k) { return chuoi[k].length >= 3; }).map(function (k) {
      return { tienTo: k, cot: chuoi[k].sort(function (a, b) { return a.so - b.so; }).map(function (x) { return x.j; }) };
    });
    var theoCot = {};
    dsDoan.forEach(function (d, i) { if (d.viTri && chiChu(d)) { var k = d.viTri.bang + ':' + d.viTri.cot; (theoCot[k] = theoCot[k] || []).push(i); } });
    Object.keys(theoCot).forEach(function (k) {
      var o = theoCot[k].map(function (i) { return { i: i, v: chuanSo(doanText(dsDoan[i])) }; });
      if (o.length < 3) return;
      var tot = null;
      dsChuoi.forEach(function (c) {
        var phieu = {};
        o.forEach(function (x, vt) { if (!x.v) return; c.cot.forEach(function (j, p) { if (gt[j] === x.v) phieu[p - vt] = (phieu[p - vt] || 0) + 1; }); });
        Object.keys(phieu).forEach(function (lech) {
          var ung = { c: c, lech: +lech, phieu: phieu[lech] };
          if (!tot || ung.phieu > tot.phieu) { tot = ung; return; }
          if (ung.phieu === tot.phieu) { // bằng nhau (học sinh làm đúng hết): theo tiêu đề cột trên phiếu
            var dau = khongDauNhe(o.slice(0, 3).map(function (x) { return x.v; }).join(' '));
            var dapAnDung = /dung|dapso|dapan(?!cuaban)/.test(dau) && !/cuaban/.test(dau);
            if ((dapAnDung && ung.c.tienTo !== 'cau') || (!dapAnDung && ung.c.tienTo === 'cau' && tot.c.tienTo !== 'cau')) tot = ung;
          }
        });
      });
      var coChu = o.filter(function (x) { return x.v; }).length;
      if (!tot || tot.phieu < 3 || tot.phieu < coChu * 0.5) return;
      o.forEach(function (x, vt) {
        var p = vt + tot.lech, j = tot.c.cot[p];
        if (j == null || !x.v || gt[j] !== x.v) return;
        var d = dsDoan[x.i], s = doanText(d), a = s.search(/\S/);
        thay(d, a, s.trimEnd().length, ten[j], 'bảng');
        x.xong = true;
      });
    });
    /* 1b. Giá trị nhiều dòng (nhận xét): các đoạn liên tiếp trùng từng dòng */
    gt.forEach(function (v, j) {
      var dongs = String(dong[j] || '').split(/\r?\n/).map(chuanSo).filter(Boolean);
      if (dongs.length < 2) return;
      for (var i = 0; i + dongs.length <= dsDoan.length; i++) {
        var khop = dongs.every(function (l, k) { var d = dsDoan[i + k]; return chiChu(d) && chuanSo(doanText(d)) === l; });
        if (!khop) continue;
        var d0 = dsDoan[i], s = doanText(d0);
        thay(d0, s.search(/\S/), s.trimEnd().length, ten[j], 'nhiều dòng');
        ketQua[ketQua.length - 1].goc = dongs.join(' / ');
        for (var k = 1; k < dongs.length; k++) dsDoan[i + k].bo = true;
        break;
      }
    });
    /* 1c. Giá trị đơn: mảnh chữ trùng giá trị 1 ô (số ngắn cần có nhãn đứng trước, VD "Mã đề thi: 101") */
    var ungVien = gt.map(function (v, j) { return { j: j, v: v }; }).filter(function (x) { return x.v; });
    // Số: cột có cùng kiểu thập phân với giá trị trên phiếu ở mọi dòng (VD "3.00" chứ không phải "3") được ưu tiên
    var dinhDangGiong = function (j, v) {
      var m = /^-?\d+(?:\.(\d+))?$/.exec(v); if (!m) return 0;
      var thap = m[1] ? m[1].length : 0, co = 0, tong = 0;
      duLieu.dong.forEach(function (r) { var s = chuanSo(r[j]); if (!/^-?\d+(?:\.\d+)?$/.test(s)) return; tong++; var mm = /\.(\d+)$/.exec(s); if ((mm ? mm[1].length : 0) === thap) co++; });
      return tong ? co / tong : 0;
    };
    dsDoan.forEach(function (d) {
      if (d.bo) return;
      for (var vong = 0; vong < 30; vong++) {
        var s = doanText(d), tot = null;
        // các khúc chữ liền nhau (giữa 2 trường / ảnh)
        var khuc = [], re = /[^\u0002\u0003]+/g, m;
        while ((m = re.exec(s))) khuc.push({ tu: m.index, chu: m[0] });
        // từng mảnh có kiểu chữ riêng (VD "Phần 3: " thường + "1.10" đỏ đậm): giá trị thường được định dạng khác nhãn
        var vtM = 0;
        d.manh.forEach(function (mm) { var dai = mm.chu != null ? mm.chu.length : 1; if (mm.chu != null && mm.chu.trim()) khuc.push({ tu: vtM, chu: mm.chu }); vtM += dai; });
        khuc.forEach(function (k) {
          ungVien.forEach(function (x) {
            var v = x.v, ngan = v.length < 4 || /^\d{1,3}$/.test(v);
            var tim = function (tu, den) {
              var truoc = khongDauNhe(s.slice(0, tu)), nhan = khongDauNhe(tieuDe[x.j]);
              var coNhan = nhan.length >= 3 && truoc.slice(-nhan.length - 6).indexOf(nhan) >= 0;
              // nhãn trên phiếu ngắn hơn tên cột ("Mã đề:" ~ cột "Mã đề thi"): đuôi chữ ngay trước giá trị nằm trong tên cột
              for (var dai = Math.min(12, truoc.length); !coNhan && dai >= 4; dai--) if (nhan.indexOf(truoc.slice(-dai)) >= 0) coNhan = true;
              if (ngan && !coNhan) return;
              var diem = (coNhan ? 4 : 0) + (tieuDe[x.j].trim() ? 1 : 0) + v.length / 100 + dinhDangGiong(x.j, v) * 3;
              if (!tot || diem > tot.diem) tot = { tu: tu, den: den, j: x.j, diem: diem };
            };
            var chuK = chuanSo(k.chu), dau = k.chu.search(/\S/);
            if (chuK === v) { tim(k.tu + dau, k.tu + k.chu.trimEnd().length); return; }
            // nằm giữa câu: chỉ với giá trị đủ đặc trưng (tên, số dài)
            if (v.length >= 6 && /[^\d.\s]/.test(v) || v.length >= 8) {
              var vt = k.chu.indexOf(v);
              if (vt >= 0) tim(k.tu + vt, k.tu + vt + v.length);
            }
          });
        });
        if (!tot) break;
        thay(d, tot.tu, tot.den, ten[tot.j], 'giá trị');
      }
    });
  } else {
    /* 2. Không có file Excel: theo nhãn quen thuộc "Họ và tên: …", "Lớp: …", "SBD: …" */
    dsDoan.forEach(function (d) {
      var daDung = {};
      for (var vong = 0; vong < 8; vong++) {
        var s = doanText(d), tot = null;
        NHAN_HE_THONG.forEach(function (n) {
          if (daDung[n.truong]) return;
          var re = new RegExp(n.re.source, 'ig'), m;
          while ((m = re.exec(s))) {
            var tu = m.index + m[0].length, sau = s.slice(tu);
            var het = sau.search(/[\u0002\u0003;]|\s{2,}|\s+\d+\.\s|\/\d|$/);
            // giá trị thường có kiểu chữ riêng: dừng ở chỗ đổi kiểu (VD "6.20" đỏ đậm + "/10" thường)
            var batDau = tu + (sau.length - sau.replace(/^\s+/, '').length), vtM = 0;
            d.manh.forEach(function (mm) { var dai = mm.chu != null ? mm.chu.length : 1; if (vtM <= batDau && batDau < vtM + dai && vtM + dai - tu > 0) het = Math.min(het, vtM + dai - tu); vtM += dai; });
            var giaTri = sau.slice(0, het).trimEnd();
            if (!giaTri || giaTri.length > 60 || /^[«{]/.test(giaTri)) continue;
            if (!tot || tu < tot.tu) tot = { tu: tu, den: tu + giaTri.length, truong: n.truong };
          }
        });
        if (!tot) break;
        daDung[tot.truong] = 1;
        thay(d, tot.tu, tot.den, tot.truong, 'nhãn');
      }
    });
  }
  return ketQua;
}

/* ===================== điền dữ liệu ===================== */

/** Điền giá trị vào mẫu: giaTri = { tênTrường: giá trị } (so tên không phân biệt hoa thường, "_" ~ dấu cách). */
export function dienMau(html, giaTri, tuyChon) {
  tuyChon = tuyChon || {};
  var theoKhoa = {};
  Object.keys(giaTri || {}).forEach(function (k) { theoKhoa[khoaTruong(k)] = giaTri[k]; });
  return String(html).replace(/<span class="truong" data-truong="([^"]*)"((?:\s+data-[a-z]+="[^"]*")*)(\s+style="[^"]*")?>[^<]*<\/span>/g, function (m, ten, them, style) {
    var tenGoc = ten.replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
    var v = theoKhoa[khoaTruong(tenGoc)];
    if (v == null || v === '') return tuyChon.giuTrong ? m : '<span' + (style || '') + '></span>';
    var truoc = /data-truoc="([^"]*)"/.exec(them || ''), sau = /data-sau="([^"]*)"/.exec(them || '');
    var noi = anToan(String(v).replace(/\r\n?/g, '\n')).replace(/\n/g, '<br>');
    return '<span' + (style || '') + '>' + (truoc ? truoc[1] : '') + noi + (sau ? sau[1] : '') + '</span>';
  });
}
