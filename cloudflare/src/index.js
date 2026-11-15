/**
 * PHIẾU KẾT QUẢ HỌC TẬP — Cloudflare Worker (API) + D1 (dữ liệu) + giao diện tĩnh (public/)
 *
 *   /            trang tra cứu cho phụ huynh (nhập mã)
 *   /gv          trang giáo viên: tự đăng ký / đăng nhập, quản lý lớp, gửi kết quả (2 file: kết quả + đáp án theo mã đề)
 *   /api/...     API (bên dưới)
 *
 * Mỗi người đăng ký có 1 "không gian" riêng (của 1 giáo viên hoặc 1 trung tâm); có thể mời thêm giáo viên và giao lớp.
 * Phiếu không lưu dạng PDF: lưu dữ liệu đã chấm, trình duyệt dựng phiếu và tạo PDF.
 */
import * as L from './logic.js';
import * as MW from './mau-word.js';
import * as KP from './khoi-phieu.js';
import TRANG from './trang.js';

const COOKIE = 'kq_phien';
const PHIEN_NGAY = 30;
const VONG_BAM = 10000; // PBKDF2 — vừa với giới hạn 10 ms CPU của gói miễn phí
const VAI_TRO = { chu: 'Chủ', quan_tri: 'Quản trị', giao_vien: 'Giáo viên' };

class Loi extends Error { constructor(thongDiep, ma = 400) { super(thongDiep); this.ma = ma; } }

const json = (o, ma = 200, them = {}) => new Response(JSON.stringify(o), {
  status: ma, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...them }
});

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (url.pathname.startsWith('/api/')) {
      try {
        return await xuLyApi(req, env, url);
      } catch (e) {
        if (e instanceof Loi) return json({ ok: false, loi: e.message }, e.ma);
        console.error(e && e.stack || e);
        return json({ ok: false, loi: 'Có lỗi xảy ra, vui lòng thử lại.' }, 500);
      }
    }
    return phucVuTrang(url, req);
  }
};

/* Trang tĩnh (đóng gói từ public/): / -> index.html, /gv -> gv.html */
const DAU_BAO_MAT = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'X-Frame-Options': 'SAMEORIGIN',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()'
};
function phucVuTrang(url, req) {
  if (req.method !== 'GET' && req.method !== 'HEAD') return new Response('Phương thức không hợp lệ.', { status: 405 });
  let duong = url.pathname.replace(/\/+$/, '') || '/index.html';
  if (!duong.includes('.')) duong += '.html';
  const t = TRANG[duong];
  const loai = t ? t.loai : 'text/html; charset=utf-8';
  return new Response(req.method === 'HEAD' ? null : (t || TRANG['/404.html']).noiDung, {
    status: t ? 200 : 404,
    headers: { 'Content-Type': loai, 'Cache-Control': loai.startsWith('text/html') ? 'no-cache' : 'public, max-age=3600', ...DAU_BAO_MAT }
  });
}

/* =====================================================================
 * ĐỊNH TUYẾN API
 * ===================================================================== */

async function xuLyApi(req, env, url) {
  const db = env.DB;
  const p = url.pathname;
  if (req.method === 'GET' && p === '/api/toi') return toi(req, db);
  if (req.method !== 'POST') throw new Loi('Phương thức không hợp lệ.', 405);
  // Chống CSRF: trang khác không thể tự gắn header này khi gửi form
  if (req.headers.get('X-KQ') !== '1') throw new Loi('Yêu cầu không hợp lệ.', 403);
  const body = await req.json().catch(() => { throw new Loi('Dữ liệu gửi lên không hợp lệ.'); });
  if (Math.random() < 0.02) await donDep(db);

  switch (p) {
    case '/api/dang-ky': return dangKy(req, db, url, body);
    case '/api/dang-nhap': return dangNhap(req, db, url, body);
    case '/api/dang-xuat': return dangXuat(req, db, url);
    case '/api/chon-khong-gian': return chonKhongGian(req, db, body);
    case '/api/tra-cuu': return traCuu(req, db, body);
    case '/api/phieu': return layPhieu(req, db, body);
    case '/api/rpc': return rpc(req, env, url, body);
  }
  throw new Loi('Không tìm thấy.', 404);
}

/* =====================================================================
 * TIỆN ÍCH
 * ===================================================================== */

const taoId = () => crypto.randomUUID();
const b64u = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const ip = (req) => req.headers.get('CF-Connecting-IP') || 'local';

function ngayVN(d = new Date()) {
  return new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Ho_Chi_Minh', day: '2-digit', month: '2-digit', year: 'numeric' }).format(d);
}

/** Mã ngẫu nhiên an toàn (crypto), không lệch phân phối, bỏ ký tự dễ nhầm. */
function maNgauNhien(n = L.CAU_HINH.DO_DAI_MA) {
  const ky = L.CAU_HINH.KY_TU_MA, gioiHan = Math.floor(256 / ky.length) * ky.length;
  let s = '';
  while (s.length < n) {
    const b = crypto.getRandomValues(new Uint8Array(32));
    for (const x of b) if (x < gioiHan && s.length < n) s += ky[x % ky.length];
  }
  return s;
}

async function sha256Hex(s) {
  const h = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function bamMatKhau(mk, muoi = null, vong = VONG_BAM) {
  muoi = muoi || b64u(crypto.getRandomValues(new Uint8Array(16)));
  const khoa = await crypto.subtle.importKey('raw', new TextEncoder().encode(mk), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: new TextEncoder().encode(muoi), iterations: vong }, khoa, 256);
  return `pbkdf2$${vong}$${muoi}$${b64u(bits)}`;
}

async function dungMatKhau(mk, daLuu) {
  const [, vong, muoi] = String(daLuu).split('$');
  if (!vong || !muoi) return false;
  const h = await bamMatKhau(String(mk), muoi, Number(vong));
  if (h.length !== daLuu.length) return false;
  let x = 0;
  for (let i = 0; i < h.length; i++) x |= h.charCodeAt(i) ^ daLuu.charCodeAt(i);
  return x === 0;
}

function taoMatKhauTam() {
  const m = maNgauNhien(8).toLowerCase();
  return m.slice(0, 4) + '-' + m.slice(4);
}

/** Đếm số lần thử trong cửa sổ thời gian (chống dò mật khẩu / mã tra cứu). */
async function tangDem(db, khoa, cuaSoMs) {
  const k = khoa + ':' + Math.floor(Date.now() / cuaSoMs);
  const r = await db.prepare('INSERT INTO gioi_han (khoa, dem, het_han) VALUES (?, 1, ?) ON CONFLICT(khoa) DO UPDATE SET dem = dem + 1 RETURNING dem')
    .bind(k, Date.now() + cuaSoMs).first();
  return r ? r.dem : 1;
}
async function docDem(db, khoa, cuaSoMs) {
  const r = await db.prepare('SELECT dem FROM gioi_han WHERE khoa = ?').bind(khoa + ':' + Math.floor(Date.now() / cuaSoMs)).first();
  return r ? r.dem : 0;
}
async function donDep(db) {
  const now = Date.now();
  await db.batch([db.prepare('DELETE FROM gioi_han WHERE het_han < ?').bind(now), db.prepare('DELETE FROM phien WHERE het_han < ?').bind(now)]);
}

/** INSERT nhiều dòng, chia nhỏ theo giới hạn 100 tham số / câu lệnh của D1. */
function lenhChenNhieu(db, bang, cot, dong, kieu = 'INSERT') {
  const moiLan = Math.max(1, Math.floor(100 / cot.length)), lenh = [];
  for (let i = 0; i < dong.length; i += moiLan) {
    const phan = dong.slice(i, i + moiLan);
    const ph = '(' + cot.map(() => '?').join(',') + ')';
    lenh.push(db.prepare(`${kieu} INTO ${bang} (${cot.join(',')}) VALUES ${phan.map(() => ph).join(',')}`).bind(...phan.flat()));
  }
  return lenh;
}
/** DELETE ... WHERE cot IN (...) chia nhỏ. */
function lenhXoaTheo(db, bang, cot, giaTri) {
  const lenh = [];
  for (let i = 0; i < giaTri.length; i += 99) {
    const phan = giaTri.slice(i, i + 99);
    lenh.push(db.prepare(`DELETE FROM ${bang} WHERE ${cot} IN (${phan.map(() => '?').join(',')})`).bind(...phan));
  }
  return lenh;
}
async function chay(db, lenh) { if (lenh.length) await db.batch(lenh); }

/* =====================================================================
 * PHIÊN ĐĂNG NHẬP
 * ===================================================================== */

function docCookie(req) {
  const m = (req.headers.get('Cookie') || '').match(new RegExp('(?:^|;\\s*)' + COOKIE + '=([^;]+)'));
  return m ? m[1] : '';
}
function cookie(url, token, giay) {
  return `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${giay}${url.protocol === 'https:' ? '; Secure' : ''}`;
}
async function taoPhien(db, url, tkId, kg) {
  const token = b64u(crypto.getRandomValues(new Uint8Array(32)));
  await db.prepare('INSERT INTO phien (bam_token, tai_khoan, kg, het_han) VALUES (?, ?, ?, ?)')
    .bind(await sha256Hex(token), tkId, kg, Date.now() + PHIEN_NGAY * 864e5).run();
  return cookie(url, token, PHIEN_NGAY * 86400);
}

/** Đọc người dùng từ cookie. Trả về null nếu chưa đăng nhập. */
async function docPhien(req, db) {
  const token = docCookie(req);
  if (!token) return null;
  const bam = await sha256Hex(token);
  const r = await db.prepare(`SELECT p.tai_khoan, p.kg, p.het_han, t.email, t.ho_ten, tv.vai_tro, tv.lop, tv.trang_thai, k.ten AS ten_kg, k.cai_dat
      FROM phien p JOIN tai_khoan t ON t.id = p.tai_khoan
      LEFT JOIN thanh_vien tv ON tv.kg = p.kg AND tv.tai_khoan = p.tai_khoan
      LEFT JOIN khong_gian k ON k.id = p.kg
      WHERE p.bam_token = ? AND p.het_han > ?`).bind(bam, Date.now()).first();
  if (!r) return null;
  // Gia hạn khi còn dùng (trượt)
  if (r.het_han - Date.now() < (PHIEN_NGAY - 1) * 864e5) {
    await db.prepare('UPDATE phien SET het_han = ? WHERE bam_token = ?').bind(Date.now() + PHIEN_NGAY * 864e5, bam).run();
  }
  const conHieuLuc = r.vai_tro && r.trang_thai !== 'Khóa';
  const quanTri = r.vai_tro === 'chu' || r.vai_tro === 'quan_tri';
  return {
    bamToken: bam, tkId: r.tai_khoan, email: r.email, hoTen: r.ho_ten, kg: conHieuLuc ? r.kg : null,
    tenKg: r.ten_kg || '', caiDat: JSON.parse(r.cai_dat || '{}'), vaiTro: r.vai_tro, quanTri,
    lop: quanTri || r.lop === '*' ? '*' : JSON.parse(r.lop || '[]')
  };
}

async function dsKhongGianCua(db, tkId) {
  return (await db.prepare(`SELECT k.id, k.ten, tv.vai_tro, tv.trang_thai FROM thanh_vien tv JOIN khong_gian k ON k.id = tv.kg
      WHERE tv.tai_khoan = ? ORDER BY tv.ngay_tao`).bind(tkId).all()).results
    .filter((x) => x.trang_thai !== 'Khóa').map((x) => ({ id: x.id, ten: x.ten, vaiTro: VAI_TRO[x.vai_tro] }));
}

async function toi(req, db) {
  const nd = await docPhien(req, db);
  if (!nd) return json({ dangNhap: false });
  const ds = await dsKhongGianCua(db, nd.tkId);
  if (!nd.kg && ds.length) { // không gian hiện tại bị khóa / bị xóa khỏi -> chuyển sang không gian khác
    await db.prepare('UPDATE phien SET kg = ? WHERE bam_token = ?').bind(ds[0].id, nd.bamToken).run();
    return toi(req, db);
  }
  return json({ dangNhap: !!nd.kg, hoTen: nd.hoTen, email: nd.email, khongGian: nd.kg ? { id: nd.kg, ten: nd.tenKg } : null, dsKhongGian: ds });
}

/* =====================================================================
 * ĐĂNG KÝ / ĐĂNG NHẬP
 * ===================================================================== */

const chuanEmail = (s) => String(s || '').trim().toLowerCase();
const emailHopLe = (s) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s) && s.length <= 120;

async function dangKy(req, db, url, b) {
  if (await tangDem(db, 'dk:' + ip(req), 3600e3) > 10) throw new Loi('Bạn đăng ký quá nhiều lần, vui lòng thử lại sau 1 giờ.', 429);
  const email = chuanEmail(b.email), hoTen = L.chuoi_(b.hoTen).replace(/\s+/g, ' ');
  const tenKg = L.chuoi_(b.tenKhongGian).replace(/\s+/g, ' ') || hoTen;
  if (!hoTen) throw new Loi('Vui lòng nhập họ tên.');
  if (!emailHopLe(email)) throw new Loi('Email không hợp lệ.');
  if (String(b.matKhau || '').length < 8) throw new Loi('Mật khẩu tối thiểu 8 ký tự.');
  if (await db.prepare('SELECT 1 FROM tai_khoan WHERE email = ?').bind(email).first()) throw new Loi('Email này đã có tài khoản. Hãy đăng nhập.');
  const tkId = taoId(), kg = taoId(), homNay = ngayVN();
  await db.batch([
    db.prepare('INSERT INTO tai_khoan (id, email, ho_ten, mat_khau, ngay_tao) VALUES (?, ?, ?, ?, ?)').bind(tkId, email, hoTen, await bamMatKhau(String(b.matKhau)), homNay),
    db.prepare('INSERT INTO khong_gian (id, ten, cai_dat, ngay_tao) VALUES (?, ?, ?, ?)').bind(kg, tenKg, '{}', homNay),
    db.prepare("INSERT INTO thanh_vien (kg, tai_khoan, vai_tro, lop, trang_thai, ngay_tao) VALUES (?, ?, 'chu', '*', 'Hoạt động', ?)").bind(kg, tkId, homNay)
  ]);
  return json({ ok: true }, 200, { 'Set-Cookie': await taoPhien(db, url, tkId, kg) });
}

async function dangNhap(req, db, url, b) {
  const email = chuanEmail(b.email);
  const LOI = 'Email hoặc mật khẩu không đúng.';
  if (await docDem(db, 'dn:' + ip(req), 600e3) >= 10 || await docDem(db, 'dne:' + email, 600e3) >= 10) {
    throw new Loi('Đăng nhập sai quá nhiều lần. Vui lòng thử lại sau 10 phút.', 429);
  }
  const tk = await db.prepare('SELECT id, mat_khau FROM tai_khoan WHERE email = ?').bind(email).first();
  if (!tk || !(await dungMatKhau(b.matKhau || '', tk.mat_khau))) {
    await tangDem(db, 'dn:' + ip(req), 600e3);
    await tangDem(db, 'dne:' + email, 600e3);
    throw new Loi(LOI, 401);
  }
  const ds = await dsKhongGianCua(db, tk.id);
  if (!ds.length) throw new Loi('Tài khoản đang bị khóa hoặc chưa thuộc trung tâm nào. Liên hệ người quản trị.', 403);
  return json({ ok: true }, 200, { 'Set-Cookie': await taoPhien(db, url, tk.id, ds[0].id) });
}

async function dangXuat(req, db, url) {
  const token = docCookie(req);
  if (token) await db.prepare('DELETE FROM phien WHERE bam_token = ?').bind(await sha256Hex(token)).run();
  return json({ ok: true }, 200, { 'Set-Cookie': cookie(url, '', 0) });
}

async function chonKhongGian(req, db, b) {
  const nd = await docPhien(req, db);
  if (!nd) throw new Loi('PHIEN_HET_HAN', 401);
  const ds = await dsKhongGianCua(db, nd.tkId);
  if (!ds.some((x) => x.id === b.kg)) throw new Loi('Không có quyền vào không gian này.', 403);
  await db.prepare('UPDATE phien SET kg = ? WHERE bam_token = ?').bind(b.kg, nd.bamToken).run();
  return json({ ok: true });
}

/* =====================================================================
 * PHỤ HUYNH TRA CỨU
 * ===================================================================== */

const LOI_SAI_MA = 'Mã tra cứu không đúng. Vui lòng kiểm tra lại mã giáo viên đã gửi.';

async function timHocSinhTheoMa(req, db, maNhap) {
  if (await docDem(db, 'tc:' + ip(req), 600e3) >= 20 || await docDem(db, 'tc*', 60e3) >= 300) {
    throw new Loi('Tạm khóa do có quá nhiều lần nhập sai. Vui lòng thử lại sau ít phút.', 429);
  }
  const ma = L.chuanHoaMa_(maNhap);
  const hs = ma.length === L.CAU_HINH.DO_DAI_MA
    ? await db.prepare('SELECT h.id, h.ho_ten, h.kg, k.ten AS ten_kg, k.cai_dat FROM hoc_sinh h JOIN khong_gian k ON k.id = h.kg WHERE h.ma_tra_cuu = ?')
      .bind(L.hienThiMa_(ma)).first()
    : null;
  if (!hs) {
    await tangDem(db, 'tc:' + ip(req), 600e3);
    await tangDem(db, 'tc*', 60e3);
    return null;
  }
  return hs;
}

async function traCuu(req, db, b) {
  const hs = await timHocSinhTheoMa(req, db, b.ma);
  if (!hs) return json({ ok: false, loi: LOI_SAI_MA });
  const [nhom, phieu] = await db.batch([
    db.prepare('SELECT l.ten FROM hoc_sinh_lop hl JOIN lop l ON l.id = hl.lop WHERE hl.hoc_sinh = ? ORDER BY hl.thu_tu, l.ten').bind(hs.id),
    db.prepare(`SELECT p.id, p.tong_diem, p.diem_toi_da, lt.bai_thi, lt.lan, lt.ngay_thi, l.ten AS nhom,
        (SELECT AVG(CAST(q.tong_diem AS REAL) * 10.0 / CAST(q.diem_toi_da AS REAL)) FROM phieu q
          WHERE q.lan_thi = p.lan_thi AND q.tong_diem <> '' AND CAST(q.diem_toi_da AS REAL) > 0) AS tb_lop
        FROM phieu p JOIN lan_thi lt ON lt.id = p.lan_thi JOIN lop l ON l.id = lt.lop
        WHERE p.hoc_sinh = ? AND lt.cong_bo = 1 ORDER BY lt.thu_tu, lt.lan`).bind(hs.id)
  ]);
  return json({
    ok: true,
    trungTam: hs.ten_kg,
    hocSinh: { hoTen: hs.ho_ten, nhom: nhom.results.map((x) => x.ten) },
    phieu: phieu.results.map((x) => ({ maPhieu: x.id, baiThi: x.bai_thi, lan: x.lan, nhom: x.nhom, ngayThi: x.ngay_thi, tongDiem: x.tong_diem, diemToiDa: x.diem_toi_da,
      tbLop: x.tb_lop == null ? null : Math.round(x.tb_lop * 100) / 100 }))
  });
}

async function layPhieu(req, db, b) {
  const hs = await timHocSinhTheoMa(req, db, b.ma);
  if (!hs) return json({ ok: false, loi: LOI_SAI_MA });
  const p = await db.prepare(`SELECT p.du_lieu FROM phieu p JOIN lan_thi lt ON lt.id = p.lan_thi
      WHERE p.id = ? AND p.hoc_sinh = ? AND lt.cong_bo = 1`).bind(String(b.maPhieu || ''), hs.id).first();
  if (!p) return json({ ok: false, loi: 'Không tìm thấy phiếu kết quả.' });
  const d = JSON.parse(p.du_lieu);
  const logoKg = JSON.parse(hs.cai_dat || '{}').logo || '';
  await ganHtmlMau(db, hs.kg, d, logoKg);
  return json({ ok: true, d, logo: logoKg });
}

/* =====================================================================
 * NGỮ CẢNH GIÁO VIÊN: dữ liệu của không gian + phân quyền theo lớp
 * ===================================================================== */

class NguCanh {
  constructor(db, nd, url) { this.db = db; this.nd = nd; this.kg = nd.kg; this.url = url; this.bo = {}; }

  async napLop() {
    this.lop = (await this.db.prepare('SELECT id, ten, khoa, mon, ngay_tao FROM lop WHERE kg = ? ORDER BY ten').bind(this.kg).all()).results;
    return this.lop;
  }
  lopTheoTen(ten) { const k = L.khongDau_(ten); return this.lop.find((l) => l.khoa === k) || null; }
  lopTheoId(id) { return this.lop.find((l) => l.id === id) || null; }
  get tatCaLop() { return this.nd.lop === '*'; }
  duocLopId(id) { return this.tatCaLop || this.nd.lop.includes(id); }
  /** Người dùng phụ trách lớp này (lớp chưa tồn tại: chỉ ai có quyền mọi lớp). */
  duocLop(ten) { const l = this.lopTheoTen(ten); return l ? this.duocLopId(l.id) : this.tatCaLop; }
  kiemTraLop(ten) { if (!this.duocLop(ten)) throw new Loi('Bạn không phụ trách lớp "' + ten + '".', 403); }
  duocHocSinh(h) { return this.tatCaLop || h.nhomId.some((id) => this.duocLopId(id)); }
  /** Cấu trúc đề quản trị tự tạo của không gian (đọc 1 lần mỗi yêu cầu). */
  async cauTrucRieng() {
    if (!this._ctRieng) {
      const r = (await this.db.prepare('SELECT id, mon, ten, du_lieu, ngay_tao FROM cau_truc WHERE kg = ? ORDER BY mon, ten').bind(this.kg).all()).results;
      this._ctRieng = r.map((x) => Object.assign({}, JSON.parse(x.du_lieu), { id: x.id, mon: x.mon, ten: x.ten, ngayTao: x.ngay_tao }));
    }
    return this._ctRieng;
  }
  yeuCauQuanTri() { if (!this.nd.quanTri) throw new Loi('Chỉ chủ / quản trị mới làm được thao tác này.', 403); }

  async hocSinh() {
    if (this.bo.hs) return this.bo.hs;
    const [hs, hl] = await this.db.batch([
      this.db.prepare('SELECT id, ma_hs, ho_ten, ngay_sinh, sdt, ghi_chu, ma_tra_cuu, sbd, ngay_tao FROM hoc_sinh WHERE kg = ?').bind(this.kg),
      this.db.prepare('SELECT hl.hoc_sinh, hl.lop FROM hoc_sinh_lop hl JOIN hoc_sinh h ON h.id = hl.hoc_sinh WHERE h.kg = ? ORDER BY hl.thu_tu').bind(this.kg)
    ]);
    const theoHs = {};
    hl.results.forEach((x) => { (theoHs[x.hoc_sinh] = theoHs[x.hoc_sinh] || []).push(x.lop); });
    this.bo.hs = hs.results.map((r) => {
      const nhomId = (theoHs[r.id] || []).filter((id) => this.lopTheoId(id));
      const nhom = nhomId.map((id) => this.lopTheoId(id).ten);
      return { id: r.id, maHs: r.ma_hs, hoTen: r.ho_ten, ngaySinh: r.ngay_sinh, sdt: r.sdt, ghiChu: r.ghi_chu, maTraCuu: r.ma_tra_cuu, sbd: r.sbd || '',
        ngayTao: r.ngay_tao, nhomId, nhom, lop: nhom.join('; ') };
    }).sort((a, b) => a.maHs.localeCompare(b.maHs, 'vi', { numeric: true }));
    return this.bo.hs;
  }
  xoaBoNho() { this.bo = {}; }

  /** Lấy id lớp theo tên; lớp chưa có -> tạo (chỉ người có quyền mọi lớp). */
  async idLop(dsTen) {
    const ids = [], moi = [];
    for (const ten of dsTen) {
      let l = this.lopTheoTen(ten);
      if (!l) { // lớp mới: ai cũng tạo được (như nút "+ Lớp mới"); giáo viên thường -> tự giao lớp cho mình
        l = { id: taoId(), kg: this.kg, ten: ten.replace(/[;,]/g, ' ').replace(/\s+/g, ' ').trim(), khoa: L.khongDau_(ten), ngay_tao: ngayVN() };
        this.lop.push(l);
        moi.push([l.id, this.kg, l.ten, l.khoa, l.ngay_tao]);
      } else if (!this.duocLopId(l.id)) throw new Loi('Bạn không phụ trách lớp "' + ten + '".', 403);
      ids.push(l.id);
    }
    const lenh = lenhChenNhieu(this.db, 'lop', ['id', 'kg', 'ten', 'khoa', 'ngay_tao'], moi);
    if (moi.length && !this.tatCaLop) {
      this.nd.lop = [...this.nd.lop, ...moi.map((x) => x[0])];
      lenh.push(this.db.prepare('UPDATE thanh_vien SET lop = ? WHERE kg = ? AND tai_khoan = ?').bind(JSON.stringify(this.nd.lop), this.kg, this.nd.tkId));
    }
    await chay(this.db, lenh);
    return ids;
  }

  /** Đặt lại danh sách lớp cho nhiều học sinh: { hocSinhId: [lopId…] } */
  async datLop(theoHs) {
    const ids = Object.keys(theoHs);
    if (!ids.length) return;
    const dong = [];
    ids.forEach((h) => theoHs[h].forEach((l, i) => dong.push([h, l, i])));
    await chay(this.db, [...lenhXoaTheo(this.db, 'hoc_sinh_lop', 'hoc_sinh', ids), ...lenhChenNhieu(this.db, 'hoc_sinh_lop', ['hoc_sinh', 'lop', 'thu_tu'], dong, 'INSERT OR IGNORE')]);
    this.bo.hs = null;
  }

  /** Thêm học sinh mới. ds = [{hoTen, nhomId, ngaySinh, sdt, ghiChu, maHs?}] -> trả về Mã HS theo thứ tự. */
  async themHocSinh(ds) {
    if (!ds.length) return [];
    const co = await this.hocSinh();
    let lonNhat = 0;
    const daCoMa = new Set(co.map((h) => h.maHs));
    co.forEach((h) => { const m = /(\d+)$/.exec(h.maHs); if (m) lonNhat = Math.max(lonNhat, Number(m[1])); });
    // Mã tra cứu duy nhất trên toàn hệ thống
    const ma = ds.map(() => L.hienThiMa_(maNgauNhien()));
    for (let i = 0; i < ma.length; i += 99) {
      const trung = (await this.db.prepare(`SELECT ma_tra_cuu FROM hoc_sinh WHERE ma_tra_cuu IN (${ma.slice(i, i + 99).map(() => '?').join(',')})`)
        .bind(...ma.slice(i, i + 99)).all()).results;
      if (trung.length) throw new Loi('Trùng mã tra cứu (rất hiếm), vui lòng thử lại.', 409);
    }
    const homNay = ngayVN(), dongHs = [], dongLop = [], maHsMoi = [];
    const daCoSbd = new Set(co.map((h) => h.sbd).filter(Boolean));
    ds.forEach((h, i) => {
      let sbd = L.chuanHoaSbd_(h.sbd);
      if (!L.sbdHopLe_(sbd) || daCoSbd.has(sbd)) sbd = ''; else daCoSbd.add(sbd);
      let maHs = L.chuoi_(h.maHs);
      if (!maHs || daCoMa.has(maHs)) { do { maHs = 'HS' + String(++lonNhat).padStart(4, '0'); } while (daCoMa.has(maHs)); }
      daCoMa.add(maHs);
      const id = taoId();
      dongHs.push([id, this.kg, maHs, h.hoTen, L.chuoi_(h.ngaySinh), L.chuoi_(h.sdt), L.chuoi_(h.ghiChu), ma[i], sbd, homNay]);
      (h.nhomId || []).forEach((l, k) => dongLop.push([id, l, k]));
      maHsMoi.push(maHs);
    });
    await chay(this.db, [
      ...lenhChenNhieu(this.db, 'hoc_sinh', ['id', 'kg', 'ma_hs', 'ho_ten', 'ngay_sinh', 'sdt', 'ghi_chu', 'ma_tra_cuu', 'sbd', 'ngay_tao'], dongHs),
      ...lenhChenNhieu(this.db, 'hoc_sinh_lop', ['hoc_sinh', 'lop', 'thu_tu'], dongLop, 'INSERT OR IGNORE')
    ]);
    this.bo.hs = null;
    return maHsMoi;
  }

  async lanThi() {
    if (this.bo.lt) return this.bo.lt;
    this.bo.lt = (await this.db.prepare('SELECT rowid AS stt_tao, * FROM lan_thi WHERE kg = ?').bind(this.kg).all()).results.map((r) => ({
      sttTao: r.stt_tao, // thứ tự ghi (tăng dần theo thời gian tạo) — để sắp xếp mới nhất trước
      maDot: r.id, lopId: r.lop, nhom: (this.lopTheoId(r.lop) || {}).ten || '', baiThi: r.bai_thi, lan: r.lan, ngayThi: r.ngay_thi, moTa: r.mo_ta || '',
      thuTu: r.thu_tu, congBo: !!r.cong_bo, ngayTao: r.ngay_tao, cauTruc: r.cau_truc || '', mauPhieu: r.mau_phieu || ''
    }));
    return this.bo.lt;
  }
}

async function rpc(req, env, url, b) {
  const nd = await docPhien(req, env.DB);
  if (!nd || !nd.kg) throw new Loi('PHIEN_HET_HAN', 401);
  const ham = HAM[b.ham];
  if (!ham) throw new Loi('Không có chức năng này.', 404);
  const c = new NguCanh(env.DB, nd, url);
  await c.napLop();
  const kq = await ham(c, ...(Array.isArray(b.thamSo) ? b.thamSo : []));
  return json(kq === undefined ? null : kq);
}

/* =====================================================================
 * CHỨC NĂNG CỦA GIÁO VIÊN (gọi qua /api/rpc)
 * ===================================================================== */

const HAM = {
  async gvTaiDuLieu(c) {
    const nd = c.nd;
    const hs = await c.hocSinh(), lt = await c.lanThi();
    const mau = (await c.db.prepare('SELECT id, ten, truong, ten_tep, ngay_tao FROM mau_phieu WHERE kg = ? ORDER BY ngay_tao DESC, ten').bind(c.kg).all()).results;
    const phieu = (await c.db.prepare('SELECT lan_thi, hoc_sinh, tong_diem, diem_toi_da FROM phieu WHERE kg = ?').bind(c.kg).all()).results;
    const dem = {};
    phieu.forEach((p) => { dem[p.lan_thi] = (dem[p.lan_thi] || 0) + 1; });
    const hocSinh = hs.filter((h) => c.duocHocSinh(h)).map((h) => {
      const o = { maHs: h.maHs, hoTen: h.hoTen, lop: h.lop, nhom: h.nhom, ngaySinh: h.ngaySinh, sdt: h.sdt, ghiChu: h.ghiChu, maTraCuu: h.maTraCuu, sbd: h.sbd, ngayTao: h.ngayTao };
      if (!c.tatCaLop) { o.nhom = h.nhom.filter((n) => c.duocLop(n)); o.nhomKhac = h.nhom.length - o.nhom.length; o.lop = o.nhom.join('; '); }
      return o;
    });
    const dot = lt.filter((d) => c.duocLopId(d.lopId)).map((d) => ({ ...d, soPhieu: dem[d.maDot] || 0, thuMuc: '' }));
    const coDot = new Set(dot.map((d) => d.maDot));
    const maHsTheoId = {};
    hs.forEach((h) => { maHsTheoId[h.id] = h.maHs; });
    const origin = c.url.origin;
    return {
      toi: { ten: nd.email, hoTen: nd.hoTen, quanTri: nd.quanTri, coPhien: true, vaiTro: VAI_TRO[nd.vaiTro],
        lop: c.tatCaLop ? '*' : nd.lop.map((id) => (c.lopTheoId(id) || {}).ten).filter(Boolean), khongGian: { id: c.kg, ten: nd.tenKg } },
      hocSinh,
      dot,
      diem: phieu.filter((p) => coDot.has(p.lan_thi)).map((p) => [p.lan_thi, maHsTheoId[p.hoc_sinh], p.tong_diem, p.diem_toi_da]),
      nhom: c.lop.filter((l) => c.duocLopId(l.id)).map((l) => l.ten),
      monLop: Object.fromEntries(c.lop.filter((l) => c.duocLopId(l.id)).map((l) => [l.ten, l.mon || ''])),
      dsMon: L.DS_MON,
      khoiPhieu: KP.CAC_KHOI,
      mauPhieu: mau.map((m) => ({ id: m.id, ten: m.ten, soTruong: JSON.parse(m.truong).length, tenTep: m.ten_tep, ngayTao: m.ngay_tao,
        soLanDung: lt.filter((d) => d.mauPhieu === m.id).length })),
      cauTrucDe: L.CAU_TRUC_CO_SAN.map((ct) => Object.assign({ coSan: true }, ct)).concat(await c.cauTrucRieng()).map((ct) => ({
        id: ct.id, mon: ct.mon, ten: ct.ten, moTa: L.moTaCauTruc(ct), coSan: !!ct.coSan, ngayTao: ct.ngayTao || '',
        soLanDung: ct.coSan ? 0 : lt.filter((d) => d.cauTruc === ct.id).length,
        phan: ct.phan.map((p) => ({ ma: p.ma, ten: p.ten, dang: p.dang, soCau: p.soCau, diemMoiCau: p.diemMoiCau, phuongAn: p.phuongAn, soY: p.soY, bangDiem: p.bangDiem })) })),
      tatCaNhom: nd.quanTri ? c.lop.map((l) => l.ten) : [],
      taiKhoan: nd.quanTri ? await dsThanhVien(c) : [],
      caiDat: { tenTrungTam: nd.tenKg, khauHieu: nd.caiDat.khauHieu || '', logo: nd.caiDat.logo || '' },
      linkTraCuu: origin + '/',
      linkGiaoVien: origin + '/gv'
    };
  },

  async gvLuuCaiDat(c, cd) {
    c.yeuCauQuanTri();
    const ten = L.chuoi_(cd && cd.tenTrungTam).replace(/\s+/g, ' ');
    if (!ten) throw new Loi('Vui lòng nhập tên trung tâm / lớp học.');
    const logo = String(cd.logo || '');
    if (logo && (!/^data:image\/(png|jpeg|webp);base64,/.test(logo) || logo.length > 200000)) throw new Loi('Logo phải là ảnh PNG/JPG, dung lượng nhỏ (dưới khoảng 150 KB).');
    const caiDat = { ...c.nd.caiDat, khauHieu: L.chuoi_(cd.khauHieu), logo };
    await c.db.batch([
      c.db.prepare('UPDATE khong_gian SET ten = ?, cai_dat = ? WHERE id = ?').bind(ten, JSON.stringify(caiDat), c.kg),
      // phiếu đã tạo (kể cả đã công bố) cũng đổi tên trung tâm / khẩu hiệu theo
      c.db.prepare("UPDATE phieu SET du_lieu = json_set(du_lieu, '$.trungTam', ?, '$.khauHieu', ?) WHERE kg = ?").bind(ten, caiDat.khauHieu, c.kg),
    ]);
    c.nd.tenKg = ten; c.nd.caiDat = caiDat;
    return HAM.gvTaiDuLieu(c);
  },

  /* ---------- học sinh ---------- */

  async gvLuuHocSinh(c, hs) {
    hs = hs || {};
    const hoTen = L.chuoi_(hs.hoTen).replace(/\s+/g, ' ');
    if (!hoTen) throw new Loi('Vui lòng nhập họ tên học sinh.');
    const nhomGui = L.tachNhom_(hs.lop);
    const idGui = await c.idLop(nhomGui);
    const ds = await c.hocSinh();
    const cu = hs.maHs ? ds.find((h) => h.maHs === hs.maHs) : null;
    if (hs.maHs && (!cu || !c.duocHocSinh(cu))) throw new Loi('Không tìm thấy học sinh ' + hs.maHs + '.');
    if (!cu && !idGui.length && !c.tatCaLop) throw new Loi('Vui lòng chọn lớp cho học sinh.');
    const sbd = kiemTraSbd(hs.sbd, ds, cu);
    if (cu) {
      const giuLai = cu.nhomId.filter((id) => !c.duocLopId(id)); // lớp do giáo viên khác phụ trách: giữ nguyên
      await c.db.prepare('UPDATE hoc_sinh SET ho_ten = ?, ngay_sinh = ?, sdt = ?, ghi_chu = ?, sbd = ? WHERE id = ?')
        .bind(hoTen, L.chuoi_(hs.ngaySinh), L.chuoi_(hs.sdt), L.chuoi_(hs.ghiChu), sbd, cu.id).run();
      await c.datLop({ [cu.id]: [...giuLai, ...idGui.filter((x) => !giuLai.includes(x))] });
    } else {
      await c.themHocSinh([{ hoTen, nhomId: idGui, ngaySinh: hs.ngaySinh, sdt: hs.sdt, ghiChu: hs.ghiChu, sbd }]);
    }
    return HAM.gvTaiDuLieu(c);
  },

  /** Thêm nhiều (dán từ Excel / file danh sách). Trùng tên với học sinh lớp khác -> hỏi giáo viên (không tự đoán). */
  async gvThemNhieuHocSinh(c, bang, quyetDinh, nhomMacDinh) {
    quyetDinh = quyetDinh || {};
    bang = (bang || []).map((r) => (r || []).map(L.chuoi_));
    let cc = { ten: 0, lop: 1, sdt: 2, ngaySinh: 3, ghiChu: -1, sbd: -1 }, batDau = 0;
    for (let i = 0; i < Math.min(15, bang.length); i++) {
      const k = bang[i].map(L.khongDau_);
      const cTen = L.timChiSo_(k, ['hoten', 'hovaten', 'tenhocsinh', 'hotenhocsinh']);
      if (cTen >= 0) {
        cc = { ten: cTen, lop: L.timChiSo_(k, ['nhomlop', 'nhom', 'lop', 'loptoan', 'lophoc']), sdt: L.timChiSo_(k, ['sdtphuhuynh', 'sdt', 'sodienthoai', 'dienthoai', 'sdtph']),
          ngaySinh: L.timChiSo_(k, ['ngaysinh']), ghiChu: L.timChiSo_(k, ['ghichu']), sbd: L.timChiSo_(k, ['sobaodanh', 'sbd']) };
        batDau = i + 1;
        break;
      }
    }
    const o = (r, j) => (j >= 0 ? (r[j] || '').trim() : '');
    const ds = await c.hocSinh();
    const them = [], capNhat = [], canXacNhan = [], boSung = {};
    let gop = 0, boQua = 0;
    const theoSbd = {}, sbdTrongFile = {};
    ds.forEach((h) => { if (h.sbd) theoSbd[h.sbd] = h; });
    // em đã có: chỉ điền các thông tin còn trống (SBD, ngày sinh, SĐT) — không ghi đè
    const ghiBoSung = (h, moi) => {
      const x = boSung[h.id] || {};
      if (!h.sbd && moi.sbd && !theoSbd[moi.sbd]) { x.sbd = moi.sbd; theoSbd[moi.sbd] = h; }
      if (!h.ngaySinh && moi.ngaySinh) x.ngaySinh = moi.ngaySinh;
      if (!h.sdt && moi.sdt) x.sdt = moi.sdt;
      if (Object.keys(x).length) boSung[h.id] = x;
    };
    for (let j = 0; j < bang.length - batDau; j++) {
      const r = bang[batDau + j], dong = batDau + j;
      const ten = o(r, cc.ten).replace(/\s+/g, ' ');
      if (!ten) continue;
      let nhom = L.tachNhom_(o(r, cc.lop));
      if (!nhom.length && nhomMacDinh) nhom = [L.chuoi_(nhomMacDinh)];
      if (!nhom.length && !c.tatCaLop) throw new Loi('Dòng "' + ten + '" chưa có lớp. Hãy chọn lớp trước khi thêm.');
      nhom.forEach((n) => c.kiemTraLop(n));
      const sdt = o(r, cc.sdt);
      const sbdGoc = o(r, cc.sbd), sbd = L.chuanHoaSbd_(sbdGoc);
      if (sbdGoc && !L.sbdHopLe_(sbd)) throw new Loi('Dòng "' + ten + '": số báo danh "' + sbdGoc + '" chỉ gồm 4–12 chữ số (thường 8 số).');
      if (sbd && sbdTrongFile[sbd]) throw new Loi('Số báo danh ' + sbd + ' bị trùng giữa "' + sbdTrongFile[sbd] + '" và "' + ten + '" trong file.');
      if (sbd) sbdTrongFile[sbd] = ten;
      const moi = { hoTen: ten, nhom, ngaySinh: o(r, cc.ngaySinh), sdt, ghiChu: o(r, cc.ghiChu), sbd };
      // SBD cố định cả khóa -> đúng em đã có (dù tên viết khác)
      if (sbd && theoSbd[sbd] && quyetDinh[dong] !== 'moi') {
        const x = theoSbd[sbd];
        if (!c.duocHocSinh(x) && !nhom.length) { boQua++; continue; }
        ghiBoSung(x, moi);
        if (nhom.every((n) => L.thuocNhom_(x, n))) { boQua++; continue; }
        capNhat.push({ hs: x, nhom }); gop++; continue;
      }
      const cung = ds.filter((h) => L.khongDau_(h.hoTen) === L.khongDau_(ten))
        .concat(them.filter((d) => L.khongDau_(d.hoTen) === L.khongDau_(ten)).map((d) => ({ moiThem: d, hoTen: d.hoTen, nhom: d.nhom, sdt: d.sdt })));
      const qd = quyetDinh[dong];
      let chon = null;
      if (qd === 'boqua') { boQua++; continue; }
      if (qd === 'moi' || !cung.length) { them.push(moi); continue; }
      if (qd) chon = ds.find((h) => h.maHs === qd) || null;
      if (!chon && nhom.length) {
        const daTrongLop = cung.filter((h) => !h.moiThem && nhom.every((n) => L.thuocNhom_(h, n)));
        if (daTrongLop.length) { if (daTrongLop.length === 1) ghiBoSung(daTrongLop[0], moi); boQua++; continue; }
      }
      if (!chon && sdt) {
        const theoSdt = cung.filter((h) => L.chuanHoaSdt_(h.sdt) && L.chuanHoaSdt_(h.sdt) === L.chuanHoaSdt_(sdt));
        if (theoSdt.length === 1) chon = theoSdt[0];
      }
      if (!chon) {
        canXacNhan.push({ dong, hoTen: ten, nhom: L.noiNhom_(nhom), sdt,
          ungVien: cung.filter((h) => h.maHs).map((h) => ({ maHs: h.maHs, hoTen: h.hoTen, nhom: L.noiNhom_(h.nhom), sdt: c.duocHocSinh(h) ? h.sdt : '' })) });
        continue;
      }
      if (chon.moiThem) { chon.moiThem.nhom = L.tachNhom_(chon.moiThem.nhom.concat(nhom).join(';')); gop++; continue; }
      ghiBoSung(chon, moi);
      capNhat.push({ hs: chon, nhom });
      gop++;
    }
    if (canXacNhan.length) return { canXacNhan };
    const idBoSung = Object.keys(boSung);
    if (idBoSung.length) {
      await chay(c.db, idBoSung.map((id) => {
        const x = boSung[id], cot = Object.keys(x);
        const ten = { sbd: 'sbd', ngaySinh: 'ngay_sinh', sdt: 'sdt' };
        return c.db.prepare(`UPDATE hoc_sinh SET ${cot.map((k) => ten[k] + ' = ?').join(', ')} WHERE id = ? AND kg = ?`).bind(...cot.map((k) => x[k]), id, c.kg);
      }));
      c.xoaBoNho();
    }
    const theoHs = {};
    for (const x of capNhat) {
      const ids = await c.idLop(x.nhom);
      theoHs[x.hs.id] = [...(theoHs[x.hs.id] || x.hs.nhomId), ...ids].filter((v, i, a) => a.indexOf(v) === i);
    }
    await c.datLop(theoHs);
    const moiDs = [];
    for (const d of them) moiDs.push({ ...d, nhomId: await c.idLop(d.nhom) });
    await c.themHocSinh(moiDs);
    const kq = await HAM.gvTaiDuLieu(c);
    kq.thongBao = 'Đã thêm ' + them.length + ' học sinh mới' + (gop ? ', thêm lớp cho ' + gop + ' em đã có' : '') + (boQua ? ', ' + boQua + ' em đã có trong lớp' : '') +
      (idBoSung.length ? ', bổ sung SBD / ngày sinh / SĐT cho ' + idBoSung.length + ' em' : '') + '.';
    return kq;
  },

  async gvXoaHocSinh(c, maHs) {
    const hs = (await c.hocSinh()).find((h) => h.maHs === maHs);
    if (!hs || !c.duocHocSinh(hs)) throw new Loi('Không tìm thấy học sinh.');
    const conLai = hs.nhomId.filter((id) => !c.duocLopId(id));
    // Em còn học lớp của giáo viên khác -> chỉ bỏ khỏi lớp của mình, giữ mã tra cứu và phiếu
    if (conLai.length) await c.datLop({ [hs.id]: conLai });
    else await c.db.prepare('DELETE FROM hoc_sinh WHERE id = ? AND kg = ?').bind(hs.id, c.kg).run();
    c.xoaBoNho();
    return HAM.gvTaiDuLieu(c);
  },

  async gvCapLaiMa(c, maHs) {
    const hs = (await c.hocSinh()).find((h) => h.maHs === maHs);
    if (!hs || !c.duocHocSinh(hs)) throw new Loi('Không tìm thấy học sinh.');
    await c.db.prepare('UPDATE hoc_sinh SET ma_tra_cuu = ? WHERE id = ?').bind(L.hienThiMa_(maNgauNhien()), hs.id).run();
    c.xoaBoNho();
    return HAM.gvTaiDuLieu(c);
  },

  /** hanhDong: 'them' | 'bo' | 'chuyen' */
  async gvCapNhatNhom(c, dsMaHs, nhom, hanhDong) {
    nhom = L.chuoi_(nhom);
    if (!nhom) throw new Loi('Vui lòng nhập tên lớp.');
    const [idNhom] = await c.idLop([nhom]);
    const can = new Set(dsMaHs || []);
    const theoHs = {};
    let so = 0;
    (await c.hocSinh()).forEach((h) => {
      if (!can.has(h.maHs) || !c.duocHocSinh(h)) return;
      theoHs[h.id] = hanhDong === 'chuyen' ? [...h.nhomId.filter((id) => !c.duocLopId(id)), idNhom]
        : hanhDong === 'bo' ? h.nhomId.filter((id) => id !== idNhom)
          : [...h.nhomId.filter((id) => id !== idNhom), idNhom];
      so++;
    });
    await c.datLop(theoHs);
    const kq = await HAM.gvTaiDuLieu(c);
    kq.thongBao = (hanhDong === 'bo' ? 'Đã bỏ ' + so + ' học sinh khỏi' : hanhDong === 'chuyen' ? 'Đã chuyển ' + so + ' học sinh sang' : 'Đã thêm ' + so + ' học sinh vào') + ' lớp "' + nhom + '".';
    return kq;
  },

  async gvDoiTenNhom(c, cu, moi) {
    cu = L.chuoi_(cu); moi = L.chuoi_(moi).replace(/[;,]/g, ' ').replace(/\s+/g, ' ').trim();
    if (!cu || !moi) throw new Loi('Thiếu tên lớp.');
    c.kiemTraLop(cu);
    const l = c.lopTheoTen(cu);
    if (!l) throw new Loi('Không tìm thấy lớp.');
    const trung = c.lopTheoTen(moi);
    if (trung && trung.id !== l.id) throw new Loi('Đã có lớp "' + moi + '".');
    await c.db.prepare('UPDATE lop SET ten = ?, khoa = ? WHERE id = ?').bind(moi, L.khongDau_(moi), l.id).run();
    await c.napLop(); c.xoaBoNho();
    const kq = await HAM.gvTaiDuLieu(c);
    kq.thongBao = 'Đã đổi tên lớp "' + cu + '" thành "' + moi + '".';
    return kq;
  },

  async gvTaoNhom(c, ten, mon) {
    ten = L.chuoi_(ten).replace(/[;,]/g, ' ').replace(/\s+/g, ' ').trim();
    mon = chuanMon(mon);
    if (!ten) throw new Loi('Vui lòng nhập tên lớp.');
    if (c.lopTheoTen(ten)) throw new Loi('Đã có lớp "' + ten + '"' + (c.duocLop(ten) ? '.' : ' (do giáo viên khác phụ trách — nhờ quản trị giao lớp này cho bạn).'));
    await taoLop(c, ten, mon); // giáo viên tự tạo lớp -> tự giao cho mình
    const kq = await HAM.gvTaiDuLieu(c);
    kq.thongBao = 'Đã tạo lớp "' + ten + '".';
    kq.nhomMoi = ten;
    return kq;
  },

  /** Đặt môn học cho lớp (gợi ý cấu trúc đề khi gửi kết quả). */
  async gvDatMonLop(c, ten, mon) {
    c.kiemTraLop(ten);
    const l = c.lopTheoTen(ten);
    if (!l) throw new Loi('Không tìm thấy lớp.');
    mon = chuanMon(mon);
    await c.db.prepare('UPDATE lop SET mon = ? WHERE id = ? AND kg = ?').bind(mon, l.id, c.kg).run();
    await c.napLop();
    const kq = await HAM.gvTaiDuLieu(c);
    kq.thongBao = mon ? 'Lớp "' + l.ten + '" học môn ' + mon + '.' : 'Đã bỏ môn học của lớp "' + l.ten + '".';
    return kq;
  },

  /** Xóa lớp: học sinh vẫn giữ (chỉ bỏ khỏi lớp); các lần thi và phiếu của lớp bị xóa. Lớp đã có kết quả thi: chỉ chủ / quản trị. */
  async gvXoaLop(c, ten) {
    ten = L.chuoi_(ten);
    c.kiemTraLop(ten);
    const l = c.lopTheoTen(ten);
    if (!l) throw new Loi('Không tìm thấy lớp.');
    const soLan = (await c.lanThi()).filter((d) => d.lopId === l.id).length;
    if (soLan && !c.nd.quanTri) throw new Loi('Lớp "' + ten + '" đã có kết quả thi — chỉ chủ / quản trị mới xóa được.', 403);
    await c.db.batch([
      c.db.prepare('DELETE FROM phieu WHERE lan_thi IN (SELECT id FROM lan_thi WHERE lop = ? AND kg = ?)').bind(l.id, c.kg),
      c.db.prepare('DELETE FROM lan_thi WHERE lop = ? AND kg = ?').bind(l.id, c.kg),
      c.db.prepare('DELETE FROM hoc_sinh_lop WHERE lop = ?').bind(l.id),
      c.db.prepare('DELETE FROM lop WHERE id = ? AND kg = ?').bind(l.id, c.kg)
    ]);
    // Bỏ lớp khỏi danh sách lớp phụ trách của các giáo viên
    const tv = (await c.db.prepare("SELECT tai_khoan, lop FROM thanh_vien WHERE kg = ? AND lop LIKE ?").bind(c.kg, '%' + l.id + '%').all()).results;
    const sua = [];
    tv.forEach((r) => {
      let ds; try { ds = JSON.parse(r.lop); } catch (e) { return; }
      if (!Array.isArray(ds) || ds.indexOf(l.id) < 0) return;
      sua.push(c.db.prepare('UPDATE thanh_vien SET lop = ? WHERE kg = ? AND tai_khoan = ?').bind(JSON.stringify(ds.filter((x) => x !== l.id)), c.kg, r.tai_khoan));
      if (r.tai_khoan === c.nd.tkId) c.nd.lop = ds.filter((x) => x !== l.id);
    });
    if (sua.length) await c.db.batch(sua);
    await c.napLop(); c.xoaBoNho();
    const kq = await HAM.gvTaiDuLieu(c);
    kq.thongBao = 'Đã xóa lớp "' + ten + '"' + (soLan ? ' và ' + soLan + ' lần thi của lớp' : '') + '. Học sinh vẫn được giữ trong danh sách học sinh.';
    return kq;
  },

  /* ---------- gửi kết quả (2 file) ---------- */

  /** Đọc link Google Sheet đã chia sẻ "Bất kỳ ai có đường liên kết" -> trả file .xlsx (base64) để trình duyệt đọc. */
  async gvDocLinkSheet(c, link) {
    const m = /\/spreadsheets\/d\/([a-zA-Z0-9_-]{20,})/.exec(String(link || ''));
    if (!m) throw new Loi('Link Google Sheet không hợp lệ.');
    const r = await fetch(`https://docs.google.com/spreadsheets/d/${m[1]}/export?format=xlsx`, { redirect: 'follow' });
    const loai = r.headers.get('content-type') || '';
    if (!r.ok || !/spreadsheetml|octet-stream/.test(loai)) throw new Loi('Không đọc được link. Hãy chia sẻ file ở chế độ "Bất kỳ ai có đường liên kết" (chỉ xem), hoặc tải file Excel lên.');
    const buf = await r.arrayBuffer();
    if (buf.byteLength > 8e6) throw new Loi('File quá lớn (tối đa 8 MB).');
    let s = '';
    const b = new Uint8Array(buf);
    for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000));
    return { xlsx: btoa(s) };
  },

  /** Bước 1: đọc 2 file, chấm thử, ghép với danh sách lớp. so = { kq: sổ kết quả, da: sổ đáp án | null } */
  /**
   * Bước 1: đọc 2 file, xác định LỚP của từng dòng (cột "Lớp" trong file) rồi ghép với học sinh của lớp đó.
   * tuyChon = { quyetDinh: {dòng: Mã HS | 'moi' | 'boqua'}, quyetDinhLop: {dòng: tên lớp}, themHsMoi }
   */
  async gvXemTruoc(c, so, tuyChon) {
    tuyChon = tuyChon || {};
    if (!so || !so.kq) return { ok: false, loi: 'Chưa có bảng kết quả học sinh.' };
    const idCauTruc = tuyChon.cauTruc || cauTrucGoiY(c, so);
    const kq = await docHaiFile(c, so, '', idCauTruc);
    if (!kq.ok) return kq;
    const mau = tuyChon.mauPhieu ? await layMauPhieu(c.db, c.kg, tuyChon.mauPhieu) : null;
    const dsHs = await c.hocSinh();
    const g = ghepNhieuLop(c, kq, dsHs, tuyChon.quyetDinh, tuyChon.quyetDinhLop, tuyChon.themHsMoi !== false);
    const gon = (x) => ({ maHs: x.maHs, hoTen: x.hoTen, sbd: x.sbd || '', nhom: L.noiNhom_(x.nhom), sdt: c.duocHocSinh(x) ? x.sdt : '' });
    let dauTien = null;
    const dsXem = kq.hocSinh.map((h, i) => {
      const r = g.dong[i], ld = g.lopDong[i], cham = L.chamBai_(kq, h);
      if (!dauTien && (r.hs || r.moi)) dauTien = { h, cham, hs: r.hs || { hoTen: h.hoTen }, nhom: ld.nhom };
      const canChon = r.canLop ? 'canLop' : r.canChon || '';
      return { chiSo: i, stt: h.stt, hoTen: h.hoTen, maHsFile: h.maHs, maDe: h.maDe, sbd: h.sbd, tongDiem: cham.diem.tong, maxTong: cham.diem.maxTong, lechDiem: cham.lechNhap || [],
        trangThai: r.loi ? 'loi' : canChon ? 'canChon' : r.boQua ? 'boqua' : r.moi ? 'moi' : 'co',
        lopFile: h.lop, nhom: ld.nhom || '', lopMoi: !!ld.lopMoi, lopDoan: !!ld.doan, goiYLop: ld.goiY || [],
        loi: r.loi || '', lyDo: canChon ? L.LY_DO_CAN_CHON[canChon] || '' : '', canChon, tuDong: !!r.tuDong,
        hs: r.hs ? gon(r.hs) : null, themVaoLop: !!r.themVaoLop, ungVien: (r.ungVien || []).map(gon) };
    });
    return {
      ok: true, tieuDe: kq.thongTin.tieuDe === 'PHIẾU KẾT QUẢ KIỂM TRA' ? '' : kq.thongTin.tieuDe, ngayThi: kq.thongTin.ngayThi,
      soCau: { I: (kq.cauHoi.I || []).length, II: (kq.cauHoi.II || []).length, III: (kq.cauHoi.III || []).length }, maDe: kq.maDe, coDapAn: !!so.da,
      cauTruc: idCauTruc, phanDe: kq.cauTruc.phan.map((p) => ({ ma: p.ma, ten: p.ten, soCau: (kq.cauHoi[p.ma] || []).length, soCauChuan: p.soCau })),
      canhBao: kq.canhBao, hocSinh: dsXem,
      nhom: g.nhom.map((x) => ({ nhom: x.nhom, lopMoi: x.lopMoi, soDong: x.soDong, siSo: x.siSo, vang: x.vang.map(gon) })),
      phieuXemTruoc: dauTien ? (() => {
        const d = duLieuPhieu(c, kq, dauTien.h, dauTien.cham, dauTien.hs, '(xem trước)', { lan: 1, ngayThi: kq.thongTin.ngayThi, lichSu: [], nhom: dauTien.nhom }, mau);
        if (mau) { d.htmlMau = KP.dungKhoi(MW.dienMau(mau.html, giaTriPhieu(d)), d); d.trangMau = mau.trang; }
        return d;
      })() : null,
      mauPhieu: mau ? { id: mau.id, ten: mau.ten, truongThieu: truongThieu(mau, kq) } : null
    };
  },

  /** Bước 2: mỗi lớp có trong file -> 1 lần thi (Lần 1 nếu bài mới của lớp, lần tiếp theo nếu lớp đã làm, hoặc ghi đè lần gần nhất). */
  async gvBatDauDot(c, so, tuyChon) {
    tuyChon = tuyChon || {};
    let baiThiGoc = L.chuoi_(tuyChon.baiThi).replace(/\s+/g, ' ');
    const ngayThi = L.chuanHoaNgay_(tuyChon.ngayThi) || ngayVN();
    if (!baiThiGoc) throw new Loi('Vui lòng nhập tên bài thi.');
    if (!so || !so.kq) return { ok: false, loi: 'Chưa có bảng kết quả học sinh.' };
    const idCauTruc = tuyChon.cauTruc || cauTrucGoiY(c, so);
    const kq = await docHaiFile(c, so, baiThiGoc, idCauTruc);
    const monDe = kq.cauTruc ? kq.cauTruc.mon : '';
    const idMau = L.chuoi_(tuyChon.mauPhieu);
    if (idMau) await layMauPhieu(c.db, c.kg, idMau); // kiểm tra mẫu tồn tại
    if (!kq.ok) return kq;
    const g = ghepNhieuLop(c, kq, await c.hocSinh(), tuyChon.quyetDinh, tuyChon.quyetDinhLop, tuyChon.themHsMoi !== false);
    const conChon = g.dong.filter((x) => x.canChon || x.canLop).length;
    if (conChon) return { ok: false, loi: 'Còn ' + conChon + ' dòng chưa xác định lớp hoặc học sinh (xem bảng ghép).' };

    // Tính hết trong bộ nhớ rồi ghi theo vài đợt gộp: số lần gọi D1 không tăng theo số lớp
    // (gói miễn phí giới hạn 50 truy vấn / lần gọi).
    const boQua = [];
    kq.hocSinh.forEach((h, i) => { const x = g.dong[i]; if (x.loi) boQua.push((h.hoTen || h.maHs) + ': ' + x.loi); });
    const lt = await c.lanThi(), homNay = ngayVN();
    const lenhLop = [], lenhCuoi = [], keHoach = [], moi = [], chiSoMoi = [];
    const lopHs = {}; // id học sinh -> danh sách id lớp sau khi thêm
    const sbdDaDung = new Set((await c.hocSinh()).map((h) => h.sbd).filter(Boolean));
    let lopToi = c.tatCaLop ? null : [...c.nd.lop];
    for (const nh of g.nhom) {
      const dongTao = nh.chiSo.filter((i) => g.dong[i].hs || g.dong[i].moi);
      if (!dongTao.length) continue; // cả lớp đều bỏ qua
      let idLop;
      if (nh.lopMoi) {
        idLop = taoId();
        lenhLop.push(c.db.prepare('INSERT INTO lop (id, kg, ten, khoa, mon, ngay_tao) VALUES (?, ?, ?, ?, ?, ?)').bind(idLop, c.kg, nh.nhom, L.khongDau_(nh.nhom), monDe, homNay));
        if (lopToi) lopToi.push(idLop); // giáo viên tự tạo lớp -> tự giao cho mình
      } else {
        const l = c.lopTheoTen(nh.nhom);
        idLop = l.id;
        if (!l.mon && monDe) lenhCuoi.push(c.db.prepare('UPDATE lop SET mon = ? WHERE id = ? AND kg = ?').bind(monDe, idLop, c.kg)); // lớp chưa có môn -> nhận môn của đề
      }
      const cacLan = lt.filter((d) => d.lopId === idLop && L.khongDau_(d.baiThi) === L.khongDau_(baiThiGoc));
      let lan = 1, baiThi = baiThiGoc;
      if (cacLan.length) {
        const ganNhat = cacLan.reduce((a, b) => (b.lan > a.lan ? b : a));
        baiThi = ganNhat.baiThi;
        if (tuyChon.ghiDe) { lan = ganNhat.lan; lenhCuoi.push(c.db.prepare('DELETE FROM lan_thi WHERE id = ?').bind(ganNhat.maDot)); } else lan = ganNhat.lan + 1;
      }
      const maTheoDong = {};
      dongTao.forEach((i) => {
        const x = g.dong[i], h = kq.hocSinh[i];
        if (x.hs) {
          maTheoDong[i] = x.hs.maHs;
          const s = L.chuanHoaSbd_(h.sbd);
          if (!x.hs.sbd && L.sbdHopLe_(s) && !sbdDaDung.has(s)) {
            sbdDaDung.add(s); x.hs.sbd = s;
            lenhCuoi.push(c.db.prepare("UPDATE hoc_sinh SET sbd = ? WHERE id = ? AND kg = ? AND sbd = ''").bind(s, x.hs.id, c.kg));
          }
          const ds = lopHs[x.hs.id] || [...x.hs.nhomId];
          if (!ds.includes(idLop)) { ds.push(idLop); lopHs[x.hs.id] = ds; }
        } else { moi.push({ hoTen: h.hoTen, nhomId: [idLop], sdt: h.sdt, maHs: h.maHs, sbd: h.sbd }); chiSoMoi.push({ i, maTheoDong }); }
      });
      const maDot = taoId();
      lenhCuoi.push(c.db.prepare('INSERT INTO lan_thi (id, kg, lop, bai_thi, lan, ngay_thi, mo_ta, thu_tu, cong_bo, cau_truc, mau_phieu, ngay_tao) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?)')
        .bind(maDot, c.kg, idLop, baiThi, lan, ngayThi, L.chuoi_(kq.thongTin.moTa), L.soThuTuNgay_(ngayThi), idCauTruc, idMau, homNay));
      keHoach.push({ maDot, nhom: nh.nhom, lopMoi: nh.lopMoi, baiThi, lan, dongTao, maTheoDong, vang: nh.vang.map((x) => x.hoTen + ' (' + x.maHs + ')') });
    }
    if (!keHoach.length) return { ok: false, loi: 'Không có dòng nào để tạo phiếu (tất cả đều bỏ qua hoặc lỗi).' };
    // 1) lớp mới (phải có trước khi gắn học sinh vào lớp)
    if (lenhLop.length) {
      if (lopToi) { lenhLop.push(c.db.prepare('UPDATE thanh_vien SET lop = ? WHERE kg = ? AND tai_khoan = ?').bind(JSON.stringify(lopToi), c.kg, c.nd.tkId)); c.nd.lop = lopToi; }
      await chay(c.db, lenhLop);
      await c.napLop();
    }
    // 2) học sinh mới (1 lần kiểm tra mã tra cứu + 1 đợt ghi)
    (await c.themHocSinh(moi)).forEach((ma, j) => { chiSoMoi[j].maTheoDong[chiSoMoi[j].i] = ma; });
    // 3) học sinh đã có -> thêm vào lớp; ghi đè; tạo các lần thi — 1 đợt
    const ids = Object.keys(lopHs), dongLop = [];
    ids.forEach((h) => lopHs[h].forEach((l, k) => dongLop.push([h, l, k])));
    await chay(c.db, [...lenhXoaTheo(c.db, 'hoc_sinh_lop', 'hoc_sinh', ids),
      ...lenhChenNhieu(c.db, 'hoc_sinh_lop', ['hoc_sinh', 'lop', 'thu_tu'], dongLop, 'INSERT OR IGNORE'), ...lenhCuoi]);
    c.xoaBoNho(); await c.napLop();
    const dsDot = keHoach.map((k) => ({ maDot: k.maDot, nhom: k.nhom, lopMoi: k.lopMoi, baiThi: k.baiThi, lan: k.lan,
      canTao: k.dongTao.map((i) => ({ i, maHs: k.maTheoDong[i] })), vang: k.vang }));
    if (!dsDot.length) return { ok: false, loi: 'Không có dòng nào để tạo phiếu (tất cả đều bỏ qua hoặc lỗi).' };
    return { ok: true, baiThi: dsDot[0].baiThi, dsDot, boQua };
  },

  /** Bước 3: chấm và lưu phiếu cho 1 lô học sinh. */
  async gvTaoPhieuLo(c, maDot, so, dsGhep) {
    const lt = await c.lanThi();
    const dot = lt.find((d) => d.maDot === maDot);
    if (!dot) throw new Loi('Không tìm thấy lần thi.');
    if (!c.duocLopId(dot.lopId)) throw new Loi('Bạn không phụ trách lớp "' + dot.nhom + '".', 403);
    const kq = await docHaiFile(c, so, dot.baiThi, dot.cauTruc);
    if (!kq.ok) throw new Loi(kq.loi);
    const mau = dot.mauPhieu ? await layMauPhieu(c.db, c.kg, dot.mauPhieu) : null;
    const theoMa = {};
    (await c.hocSinh()).forEach((h) => { theoMa[h.maHs] = h; });
    // các lần trước của cùng bài thi trong lớp -> "so với lần trước"
    const truoc = lt.filter((d) => d.lopId === dot.lopId && d.lan < dot.lan && L.khongDau_(d.baiThi) === L.khongDau_(dot.baiThi));
    const lanTruoc = {};
    truoc.forEach((d) => { lanTruoc[d.maDot] = d; });
    const phieuTruoc = truoc.length
      ? (await c.db.prepare(`SELECT lan_thi, hoc_sinh, tong_diem FROM phieu WHERE lan_thi IN (${truoc.map(() => '?').join(',')})`).bind(...truoc.map((d) => d.maDot)).all()).results
      : [];
    const dong = [], loi = [], homNay = ngayVN();
    for (const x of dsGhep || []) {
      const h = kq.hocSinh[x.i], hs = theoMa[x.maHs];
      if (!h || !hs) { loi.push(((h && h.hoTen) || x.maHs) + ': chưa có trong danh sách học sinh'); continue; }
      const cham = L.chamBai_(kq, h);
      const lichSu = phieuTruoc.filter((p) => p.hoc_sinh === hs.id)
        .map((p) => ({ lan: lanTruoc[p.lan_thi].lan, ngayThi: lanTruoc[p.lan_thi].ngayThi, tong: p.tong_diem })).sort((a, b) => a.lan - b.lan);
      const maPhieu = maDot.slice(0, 8).toUpperCase() + '-' + hs.maHs;
      const d = duLieuPhieu(c, kq, h, cham, hs, maPhieu, { lan: dot.lan, ngayThi: dot.ngayThi, lichSu, nhom: dot.nhom }, mau);
      dong.push([taoId(), c.kg, maDot, hs.id, cham.diem.tong, cham.diem.maxTong, JSON.stringify(d), homNay]);
    }
    await chay(c.db, lenhChenNhieu(c.db, 'phieu', ['id', 'kg', 'lan_thi', 'hoc_sinh', 'tong_diem', 'diem_toi_da', 'du_lieu', 'ngay_tao'], dong, 'INSERT OR REPLACE'));
    return { xong: dong.length, loi };
  },

  async gvCongBo(c, maDot, congBo) {
    const d = (await c.lanThi()).find((x) => x.maDot === maDot);
    if (!d) throw new Loi('Không tìm thấy lần thi.');
    if (!c.duocLopId(d.lopId)) throw new Loi('Bạn không phụ trách lớp "' + d.nhom + '".', 403);
    await c.db.prepare('UPDATE lan_thi SET cong_bo = ? WHERE id = ?').bind(congBo ? 1 : 0, maDot).run();
    c.xoaBoNho();
    return HAM.gvTaiDuLieu(c);
  },

  /**
   * Sửa bài thi: tiêu đề (mọi lần của bài trong lớp; tiêu đề phiếu đang lấy theo tên bài đổi theo),
   * mô tả + ngày thi (chỉ lần này; cập nhật phiếu của lần này và bảng "các lần làm" trên phiếu các lần sau).
   */
  async gvSuaBaiThi(c, maDot, tt) {
    tt = tt || {};
    const lt = await c.lanThi();
    const d = lt.find((x) => x.maDot === maDot);
    if (!d) throw new Loi('Không tìm thấy lần thi.');
    if (!c.duocLopId(d.lopId)) throw new Loi('Bạn không phụ trách lớp "' + d.nhom + '".', 403);
    const tenMoi = L.chuoi_(tt.baiThi === undefined ? d.baiThi : tt.baiThi).replace(/\s+/g, ' ');
    if (!tenMoi) throw new Loi('Vui lòng nhập tiêu đề bài thi.');
    if (tenMoi.length > 200) throw new Loi('Tiêu đề quá dài.');
    const moTa = L.chuoi_(tt.moTa === undefined ? d.moTa : tt.moTa).replace(/\s+/g, ' ');
    if (moTa.length > 300) throw new Loi('Mô tả quá dài.');
    const ngayThi = tt.ngayThi === undefined ? d.ngayThi : L.chuanHoaNgay_(tt.ngayThi);
    const ngayHopLe = (s) => { const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(s); if (!m) return false; const dt = new Date(+m[3], +m[2] - 1, +m[1]); return dt.getDate() === +m[1] && dt.getMonth() === +m[2] - 1; };
    if (tt.ngayThi !== undefined && L.chuoi_(tt.ngayThi) && !(ngayThi && ngayHopLe(ngayThi))) throw new Loi('Ngày thi không hợp lệ.');

    // Các lần cần sửa: lần này; nếu "tất cả các lớp" -> ở mỗi lớp khác có bài này, lần tương ứng (cùng ngày thi cũ, không có thì cùng số lần)
    const muc = [d];
    let boQuaLop = 0;
    if (tt.tatCaLop) {
      const cungBai = lt.filter((x) => x.lopId !== d.lopId && L.khongDau_(x.baiThi) === L.khongDau_(d.baiThi));
      [...new Set(cungBai.map((x) => x.lopId))].forEach((lopId) => {
        if (!c.duocLopId(lopId)) { boQuaLop++; return; }
        const ds = cungBai.filter((x) => x.lopId === lopId);
        const x = ds.find((y) => y.ngayThi === d.ngayThi) || ds.find((y) => y.lan === d.lan);
        if (x) muc.push(x); else if (tenMoi !== d.baiThi) muc.push(Object.assign({}, ds[0], { chiDoiTen: true }));
      });
    }
    const lenh = [];
    for (const m of muc) {
      const cungLop = lt.filter((x) => x.lopId === m.lopId);
      const cacLan = cungLop.filter((x) => L.khongDau_(x.baiThi) === L.khongDau_(m.baiThi));
      if (tenMoi !== m.baiThi) {
        const trung = cungLop.find((x) => L.khongDau_(x.baiThi) === L.khongDau_(tenMoi) && L.khongDau_(x.baiThi) !== L.khongDau_(m.baiThi));
        if (trung) throw new Loi('Lớp "' + m.nhom + '" đã có bài thi "' + trung.baiThi + '". Đặt tên khác để không gộp nhầm 2 bài.');
        const ids = cacLan.map((x) => x.maDot), ph = ids.map(() => '?').join(',');
        const tieuDeCu = [...new Set(cacLan.map((x) => x.baiThi.toUpperCase()))];
        lenh.push(c.db.prepare(`UPDATE lan_thi SET bai_thi = ? WHERE kg = ? AND id IN (${ph})`).bind(tenMoi, c.kg, ...ids));
        // phiếu có tiêu đề = tên bài cũ (viết hoa, mặc định khi file không ghi tiêu đề) -> đổi theo
        lenh.push(c.db.prepare(`UPDATE phieu SET du_lieu = json_set(du_lieu, '$.tieuDe', ?) WHERE kg = ? AND lan_thi IN (${ph})
          AND json_extract(du_lieu, '$.tieuDe') IN (${tieuDeCu.map(() => '?').join(',')})`).bind(tenMoi.toUpperCase(), c.kg, ...ids, ...tieuDeCu));
      }
      if (!m.chiDoiTen && (moTa !== m.moTa || ngayThi !== m.ngayThi)) {
        lenh.push(c.db.prepare('UPDATE lan_thi SET mo_ta = ?, ngay_thi = ?, thu_tu = ? WHERE id = ? AND kg = ?').bind(moTa, ngayThi, L.soThuTuNgay_(ngayThi), m.maDot, c.kg));
        lenh.push(c.db.prepare("UPDATE phieu SET du_lieu = json_set(du_lieu, '$.moTa', ?, '$.ngayThi', ?) WHERE lan_thi = ? AND kg = ?").bind(moTa, ngayThi, m.maDot, c.kg));
        if (ngayThi !== m.ngayThi) { // ngày của lần này trong bảng "Kết quả các lần làm" trên phiếu các lần sau
          const sau = cacLan.filter((x) => x.lan > m.lan).map((x) => x.maDot);
          if (sau.length) {
            const ds = (await c.db.prepare(`SELECT id, du_lieu FROM phieu WHERE kg = ? AND lan_thi IN (${sau.map(() => '?').join(',')})`).bind(c.kg, ...sau).all()).results;
            ds.forEach((p) => {
              const j = JSON.parse(p.du_lieu); let doi = false;
              (j.lichSu || []).forEach((x) => { if (x.lan === m.lan) { x.ngayThi = ngayThi; doi = true; } });
              if (doi) lenh.push(c.db.prepare('UPDATE phieu SET du_lieu = ? WHERE id = ?').bind(JSON.stringify(j), p.id));
            });
          }
        }
      }
    }
    if (lenh.length) await c.db.batch(lenh);
    c.xoaBoNho();
    const kq = await HAM.gvTaiDuLieu(c);
    const soLop = new Set(muc.map((m) => m.lopId)).size;
    kq.thongBao = !lenh.length ? 'Không có gì thay đổi.'
      : 'Đã lưu thay đổi cho ' + tenMoi + (soLop > 1 ? ' ở ' + soLop + ' lớp' : ' – Lần ' + d.lan + ' · lớp ' + d.nhom) + '.' +
        (boQuaLop ? ' Bỏ qua ' + boQuaLop + ' lớp do giáo viên khác phụ trách.' : '');
    return kq;
  },

  /** Giữ tương thích: chỉ đổi tiêu đề. */
  async gvDoiTenBaiThi(c, maDot, tenMoi) {
    return HAM.gvSuaBaiThi(c, maDot, { baiThi: tenMoi });
  },

  async gvXoaDot(c, maDot) {
    const d = (await c.lanThi()).find((x) => x.maDot === maDot);
    if (!d) throw new Loi('Không tìm thấy lần thi.');
    if (!c.duocLopId(d.lopId)) throw new Loi('Bạn không phụ trách lớp "' + d.nhom + '".', 403);
    await c.db.prepare('DELETE FROM lan_thi WHERE id = ?').bind(maDot).run();
    c.xoaBoNho();
    return HAM.gvTaiDuLieu(c);
  },

  /** Danh sách phiếu của 1 lần thi (để giáo viên kiểm tra trước khi công bố). */
  async gvDsPhieuLan(c, maDot) {
    const d = (await c.lanThi()).find((x) => x.maDot === maDot);
    if (!d || !c.duocLopId(d.lopId)) throw new Loi('Không tìm thấy lần thi.');
    return (await c.db.prepare(`SELECT p.id, p.tong_diem, p.diem_toi_da, h.ma_hs, h.ho_ten, h.sbd, json_extract(p.du_lieu, '$.suaTay.luc') AS sua_luc
        FROM phieu p JOIN hoc_sinh h ON h.id = p.hoc_sinh WHERE p.lan_thi = ? ORDER BY h.ho_ten`).bind(maDot).all()).results
      .map((x) => ({ maPhieu: x.id, maHs: x.ma_hs, sbd: x.sbd || '', hoTen: x.ho_ten, tongDiem: x.tong_diem, diemToiDa: x.diem_toi_da, suaTay: x.sua_luc || '' }));
  },

  /**
   * Sửa điểm từng phần của 1 phiếu (giáo viên chấm lại / nhập nhầm). diemMoi: mảng điểm theo thứ tự các phần của phiếu.
   * Tổng điểm tự cộng; cập nhật "so với lần trước" của phiếu này và bảng "các lần làm" trên phiếu các lần sau của em đó.
   */
  async gvSuaDiem(c, maPhieu, diemMoi) {
    const p = await c.db.prepare('SELECT id, lan_thi, hoc_sinh, du_lieu FROM phieu WHERE id = ? AND kg = ?').bind(String(maPhieu || ''), c.kg).first();
    if (!p) throw new Loi('Không tìm thấy phiếu.');
    const lt = await c.lanThi();
    const dot = lt.find((x) => x.maDot === p.lan_thi);
    if (!dot || !c.duocLopId(dot.lopId)) throw new Loi('Bạn không phụ trách lớp của phiếu này.', 403);
    const d = JSON.parse(p.du_lieu), ch = d.cham;
    const phan = cacPhanCuaPhieu(ch);
    if (!Array.isArray(diemMoi) || diemMoi.length !== phan.length) throw new Loi('Số phần điểm không khớp với phiếu.');
    const so = diemMoi.map((v, i) => {
      const s = L.chuoi_(v).replace(',', '.');
      const n = Number(s);
      if (s === '' || isNaN(n) || n < 0) throw new Loi('Điểm ' + phan[i].ten + ' không hợp lệ.');
      if (phan[i].toiDa > 0 && n > phan[i].toiDa + 1e-9) throw new Loi('Điểm ' + phan[i].ten + ' tối đa ' + L.dinhDangSo_(phan[i].toiDa) + '.');
      return Math.round(n * 100) / 100;
    });
    const cu = phan.map((x) => x.diem);
    if (so.every((n, i) => Math.abs(n - cu[i]) < 1e-9)) return { ok: true, thongBao: 'Điểm không thay đổi.' };
    phan.forEach((x, i) => {
      if (ch.phan && ch.phan[i]) ch.phan[i].diem = L.dinhDangDiem_(so[i]);
      if (x.khoa) ch.diem[x.khoa] = L.dinhDangDiem_(so[i]);
    });
    const tong = so.reduce((a, b) => a + b, 0);
    ch.diem.tong = L.dinhDangDiem_(tong);
    if (d.mau && d.giaTri) { // phiếu mẫu Word: các trường lấy từ cột điểm cũng đổi theo
      const datTruong = (khoa, giaTriMoi) => (d.truongDiem && d.truongDiem[khoa] || []).forEach((t) => {
        const ten = Object.keys(d.giaTri).find((k) => MW.khoaTruong(k) === MW.khoaTruong(t)) || t;
        const cu = String(d.giaTri[ten] == null ? '' : d.giaTri[ten]);
        d.giaTri[ten] = /\.\d{2}$/.test(cu) || !cu ? L.dinhDangDiem_(giaTriMoi) : L.dinhDangSo_(giaTriMoi);
      });
      phan.forEach((x, i) => { if (x.khoa) datTruong(x.khoa, so[i]); });
      datTruong('tong', tong);
    }
    const truoc = (d.lichSu || []).length ? d.lichSu[d.lichSu.length - 1] : null;
    if (truoc) { const chenh = tong - L.soThuc_(truoc.tong, 0); d.chenhLech = (chenh > 0 ? '+' : '') + L.dinhDangDiem_(chenh); d.tangDiem = chenh > 0; d.giamDiem = chenh < 0; }
    d.suaTay = { luc: new Date().toISOString(), boi: c.nd.email, diemGoc: (d.suaTay && d.suaTay.diemGoc) || cu.map(L.dinhDangDiem_) };
    const lenh = [c.db.prepare('UPDATE phieu SET du_lieu = ?, tong_diem = ? WHERE id = ?').bind(JSON.stringify(d), ch.diem.tong, p.id)];
    // phiếu các lần sau của cùng bài, cùng lớp, cùng em: cột "Lần n" trong bảng các lần làm
    const sau = lt.filter((x) => x.lopId === dot.lopId && x.lan > dot.lan && L.khongDau_(x.baiThi) === L.khongDau_(dot.baiThi)).map((x) => x.maDot);
    if (sau.length) {
      const ds = (await c.db.prepare(`SELECT id, du_lieu FROM phieu WHERE hoc_sinh = ? AND lan_thi IN (${sau.map(() => '?').join(',')})`).bind(p.hoc_sinh, ...sau).all()).results;
      ds.forEach((q) => {
        const j = JSON.parse(q.du_lieu); let doi = false;
        (j.lichSu || []).forEach((x) => { if (x.lan === dot.lan) { x.tong = ch.diem.tong; doi = true; } });
        const ls = j.lichSu || [];
        if (doi && ls.length && ls[ls.length - 1].lan === dot.lan) {
          const chenh = L.soThuc_(j.cham.diem.tong, 0) - L.soThuc_(ch.diem.tong, 0);
          j.chenhLech = (chenh > 0 ? '+' : '') + L.dinhDangDiem_(chenh); j.tangDiem = chenh > 0; j.giamDiem = chenh < 0;
        }
        if (doi) lenh.push(c.db.prepare('UPDATE phieu SET du_lieu = ? WHERE id = ?').bind(JSON.stringify(j), q.id));
      });
    }
    await c.db.batch(lenh);
    return { ok: true, tongDiem: ch.diem.tong, diemToiDa: ch.diem.maxTong,
      thongBao: 'Đã sửa điểm của ' + d.hoTen + ': ' + L.dinhDangDiem_(cu.reduce((a, b) => a + b, 0)) + ' → ' + ch.diem.tong + '.' };
  },

  /** Các phần điểm của 1 phiếu (để sửa điểm): theo cấu trúc đề (v2) hoặc 3 phần cố định (phiếu v1). */
  async gvCacPhanDiem(c, maPhieu) {
    const p = await c.db.prepare('SELECT lan_thi, du_lieu FROM phieu WHERE id = ? AND kg = ?').bind(String(maPhieu || ''), c.kg).first();
    const dot = p && (await c.lanThi()).find((x) => x.maDot === p.lan_thi);
    if (!p || !dot || !c.duocLopId(dot.lopId)) throw new Loi('Không tìm thấy phiếu.');
    const d = JSON.parse(p.du_lieu);
    return { phan: cacPhanCuaPhieu(d.cham).map((x) => ({ ten: x.ten, diem: L.dinhDangDiem_(x.diem), toiDa: L.dinhDangSo_(x.toiDa) })),
      tong: d.cham.diem.tong, suaTay: d.suaTay || null };
  },

  async gvXemPhieu(c, maPhieu) {
    const p = await c.db.prepare('SELECT p.du_lieu, lt.lop FROM phieu p JOIN lan_thi lt ON lt.id = p.lan_thi WHERE p.id = ? AND p.kg = ?').bind(String(maPhieu), c.kg).first();
    if (!p || !c.duocLopId(p.lop)) throw new Loi('Không tìm thấy phiếu.');
    const d = JSON.parse(p.du_lieu);
    await ganHtmlMau(c.db, c.kg, d, c.nd.caiDat.logo || '');
    return { d, logo: c.nd.caiDat.logo || '' };
  },

  /* ---------- mẫu phiếu từ Word ---------- */

  /** Lưu mẫu phiếu (giao diện đã đọc file .docx thành HTML). m = { id?, ten, html, truong, trang, tenTep } */
  async gvLuuMauPhieu(c, m) {
    c.yeuCauQuanTri();
    m = m || {};
    const ten = L.chuoi_(m.ten).replace(/\s+/g, ' ');
    if (!ten) throw new Loi('Vui lòng đặt tên mẫu phiếu.');
    if (ten.length > 120) throw new Loi('Tên mẫu quá dài.');
    const html = lamSachHtml(String(m.html || ''));
    if (!html) throw new Loi('Mẫu phiếu trống.');
    if (html.length > 1500000) throw new Loi('Mẫu phiếu quá lớn (ảnh trong file Word quá nặng). Hãy nén ảnh trong Word rồi thử lại.');
    const truong = (Array.isArray(m.truong) ? m.truong : []).map((x) => L.chuoi_(x)).filter(Boolean).slice(0, 1000);
    const trang = m.trang && typeof m.trang === 'object' ? m.trang : {};
    if (m.id) {
      const r = await c.db.prepare('UPDATE mau_phieu SET ten = ?, html = ?, truong = ?, trang = ?, ten_tep = ? WHERE id = ? AND kg = ?')
        .bind(ten, html, JSON.stringify(truong), JSON.stringify(trang), L.chuoi_(m.tenTep), m.id, c.kg).run();
      if (!r.meta.changes) throw new Loi('Không tìm thấy mẫu phiếu.');
    } else {
      await c.db.prepare('INSERT INTO mau_phieu (id, kg, ten, html, truong, trang, ten_tep, ngay_tao) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
        .bind(taoId(), c.kg, ten, html, JSON.stringify(truong), JSON.stringify(trang), L.chuoi_(m.tenTep), ngayVN()).run();
    }
    const kq = await HAM.gvTaiDuLieu(c);
    kq.thongBao = 'Đã lưu mẫu phiếu "' + ten + '".';
    return kq;
  },

  async gvLayMauPhieu(c, id) {
    const m = await c.db.prepare('SELECT id, ten, html, truong, trang, ten_tep FROM mau_phieu WHERE id = ? AND kg = ?').bind(String(id || ''), c.kg).first();
    if (!m) throw new Loi('Không tìm thấy mẫu phiếu.');
    return { id: m.id, ten: m.ten, html: m.html, truong: JSON.parse(m.truong), trang: JSON.parse(m.trang), tenTep: m.ten_tep };
  },

  /** Lưu cấu trúc đề tự tạo (chỉ quản trị). Cấu trúc có sẵn không sửa được — nhân bản rồi sửa bản sao. */
  async gvLuuCauTruc(c, ct) {
    c.yeuCauQuanTri();
    ct = ct || {};
    const id = L.chuoi_(ct.id);
    if (id && L.layCauTrucCoSan(id)) throw new Loi('Cấu trúc có sẵn không sửa được — hãy nhân bản rồi sửa bản sao.');
    const ten = L.chuoi_(ct.ten).slice(0, 120), mon = L.chuoi_(ct.mon).slice(0, 40);
    const LA_MA = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];
    const so = (v) => Number(String(v == null ? '' : v).replace(',', '.'));
    const phan = (Array.isArray(ct.phan) ? ct.phan : []).slice(0, LA_MA.length).map((p, i) => {
      const dang = L.chuoi_(p.dang);
      const x = { ma: LA_MA[i], ten: L.chuoi_(p.ten).slice(0, 120) || ((L.DANG_CAU[dang] && L.DANG_CAU[dang].ten) || 'Phần ' + LA_MA[i]), dang, soCau: so(p.soCau) };
      if (dang === 'dung_sai') {
        x.soY = 4;
        const bd = (Array.isArray(p.bangDiem) ? p.bangDiem : []).map(so);
        x.bangDiem = bd.length === 5 && bd.every((v) => v >= 0) ? bd : [0, 0.1, 0.25, 0.5, 1];
        x.diemMoiCau = x.bangDiem[4];
      } else x.diemMoiCau = so(p.diemMoiCau);
      if (dang === 'trac_nghiem') x.phuongAn = /^(ABCD|ABCDE|ABC)$/.test(L.chuoi_(p.phuongAn).toUpperCase()) ? L.chuoi_(p.phuongAn).toUpperCase() : 'ABCD';
      return x;
    });
    const moi = { ten, mon, phan };
    const loi = L.kiemTraCauTruc(moi);
    if (loi.length) throw new Loi(loi.join(' '));
    const trung = (await c.cauTrucRieng()).find((x) => x.id !== id && L.khongDau_(x.ten) === L.khongDau_(ten));
    if (trung || L.CAU_TRUC_CO_SAN.some((x) => L.khongDau_(x.ten) === L.khongDau_(ten))) throw new Loi('Đã có cấu trúc đề tên "' + ten + '".');
    if (id) {
      const r = await c.db.prepare('UPDATE cau_truc SET mon = ?, ten = ?, du_lieu = ? WHERE id = ? AND kg = ?').bind(mon, ten, JSON.stringify({ phan }), id, c.kg).run();
      if (!r.meta.changes) throw new Loi('Không tìm thấy cấu trúc đề.');
    } else {
      await c.db.prepare('INSERT INTO cau_truc (id, kg, mon, ten, du_lieu, ngay_tao) VALUES (?, ?, ?, ?, ?, ?)').bind('ct-' + taoId(), c.kg, mon, ten, JSON.stringify({ phan }), ngayVN()).run();
    }
    c._ctRieng = null;
    const kq = await HAM.gvTaiDuLieu(c);
    kq.thongBao = 'Đã lưu cấu trúc đề "' + ten + '" (tổng ' + L.dinhDangSo_(L.diemToiDa(moi)) + ' điểm).';
    return kq;
  },

  async gvXoaCauTruc(c, id) {
    c.yeuCauQuanTri();
    id = L.chuoi_(id);
    if (L.layCauTrucCoSan(id)) throw new Loi('Cấu trúc có sẵn không xóa được.');
    const dung = (await c.lanThi()).filter((d) => d.cauTruc === id).length;
    if (dung) throw new Loi('Cấu trúc đề đang dùng cho ' + dung + ' lần thi — chưa xóa được (gửi lại các lần thi đó cần cấu trúc này).');
    await c.db.prepare('DELETE FROM cau_truc WHERE id = ? AND kg = ?').bind(id, c.kg).run();
    c._ctRieng = null;
    const kq = await HAM.gvTaiDuLieu(c);
    kq.thongBao = 'Đã xóa cấu trúc đề.';
    return kq;
  },

  async gvXoaMauPhieu(c, id) {
    c.yeuCauQuanTri();
    const dung = (await c.lanThi()).filter((d) => d.mauPhieu === id).length;
    if (dung) throw new Loi('Mẫu phiếu đang dùng cho ' + dung + ' lần thi — phiếu của các lần thi đó cần mẫu này để hiển thị.');
    await c.db.prepare('DELETE FROM mau_phieu WHERE id = ? AND kg = ?').bind(String(id || ''), c.kg).run();
    const kq = await HAM.gvTaiDuLieu(c);
    kq.thongBao = 'Đã xóa mẫu phiếu.';
    return kq;
  },

  /** File mẫu: bảng kết quả (điền sẵn danh sách lớp) + bảng đáp án theo mã đề. */
  async gvLayMau(c, nhom, idCauTruc) {
    nhom = L.chuoi_(nhom);
    const ct = await cauTrucTheoId(c, idCauTruc || (nhom && c.lopTheoTen(nhom) && L.cauTrucCuaMon(c.lopTheoTen(nhom).mon)) || 'thpt2025-toan');
    const tenCuoi = (s) => s.split(' ').pop();
    const theoTen = (a, b) => tenCuoi(a.hoTen).localeCompare(tenCuoi(b.hoTen), 'vi') || a.hoTen.localeCompare(b.hoTen, 'vi');
    const hs = (await c.hocSinh()).filter((h) => c.duocHocSinh(h));
    let ds = [];
    if (nhom) { // chỉ 1 lớp
      c.kiemTraLop(nhom);
      const l = c.lopTheoTen(nhom);
      ds = hs.filter((h) => l && h.nhomId.includes(l.id)).sort(theoTen).map((h) => ({ maHs: h.maHs, hoTen: h.hoTen, sbd: h.sbd, lopMau: l.ten }));
    } else { // tất cả lớp mình phụ trách: mỗi lớp 1 khối, học sinh chưa có lớp ở cuối (cột Lớp để trống)
      c.lop.filter((l) => c.duocLopId(l.id)).sort((a, b) => a.ten.localeCompare(b.ten, 'vi')).forEach((l) => {
        hs.filter((h) => h.nhomId.includes(l.id)).sort(theoTen).forEach((h) => ds.push({ maHs: h.maHs, hoTen: h.hoTen, sbd: h.sbd, lopMau: l.ten }));
      });
      hs.filter((h) => !h.nhomId.length).sort(theoTen).forEach((h) => ds.push({ maHs: h.maHs, hoTen: h.hoTen, sbd: h.sbd, lopMau: '' }));
    }
    return { ketQua: L.taoMauKetQua(ds, nhom, null, ct), dapAn: L.taoMauDapAn(ct), cauTruc: ct.id };
  },

  /** Mẫu phiếu nhập lớp (Excel): điền sẵn học sinh hiện có của lớp để bổ sung SBD / ngày sinh; thêm dòng cho em mới. */
  async gvMauNhapLop(c, nhom) {
    nhom = L.chuoi_(nhom);
    let ds = [];
    if (nhom) {
      c.kiemTraLop(nhom);
      const l = c.lopTheoTen(nhom);
      const tenCuoi = (s) => s.split(' ').pop();
      ds = (await c.hocSinh()).filter((h) => l && h.nhomId.includes(l.id))
        .sort((a, b) => tenCuoi(a.hoTen).localeCompare(tenCuoi(b.hoTen), 'vi') || a.hoTen.localeCompare(b.hoTen, 'vi'))
        .map((h) => ({ sbd: h.sbd, hoTen: h.hoTen, ngaySinh: h.ngaySinh, lop: l.ten, sdt: c.duocHocSinh(h) ? h.sdt : '' }));
    }
    return { so: L.taoMauNhapLop(ds, nhom) };
  },

  /* ---------- tài khoản trong không gian ---------- */

  /** Mời giáo viên: tạo tài khoản (mật khẩu tạm, hiện 1 lần) hoặc thêm tài khoản đã có vào không gian. */
  async gvLuuTaiKhoan(c, tk) {
    c.yeuCauQuanTri();
    tk = tk || {};
    const email = chuanEmail(tk.ten);
    if (!emailHopLe(email)) throw new Loi('Email không hợp lệ.');
    const hoTen = L.chuoi_(tk.hoTen).replace(/\s+/g, ' ');
    if (!hoTen) throw new Loi('Vui lòng nhập họ tên giáo viên.');
    const vaiTro = tk.vaiTro === 'Quản trị' ? 'quan_tri' : 'giao_vien';
    const lop = tk.lop === '*' ? '*' : JSON.stringify((tk.lop || []).map((t) => (c.lopTheoTen(t) || {}).id).filter(Boolean));
    const trangThai = tk.trangThai === 'Khóa' ? 'Khóa' : 'Hoạt động';
    const coSan = await c.db.prepare('SELECT id, ho_ten FROM tai_khoan WHERE email = ?').bind(email).first();
    const tv = coSan ? await c.db.prepare('SELECT vai_tro FROM thanh_vien WHERE kg = ? AND tai_khoan = ?').bind(c.kg, coSan.id).first() : null;
    let matKhauTam = '', thongBao;
    if (tv) {
      if (!tk.sua) throw new Loi('"' + email + '" đã có trong danh sách.');
      if (tv.vai_tro === 'chu') throw new Loi('Không sửa được tài khoản chủ không gian.');
      if (coSan.id === c.nd.tkId) throw new Loi('Không tự sửa quyền của mình được.');
      await c.db.prepare('UPDATE thanh_vien SET vai_tro = ?, lop = ?, trang_thai = ? WHERE kg = ? AND tai_khoan = ?').bind(vaiTro, lop, trangThai, c.kg, coSan.id).run();
      if (trangThai === 'Khóa') await c.db.prepare('DELETE FROM phien WHERE tai_khoan = ? AND kg = ?').bind(coSan.id, c.kg).run();
      thongBao = 'Đã lưu tài khoản ' + email + '.';
    } else {
      let tkId = coSan && coSan.id;
      if (!tkId) {
        tkId = taoId(); matKhauTam = taoMatKhauTam();
        await c.db.prepare('INSERT INTO tai_khoan (id, email, ho_ten, mat_khau, ngay_tao) VALUES (?, ?, ?, ?, ?)').bind(tkId, email, hoTen, await bamMatKhau(matKhauTam), ngayVN()).run();
      }
      await c.db.prepare('INSERT INTO thanh_vien (kg, tai_khoan, vai_tro, lop, trang_thai, ngay_tao) VALUES (?, ?, ?, ?, ?, ?)').bind(c.kg, tkId, vaiTro, lop, trangThai, ngayVN()).run();
      thongBao = coSan ? 'Đã thêm ' + email + ' (đã có tài khoản — dùng mật khẩu sẵn có).' : 'Đã tạo tài khoản ' + email + '.';
    }
    const kq = await HAM.gvTaiDuLieu(c);
    kq.thongBao = thongBao;
    if (matKhauTam) kq.matKhauTam = { ten: email, hoTen, matKhau: matKhauTam };
    return kq;
  },

  /** Đặt lại mật khẩu — chỉ cho tài khoản CHỈ thuộc không gian này (không đụng tới tài khoản dùng ở nơi khác). */
  async gvDatLaiMatKhau(c, email) {
    c.yeuCauQuanTri();
    const tk = await c.db.prepare('SELECT t.id, t.ho_ten, tv.vai_tro FROM tai_khoan t JOIN thanh_vien tv ON tv.tai_khoan = t.id AND tv.kg = ? WHERE t.email = ?')
      .bind(c.kg, chuanEmail(email)).first();
    if (!tk) throw new Loi('Không tìm thấy tài khoản.');
    if (tk.vai_tro === 'chu') throw new Loi('Không đặt lại mật khẩu của chủ không gian được.');
    const soKg = await c.db.prepare('SELECT COUNT(*) AS n FROM thanh_vien WHERE tai_khoan = ?').bind(tk.id).first();
    if (soKg.n > 1) throw new Loi('Tài khoản này còn dùng ở trung tâm khác — người dùng tự đổi mật khẩu.');
    const mk = taoMatKhauTam();
    await c.db.batch([
      c.db.prepare('UPDATE tai_khoan SET mat_khau = ? WHERE id = ?').bind(await bamMatKhau(mk), tk.id),
      c.db.prepare('DELETE FROM phien WHERE tai_khoan = ?').bind(tk.id)
    ]);
    const kq = await HAM.gvTaiDuLieu(c);
    kq.matKhauTam = { ten: chuanEmail(email), hoTen: tk.ho_ten, matKhau: mk };
    return kq;
  },

  async gvXoaTaiKhoan(c, email) {
    c.yeuCauQuanTri();
    const tk = await c.db.prepare('SELECT t.id, tv.vai_tro FROM tai_khoan t JOIN thanh_vien tv ON tv.tai_khoan = t.id AND tv.kg = ? WHERE t.email = ?')
      .bind(c.kg, chuanEmail(email)).first();
    if (!tk) throw new Loi('Không tìm thấy tài khoản.');
    if (tk.vai_tro === 'chu') throw new Loi('Không xóa được chủ không gian.');
    if (tk.id === c.nd.tkId) throw new Loi('Không thể tự xóa tài khoản đang đăng nhập.');
    await c.db.batch([
      c.db.prepare('DELETE FROM thanh_vien WHERE kg = ? AND tai_khoan = ?').bind(c.kg, tk.id),
      c.db.prepare('DELETE FROM phien WHERE tai_khoan = ? AND kg = ?').bind(tk.id, c.kg),
      // không còn thuộc không gian nào -> xóa tài khoản
      c.db.prepare('DELETE FROM tai_khoan WHERE id = ? AND NOT EXISTS (SELECT 1 FROM thanh_vien WHERE tai_khoan = ?)').bind(tk.id, tk.id)
    ]);
    return HAM.gvTaiDuLieu(c);
  },

  async gvDoiMatKhau(c, cu, moi) {
    if (String(moi || '').length < 8) throw new Loi('Mật khẩu mới tối thiểu 8 ký tự.');
    const tk = await c.db.prepare('SELECT mat_khau FROM tai_khoan WHERE id = ?').bind(c.nd.tkId).first();
    if (!tk || !(await dungMatKhau(cu || '', tk.mat_khau))) throw new Loi('Mật khẩu hiện tại không đúng.');
    await c.db.batch([
      c.db.prepare('UPDATE tai_khoan SET mat_khau = ? WHERE id = ?').bind(await bamMatKhau(String(moi)), c.nd.tkId),
      c.db.prepare('DELETE FROM phien WHERE tai_khoan = ? AND bam_token != ?').bind(c.nd.tkId, c.nd.bamToken) // đăng xuất các máy khác
    ]);
    return { ok: true };
  }
};

async function dsThanhVien(c) {
  return (await c.db.prepare(`SELECT t.email, t.ho_ten, tv.vai_tro, tv.lop, tv.trang_thai, tv.ngay_tao FROM thanh_vien tv JOIN tai_khoan t ON t.id = tv.tai_khoan
      WHERE tv.kg = ? ORDER BY tv.ngay_tao`).bind(c.kg).all()).results.map((x) => ({
    ten: x.email, hoTen: x.ho_ten, vaiTro: VAI_TRO[x.vai_tro], laChu: x.vai_tro === 'chu',
    lop: x.vai_tro !== 'giao_vien' || x.lop === '*' ? '*' : JSON.parse(x.lop || '[]').map((id) => (c.lopTheoId(id) || {}).ten).filter(Boolean),
    trangThai: x.trang_thai, ngayTao: x.ngay_tao
  }));
}

/**
 * File có học sinh của nhiều lớp (cột "Lớp"): dòng ghi lớp khác với lớp đang gửi -> mặc định bỏ qua
 * (giáo viên vẫn chọn lại được). Trả về quyết định đã bổ sung + số dòng theo từng lớp khác.
 */
/**
 * Lớp của từng dòng trong file kết quả:
 *   - cột "Lớp" có ghi -> lớp đó (chưa có thì là lớp mới, sẽ được tạo; lớp của giáo viên khác -> lỗi)
 *   - cột "Lớp" trống -> lớp của học sinh (theo Mã HS, hoặc họ tên duy nhất) nếu em chỉ học 1 lớp; còn lại giáo viên chọn
 * quyetDinhLop = { dòng: tên lớp } (giáo viên chọn / sửa lớp cho dòng).
 */
function xacDinhLop(c, kq, dsHs, quyetDinhLop) {
  quyetDinhLop = quyetDinhLop || {};
  const theoMa = {};
  dsHs.forEach((h) => { theoMa[h.maHs] = h; });
  return kq.hocSinh.map((h, i) => {
    const chon = L.chuoi_(quyetDinhLop[i]);
    const ten = (chon || L.chuoi_(h.lop)).replace(/[;,]/g, ' ').replace(/\s+/g, ' ').trim();
    if (ten) {
      const l = c.lopTheoTen(ten);
      if (l) return c.duocLopId(l.id) ? { nhom: l.ten } : { loi: 'Lớp "' + l.ten + '" do giáo viên khác phụ trách' };
      return { nhom: ten, lopMoi: true };
    }
    let hs = h.maHs ? theoMa[h.maHs] : null;
    const sbd = L.chuanHoaSbd_(h.sbd);
    if (!hs && sbd) hs = dsHs.find((x) => x.sbd === sbd) || null;
    if (!hs) {
      const cung = dsHs.filter((x) => c.duocHocSinh(x) && L.khongDau_(x.hoTen) === L.khongDau_(h.hoTen));
      if (cung.length === 1) hs = cung[0];
    }
    const goiY = hs ? hs.nhom.filter((n) => c.duocLop(n)) : [];
    if (goiY.length === 1) return { nhom: goiY[0], doan: true };
    return { canLop: true, goiY };
  });
}

/** Gom các dòng theo lớp rồi ghép học sinh trong từng lớp (ghepTheoLop_). */
function ghepNhieuLop(c, kq, dsHs, quyetDinh, quyetDinhLop, tuThemMoi) {
  quyetDinh = quyetDinh || {};
  const lopDong = xacDinhLop(c, kq, dsHs, quyetDinhLop);
  const dong = new Array(kq.hocSinh.length);
  const theoKhoa = {}, nhom = [];
  lopDong.forEach((x, i) => {
    if (x.loi) dong[i] = { loi: x.loi };
    else if (x.canLop) dong[i] = quyetDinh[i] === 'boqua' ? { boQua: true } : { canLop: true };
    else {
      const k = L.khongDau_(x.nhom);
      if (!theoKhoa[k]) { theoKhoa[k] = { nhom: x.nhom, lopMoi: !!x.lopMoi, chiSo: [] }; nhom.push(theoKhoa[k]); }
      theoKhoa[k].chiSo.push(i);
      x.nhom = theoKhoa[k].nhom; // cùng 1 lớp viết khác hoa/thường -> 1 tên
    }
  });
  nhom.forEach((gr) => {
    const qd = {};
    gr.chiSo.forEach((i, j) => { if (quyetDinh[i] !== undefined) qd[j] = quyetDinh[i]; });
    const r = L.ghepTheoLop_(gr.chiSo.map((i) => kq.hocSinh[i]), dsHs, gr.nhom, qd, tuThemMoi);
    gr.chiSo.forEach((i, j) => { dong[i] = r.dong[j]; });
    gr.soDong = gr.chiSo.length; gr.siSo = r.siSo; gr.vang = r.vang;
  });
  return { lopDong, dong, nhom };
}

/** Tạo lớp mới (giáo viên không phải quản trị: tự giao lớp cho mình). Trả về id lớp. */
async function taoLop(c, ten, mon = '') {
  const id = taoId();
  await c.db.prepare('INSERT INTO lop (id, kg, ten, khoa, mon, ngay_tao) VALUES (?, ?, ?, ?, ?, ?)').bind(id, c.kg, ten, L.khongDau_(ten), mon, ngayVN()).run();
  if (!c.tatCaLop) {
    c.nd.lop = [...c.nd.lop, id];
    await c.db.prepare('UPDATE thanh_vien SET lop = ? WHERE kg = ? AND tai_khoan = ?').bind(JSON.stringify(c.nd.lop), c.kg, c.nd.tkId).run();
  }
  await c.napLop();
  return id;
}

/** Mẫu phiếu theo id (trong không gian). */
async function layMauPhieu(db, kg, id) {
  const m = await db.prepare('SELECT id, ten, html, truong, trang FROM mau_phieu WHERE id = ? AND kg = ?').bind(String(id), kg).first();
  if (!m) throw new Loi('Không tìm thấy mẫu phiếu.');
  return { id: m.id, ten: m.ten, html: m.html, truong: JSON.parse(m.truong), trang: JSON.parse(m.trang) };
}
/** Giá trị điền vào mẫu: các trường lưu từ file + trường hệ thống (dùng khi file không có cột tương ứng). */
function giaTriPhieu(d, logo) {
  const ch = d.cham || { diem: {} };
  const heThong = { Họ_và_tên: d.hoTen, Lớp: d.lop, Số_báo_danh: d.sbd, SBD: d.sbd, Mã_đề_thi: d.maDe, Tổng_điểm: ch.diem.tong, Lần: d.lan,
    Ngày_thi: d.ngayThi, Mã_phiếu: d.maPhieu, Tên_trung_tâm: d.trungTam, Tiêu_đề: d.tieuDe, Mô_tả: d.moTa, Logo: logo || '' };
  return Object.assign(heThong, d.giaTri || {});
}
/** Phiếu dùng mẫu Word: điền mẫu thành HTML để trang phụ huynh / giáo viên hiển thị và tạo PDF. */
async function ganHtmlMau(db, kg, d, logo) {
  if (!d || !d.mau) return;
  const m = await db.prepare('SELECT html, trang FROM mau_phieu WHERE id = ? AND kg = ?').bind(d.mau, kg).first();
  if (!m) return;
  d.htmlMau = KP.dungKhoi(MW.dienMau(m.html, giaTriPhieu(d, logo)), d);
  d.trangMau = JSON.parse(m.trang || '{}');
}
/** Trường của mẫu không có cột tương ứng trong file (và không phải trường hệ thống) -> báo khi xem trước. */
function truongThieu(mau, kq) {
  const co = new Set((kq.tenWord || []).map(MW.khoaTruong));
  Object.keys(giaTriPhieu({ cham: { diem: {} } })).forEach((k) => co.add(MW.khoaTruong(k)));
  return mau.truong.filter((t) => !co.has(MW.khoaTruong(t)));
}
/** Lọc HTML mẫu phiếu: chỉ giữ thẻ / thuộc tính an toàn (mẫu do giáo viên tải lên, hiển thị cho phụ huynh). */
function lamSachHtml(html) {
  const THE = new Set(['div', 'p', 'span', 'br', 'b', 'i', 'u', 'table', 'tbody', 'thead', 'tr', 'td', 'th', 'colgroup', 'col', 'img']);
  const THUOC_TINH = new Set(['style', 'colspan', 'rowspan', 'class', 'data-truong', 'data-truoc', 'data-sau', 'data-goc', 'data-khoi', 'data-phan', 'data-dang', 'data-ten', 'data-thutu', 'data-nhan', 'src', 'alt']);
  html = html.replace(/<!--[\s\S]*?-->/g, '').replace(/<(script|style|iframe|object|embed|svg|math|template)[\s\S]*?<\/\1\s*>/gi, '');
  return html.replace(/<(\/?)([a-zA-Z0-9]+)([^>]*)>/g, (m, dong, ten, thuocTinh) => {
    ten = ten.toLowerCase();
    if (!THE.has(ten)) return '';
    if (dong) return '</' + ten + '>';
    let ra = '';
    thuocTinh.replace(/([a-zA-Z-]+)\s*=\s*"([^"]*)"/g, (_, k, v) => {
      k = k.toLowerCase();
      if (!THUOC_TINH.has(k)) return '';
      if (k === 'src' && (ten !== 'img' || !/^data:image\/(png|jpeg|gif|webp|bmp);base64,[A-Za-z0-9+/=]+$/.test(v))) return '';
      if (k === 'style' && /expression|url\s*\(|javascript:|@import|behavior/i.test(v.replace(/&[a-z#0-9]+;/gi, ''))) return '';
      if ((k === 'colspan' || k === 'rowspan') && !/^\d{1,3}$/.test(v)) return '';
      ra += ' ' + k + '="' + v.replace(/"/g, '&quot;') + '"';
      return '';
    });
    return '<' + ten + ra + '>';
  }).replace(/<(?![a-zA-Z\/])/g, '&lt;');
}

/** Danh sách phần điểm của phiếu: [{ ten, diem, toiDa, khoa: 'p1'|'p2'|'p3'|'' }] */
function cacPhanCuaPhieu(ch) {
  const khoa = ['p1', 'p2', 'p3'];
  if (Array.isArray(ch.phan) && ch.phan.length) {
    return ch.phan.map((x, i) => ({ ten: 'Phần ' + x.ma, diem: L.soThuc_(x.diem, 0), toiDa: L.soThuc_(x.toiDa, 0), khoa: khoa[i] || '' }));
  }
  const ds = [];
  [1, 2, 3].forEach((n) => {
    const toiDa = L.soThuc_(ch.diem['max' + n], 0);
    if ((ch['phan' + n] || []).length || toiDa > 0) ds.push({ ten: 'Phần ' + ['I', 'II', 'III'][n - 1], diem: L.soThuc_(ch.diem['p' + n], 0), toiDa, khoa: 'p' + n });
  });
  return ds;
}

/** SBD khi lưu 1 học sinh: trống hoặc 4–12 chữ số, không trùng em khác trong không gian. */
function kiemTraSbd(sbdGoc, ds, cu) {
  const sbd = L.chuanHoaSbd_(sbdGoc);
  if (!L.chuoi_(sbdGoc)) return '';
  if (!L.sbdHopLe_(sbd)) throw new Loi('Số báo danh chỉ gồm 4–12 chữ số (thường 8 số).');
  const trung = ds.find((h) => h.sbd === sbd && (!cu || h.id !== cu.id));
  if (trung) throw new Loi('Số báo danh ' + sbd + ' đã là của học sinh ' + trung.hoTen + ' (' + trung.maHs + ').');
  return sbd;
}

/** Môn học hợp lệ: 1 trong các môn có sẵn (không phân biệt hoa thường), hoặc tên môn khác do người dùng gõ. */
function chuanMon(mon) {
  const m = L.chuoi_(mon).replace(/\s+/g, ' ');
  if (m.length > 40) throw new Loi('Tên môn quá dài.');
  return L.DS_MON.find((x) => x.toLowerCase() === m.toLowerCase()) || m;
}

/** Cấu trúc đề theo id (trống -> cách chấm Toán v1). */
async function cauTrucTheoId(c, id) {
  if (!id) return null;
  const ct = L.layCauTrucCoSan(id) || (await c.cauTrucRieng()).find((x) => x.id === id);
  if (!ct) throw new Loi('Không tìm thấy cấu trúc đề "' + id + '" (có thể đã bị xóa).');
  return ct;
}

/** Gợi ý cấu trúc đề theo môn của các lớp trong file: các lớp cùng 1 môn -> cấu trúc của môn đó; còn lại -> Toán. */
function cauTrucGoiY(c, so) {
  const kqF = L.docFileKetQua(so.kq);
  const mon = new Set();
  if (kqF.ok) kqF.hocSinh.forEach((h) => { const l = h.lop && c.lopTheoTen(h.lop); if (l && l.mon) mon.add(l.mon); });
  return (mon.size === 1 && L.cauTrucCuaMon([...mon][0])) || 'thpt2025-toan';
}

/** Đọc 2 file tải lên (dạng sổ { tênTab: [[ô…]] }) theo cấu trúc đề. */
async function docHaiFile(c, so, baiThi, cauTrucId) {
  if (!so || !so.kq) return { ok: false, loi: 'Chưa có bảng kết quả học sinh.' };
  return L.ghepHaiFile(L.docFileKetQua(so.kq), so.da ? L.docFileDapAn(so.da) : null, { tieuDe: baiThi ? baiThi.toUpperCase() : '' }, await cauTrucTheoId(c, cauTrucId));
}

/** Dữ liệu 1 phiếu (lưu JSON; trình duyệt dựng phiếu từ đây). */
function duLieuPhieu(c, kq, h, cham, hs, maPhieu, lanThi, mau) {
  const truoc = lanThi.lichSu.length ? lanThi.lichSu[lanThi.lichSu.length - 1] : null;
  const chenh = truoc ? L.soThuc_(cham.diem.tong, 0) - L.soThuc_(truoc.tong, 0) : 0;
  const them = {};
  if (mau) { // mẫu phiếu Word: lưu giá trị các trường của mẫu lấy từ dòng Excel của học sinh
    const theoKhoa = {};
    Object.keys(h.cot || {}).forEach((k) => { theoKhoa[MW.khoaTruong(k)] = h.cot[k]; });
    them.mau = mau.id;
    them.giaTri = {};
    mau.truong.forEach((t) => { const v = theoKhoa[MW.khoaTruong(t)]; if (v != null) them.giaTri[t] = v; });
    them.truongDiem = kq.truongDiem || {};
  }
  return {
    ...them,
    trungTam: c.nd.tenKg, khauHieu: c.nd.caiDat.khauHieu || '',
    tieuDe: kq.thongTin.tieuDe, moTa: kq.thongTin.moTa, nhanLop: kq.thongTin.nhanLop, tenPhan: kq.thongTin.tenPhan, moTaPhan: kq.thongTin.moTaPhan,
    stt: h.stt, sbd: h.sbd || (hs && hs.sbd) || '', thuHang: h.thuHang || '', soXepHang: kq.soXepHang || 0,
    hoTen: hs.hoTen || h.hoTen, lop: lanThi.nhom || h.lop || '', maDe: h.maDe,
    cham, nhanXet: h.nhanXet, maPhieu, lan: lanThi.lan, ngayThi: lanThi.ngayThi, lichSu: lanThi.lichSu,
    chenhLech: truoc ? (chenh > 0 ? '+' : '') + L.dinhDangDiem_(chenh) : '', tangDiem: chenh > 0, giamDiem: chenh < 0,
    ngay: ngayVN()
  };
}
