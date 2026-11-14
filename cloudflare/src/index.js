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
    db.prepare(`SELECT p.id, p.tong_diem, p.diem_toi_da, lt.bai_thi, lt.lan, lt.ngay_thi, l.ten AS nhom
        FROM phieu p JOIN lan_thi lt ON lt.id = p.lan_thi JOIN lop l ON l.id = lt.lop
        WHERE p.hoc_sinh = ? AND lt.cong_bo = 1 ORDER BY lt.thu_tu, lt.lan`).bind(hs.id)
  ]);
  return json({
    ok: true,
    trungTam: hs.ten_kg,
    hocSinh: { hoTen: hs.ho_ten, nhom: nhom.results.map((x) => x.ten) },
    phieu: phieu.results.map((x) => ({ maPhieu: x.id, baiThi: x.bai_thi, lan: x.lan, nhom: x.nhom, ngayThi: x.ngay_thi, tongDiem: x.tong_diem, diemToiDa: x.diem_toi_da }))
  });
}

async function layPhieu(req, db, b) {
  const hs = await timHocSinhTheoMa(req, db, b.ma);
  if (!hs) return json({ ok: false, loi: LOI_SAI_MA });
  const p = await db.prepare(`SELECT p.du_lieu FROM phieu p JOIN lan_thi lt ON lt.id = p.lan_thi
      WHERE p.id = ? AND p.hoc_sinh = ? AND lt.cong_bo = 1`).bind(String(b.maPhieu || ''), hs.id).first();
  if (!p) return json({ ok: false, loi: 'Không tìm thấy phiếu kết quả.' });
  return json({ ok: true, d: JSON.parse(p.du_lieu), logo: JSON.parse(hs.cai_dat || '{}').logo || '' });
}

/* =====================================================================
 * NGỮ CẢNH GIÁO VIÊN: dữ liệu của không gian + phân quyền theo lớp
 * ===================================================================== */

class NguCanh {
  constructor(db, nd, url) { this.db = db; this.nd = nd; this.kg = nd.kg; this.url = url; this.bo = {}; }

  async napLop() {
    this.lop = (await this.db.prepare('SELECT id, ten, khoa, ngay_tao FROM lop WHERE kg = ? ORDER BY ten').bind(this.kg).all()).results;
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
  yeuCauQuanTri() { if (!this.nd.quanTri) throw new Loi('Chỉ chủ / quản trị mới làm được thao tác này.', 403); }

  async hocSinh() {
    if (this.bo.hs) return this.bo.hs;
    const [hs, hl] = await this.db.batch([
      this.db.prepare('SELECT id, ma_hs, ho_ten, ngay_sinh, sdt, ghi_chu, ma_tra_cuu, ngay_tao FROM hoc_sinh WHERE kg = ?').bind(this.kg),
      this.db.prepare('SELECT hl.hoc_sinh, hl.lop FROM hoc_sinh_lop hl JOIN hoc_sinh h ON h.id = hl.hoc_sinh WHERE h.kg = ? ORDER BY hl.thu_tu').bind(this.kg)
    ]);
    const theoHs = {};
    hl.results.forEach((x) => { (theoHs[x.hoc_sinh] = theoHs[x.hoc_sinh] || []).push(x.lop); });
    this.bo.hs = hs.results.map((r) => {
      const nhomId = (theoHs[r.id] || []).filter((id) => this.lopTheoId(id));
      const nhom = nhomId.map((id) => this.lopTheoId(id).ten);
      return { id: r.id, maHs: r.ma_hs, hoTen: r.ho_ten, ngaySinh: r.ngay_sinh, sdt: r.sdt, ghiChu: r.ghi_chu, maTraCuu: r.ma_tra_cuu,
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
    ds.forEach((h, i) => {
      let maHs = L.chuoi_(h.maHs);
      if (!maHs || daCoMa.has(maHs)) { do { maHs = 'HS' + String(++lonNhat).padStart(4, '0'); } while (daCoMa.has(maHs)); }
      daCoMa.add(maHs);
      const id = taoId();
      dongHs.push([id, this.kg, maHs, h.hoTen, L.chuoi_(h.ngaySinh), L.chuoi_(h.sdt), L.chuoi_(h.ghiChu), ma[i], homNay]);
      (h.nhomId || []).forEach((l, k) => dongLop.push([id, l, k]));
      maHsMoi.push(maHs);
    });
    await chay(this.db, [
      ...lenhChenNhieu(this.db, 'hoc_sinh', ['id', 'kg', 'ma_hs', 'ho_ten', 'ngay_sinh', 'sdt', 'ghi_chu', 'ma_tra_cuu', 'ngay_tao'], dongHs),
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
      thuTu: r.thu_tu, congBo: !!r.cong_bo, ngayTao: r.ngay_tao
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
    const phieu = (await c.db.prepare('SELECT lan_thi, hoc_sinh, tong_diem, diem_toi_da FROM phieu WHERE kg = ?').bind(c.kg).all()).results;
    const dem = {};
    phieu.forEach((p) => { dem[p.lan_thi] = (dem[p.lan_thi] || 0) + 1; });
    const hocSinh = hs.filter((h) => c.duocHocSinh(h)).map((h) => {
      const o = { maHs: h.maHs, hoTen: h.hoTen, lop: h.lop, nhom: h.nhom, ngaySinh: h.ngaySinh, sdt: h.sdt, ghiChu: h.ghiChu, maTraCuu: h.maTraCuu, ngayTao: h.ngayTao };
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
    await c.db.prepare('UPDATE khong_gian SET ten = ?, cai_dat = ? WHERE id = ?').bind(ten, JSON.stringify(caiDat), c.kg).run();
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
    if (cu) {
      const giuLai = cu.nhomId.filter((id) => !c.duocLopId(id)); // lớp do giáo viên khác phụ trách: giữ nguyên
      await c.db.prepare('UPDATE hoc_sinh SET ho_ten = ?, ngay_sinh = ?, sdt = ?, ghi_chu = ? WHERE id = ?')
        .bind(hoTen, L.chuoi_(hs.ngaySinh), L.chuoi_(hs.sdt), L.chuoi_(hs.ghiChu), cu.id).run();
      await c.datLop({ [cu.id]: [...giuLai, ...idGui.filter((x) => !giuLai.includes(x))] });
    } else {
      await c.themHocSinh([{ hoTen, nhomId: idGui, ngaySinh: hs.ngaySinh, sdt: hs.sdt, ghiChu: hs.ghiChu }]);
    }
    return HAM.gvTaiDuLieu(c);
  },

  /** Thêm nhiều (dán từ Excel / file danh sách). Trùng tên với học sinh lớp khác -> hỏi giáo viên (không tự đoán). */
  async gvThemNhieuHocSinh(c, bang, quyetDinh, nhomMacDinh) {
    quyetDinh = quyetDinh || {};
    bang = (bang || []).map((r) => (r || []).map(L.chuoi_));
    let cc = { ten: 0, lop: 1, sdt: 2, ngaySinh: 3, ghiChu: -1 }, batDau = 0;
    for (let i = 0; i < Math.min(15, bang.length); i++) {
      const k = bang[i].map(L.khongDau_);
      const cTen = L.timChiSo_(k, ['hoten', 'hovaten', 'tenhocsinh', 'hotenhocsinh']);
      if (cTen >= 0) {
        cc = { ten: cTen, lop: L.timChiSo_(k, ['nhomlop', 'nhom', 'lop', 'loptoan', 'lophoc']), sdt: L.timChiSo_(k, ['sdtphuhuynh', 'sdt', 'sodienthoai', 'dienthoai', 'sdtph']),
          ngaySinh: L.timChiSo_(k, ['ngaysinh']), ghiChu: L.timChiSo_(k, ['ghichu']) };
        batDau = i + 1;
        break;
      }
    }
    const o = (r, j) => (j >= 0 ? (r[j] || '').trim() : '');
    const ds = await c.hocSinh();
    const them = [], capNhat = [], canXacNhan = [];
    let gop = 0, boQua = 0;
    for (let j = 0; j < bang.length - batDau; j++) {
      const r = bang[batDau + j], dong = batDau + j;
      const ten = o(r, cc.ten).replace(/\s+/g, ' ');
      if (!ten) continue;
      let nhom = L.tachNhom_(o(r, cc.lop));
      if (!nhom.length && nhomMacDinh) nhom = [L.chuoi_(nhomMacDinh)];
      if (!nhom.length && !c.tatCaLop) throw new Loi('Dòng "' + ten + '" chưa có lớp. Hãy chọn lớp trước khi thêm.');
      nhom.forEach((n) => c.kiemTraLop(n));
      const sdt = o(r, cc.sdt);
      const moi = { hoTen: ten, nhom, ngaySinh: o(r, cc.ngaySinh), sdt, ghiChu: o(r, cc.ghiChu) };
      const cung = ds.filter((h) => L.khongDau_(h.hoTen) === L.khongDau_(ten))
        .concat(them.filter((d) => L.khongDau_(d.hoTen) === L.khongDau_(ten)).map((d) => ({ moiThem: d, hoTen: d.hoTen, nhom: d.nhom, sdt: d.sdt })));
      const qd = quyetDinh[dong];
      let chon = null;
      if (qd === 'boqua') { boQua++; continue; }
      if (qd === 'moi' || !cung.length) { them.push(moi); continue; }
      if (qd) chon = ds.find((h) => h.maHs === qd) || null;
      if (!chon && nhom.length && cung.some((h) => nhom.every((n) => L.thuocNhom_(h, n)))) { boQua++; continue; }
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
      capNhat.push({ hs: chon, nhom });
      gop++;
    }
    if (canXacNhan.length) return { canXacNhan };
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
    kq.thongBao = 'Đã thêm ' + them.length + ' học sinh mới' + (gop ? ', thêm lớp cho ' + gop + ' em đã có' : '') + (boQua ? ', bỏ qua ' + boQua + ' em đã có trong lớp' : '') + '.';
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

  async gvTaoNhom(c, ten) {
    ten = L.chuoi_(ten).replace(/[;,]/g, ' ').replace(/\s+/g, ' ').trim();
    if (!ten) throw new Loi('Vui lòng nhập tên lớp.');
    if (c.lopTheoTen(ten)) throw new Loi('Đã có lớp "' + ten + '"' + (c.duocLop(ten) ? '.' : ' (do giáo viên khác phụ trách — nhờ quản trị giao lớp này cho bạn).'));
    await taoLop(c, ten); // giáo viên tự tạo lớp -> tự giao cho mình
    const kq = await HAM.gvTaiDuLieu(c);
    kq.thongBao = 'Đã tạo lớp "' + ten + '".';
    kq.nhomMoi = ten;
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
    const kq = docHaiFile(so);
    if (!kq.ok) return kq;
    const dsHs = await c.hocSinh();
    const g = ghepNhieuLop(c, kq, dsHs, tuyChon.quyetDinh, tuyChon.quyetDinhLop, tuyChon.themHsMoi !== false);
    const gon = (x) => ({ maHs: x.maHs, hoTen: x.hoTen, nhom: L.noiNhom_(x.nhom), sdt: c.duocHocSinh(x) ? x.sdt : '' });
    let dauTien = null;
    const dsXem = kq.hocSinh.map((h, i) => {
      const r = g.dong[i], ld = g.lopDong[i], cham = L.chamBai_(kq, h);
      if (!dauTien && (r.hs || r.moi)) dauTien = { h, cham, hs: r.hs || { hoTen: h.hoTen }, nhom: ld.nhom };
      const canChon = r.canLop ? 'canLop' : r.canChon || '';
      return { chiSo: i, stt: h.stt, hoTen: h.hoTen, maHsFile: h.maHs, maDe: h.maDe, sbd: h.sbd, tongDiem: cham.diem.tong, maxTong: cham.diem.maxTong,
        trangThai: r.loi ? 'loi' : canChon ? 'canChon' : r.boQua ? 'boqua' : r.moi ? 'moi' : 'co',
        lopFile: h.lop, nhom: ld.nhom || '', lopMoi: !!ld.lopMoi, lopDoan: !!ld.doan, goiYLop: ld.goiY || [],
        loi: r.loi || '', lyDo: canChon ? L.LY_DO_CAN_CHON[canChon] || '' : '', canChon, tuDong: !!r.tuDong,
        hs: r.hs ? gon(r.hs) : null, themVaoLop: !!r.themVaoLop, ungVien: (r.ungVien || []).map(gon) };
    });
    return {
      ok: true, tieuDe: kq.thongTin.tieuDe === 'PHIẾU KẾT QUẢ KIỂM TRA' ? '' : kq.thongTin.tieuDe, ngayThi: kq.thongTin.ngayThi,
      soCau: { I: kq.cauHoi.I.length, II: kq.cauHoi.II.length, III: kq.cauHoi.III.length }, maDe: kq.maDe, coDapAn: !!so.da,
      canhBao: kq.canhBao, hocSinh: dsXem,
      nhom: g.nhom.map((x) => ({ nhom: x.nhom, lopMoi: x.lopMoi, soDong: x.soDong, siSo: x.siSo, vang: x.vang.map(gon) })),
      phieuXemTruoc: dauTien ? duLieuPhieu(c, kq, dauTien.h, dauTien.cham, dauTien.hs, '(xem trước)', { lan: 1, ngayThi: kq.thongTin.ngayThi, lichSu: [], nhom: dauTien.nhom }) : null
    };
  },

  /** Bước 2: mỗi lớp có trong file -> 1 lần thi (Lần 1 nếu bài mới của lớp, lần tiếp theo nếu lớp đã làm, hoặc ghi đè lần gần nhất). */
  async gvBatDauDot(c, so, tuyChon) {
    tuyChon = tuyChon || {};
    let baiThiGoc = L.chuoi_(tuyChon.baiThi).replace(/\s+/g, ' ');
    const ngayThi = L.chuanHoaNgay_(tuyChon.ngayThi) || ngayVN();
    if (!baiThiGoc) throw new Loi('Vui lòng nhập tên bài thi.');
    const kq = docHaiFile(so, baiThiGoc);
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
    let lopToi = c.tatCaLop ? null : [...c.nd.lop];
    for (const nh of g.nhom) {
      const dongTao = nh.chiSo.filter((i) => g.dong[i].hs || g.dong[i].moi);
      if (!dongTao.length) continue; // cả lớp đều bỏ qua
      let idLop;
      if (nh.lopMoi) {
        idLop = taoId();
        lenhLop.push(c.db.prepare('INSERT INTO lop (id, kg, ten, khoa, ngay_tao) VALUES (?, ?, ?, ?, ?)').bind(idLop, c.kg, nh.nhom, L.khongDau_(nh.nhom), homNay));
        if (lopToi) lopToi.push(idLop); // giáo viên tự tạo lớp -> tự giao cho mình
      } else idLop = c.lopTheoTen(nh.nhom).id;
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
          const ds = lopHs[x.hs.id] || [...x.hs.nhomId];
          if (!ds.includes(idLop)) { ds.push(idLop); lopHs[x.hs.id] = ds; }
        } else { moi.push({ hoTen: h.hoTen, nhomId: [idLop], sdt: h.sdt, maHs: h.maHs }); chiSoMoi.push({ i, maTheoDong }); }
      });
      const maDot = taoId();
      lenhCuoi.push(c.db.prepare('INSERT INTO lan_thi (id, kg, lop, bai_thi, lan, ngay_thi, mo_ta, thu_tu, cong_bo, ngay_tao) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?)')
        .bind(maDot, c.kg, idLop, baiThi, lan, ngayThi, L.chuoi_(kq.thongTin.moTa), L.soThuTuNgay_(ngayThi), homNay));
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
    c.xoaBoNho();
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
    const kq = docHaiFile(so, dot.baiThi);
    if (!kq.ok) throw new Loi(kq.loi);
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
      const d = duLieuPhieu(c, kq, h, cham, hs, maPhieu, { lan: dot.lan, ngayThi: dot.ngayThi, lichSu, nhom: dot.nhom });
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
    const cungLop = lt.filter((x) => x.lopId === d.lopId);
    const cacLan = cungLop.filter((x) => L.khongDau_(x.baiThi) === L.khongDau_(d.baiThi));
    const lenh = [];
    if (tenMoi !== d.baiThi) {
      const trung = cungLop.find((x) => L.khongDau_(x.baiThi) === L.khongDau_(tenMoi) && L.khongDau_(x.baiThi) !== L.khongDau_(d.baiThi));
      if (trung) throw new Loi('Lớp "' + d.nhom + '" đã có bài thi "' + trung.baiThi + '". Đặt tên khác để không gộp nhầm 2 bài.');
      const ids = cacLan.map((x) => x.maDot), ph = ids.map(() => '?').join(',');
      const tieuDeCu = [...new Set(cacLan.map((x) => x.baiThi.toUpperCase()))];
      lenh.push(c.db.prepare(`UPDATE lan_thi SET bai_thi = ? WHERE kg = ? AND id IN (${ph})`).bind(tenMoi, c.kg, ...ids));
      // phiếu có tiêu đề = tên bài cũ (viết hoa, mặc định khi file không ghi tiêu đề) -> đổi theo
      lenh.push(c.db.prepare(`UPDATE phieu SET du_lieu = json_set(du_lieu, '$.tieuDe', ?) WHERE kg = ? AND lan_thi IN (${ph})
        AND json_extract(du_lieu, '$.tieuDe') IN (${tieuDeCu.map(() => '?').join(',')})`).bind(tenMoi.toUpperCase(), c.kg, ...ids, ...tieuDeCu));
    }
    if (moTa !== d.moTa || ngayThi !== d.ngayThi) {
      lenh.push(c.db.prepare('UPDATE lan_thi SET mo_ta = ?, ngay_thi = ?, thu_tu = ? WHERE id = ? AND kg = ?').bind(moTa, ngayThi, L.soThuTuNgay_(ngayThi), d.maDot, c.kg));
      lenh.push(c.db.prepare("UPDATE phieu SET du_lieu = json_set(du_lieu, '$.moTa', ?, '$.ngayThi', ?) WHERE lan_thi = ? AND kg = ?").bind(moTa, ngayThi, d.maDot, c.kg));
      if (ngayThi !== d.ngayThi) { // ngày của lần này trong bảng "Kết quả các lần làm" trên phiếu các lần sau
        const sau = cacLan.filter((x) => x.lan > d.lan).map((x) => x.maDot);
        if (sau.length) {
          const ds = (await c.db.prepare(`SELECT id, du_lieu FROM phieu WHERE kg = ? AND lan_thi IN (${sau.map(() => '?').join(',')})`).bind(c.kg, ...sau).all()).results;
          ds.forEach((p) => {
            const j = JSON.parse(p.du_lieu); let doi = false;
            (j.lichSu || []).forEach((x) => { if (x.lan === d.lan) { x.ngayThi = ngayThi; doi = true; } });
            if (doi) lenh.push(c.db.prepare('UPDATE phieu SET du_lieu = ? WHERE id = ?').bind(JSON.stringify(j), p.id));
          });
        }
      }
    }
    if (lenh.length) await c.db.batch(lenh);
    c.xoaBoNho();
    const kq = await HAM.gvTaiDuLieu(c);
    kq.thongBao = lenh.length ? 'Đã lưu thay đổi cho ' + tenMoi + ' – Lần ' + d.lan + ' · lớp ' + d.nhom + '.' : 'Không có gì thay đổi.';
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
    return (await c.db.prepare(`SELECT p.id, p.tong_diem, p.diem_toi_da, h.ma_hs, h.ho_ten FROM phieu p JOIN hoc_sinh h ON h.id = p.hoc_sinh
        WHERE p.lan_thi = ? ORDER BY h.ho_ten`).bind(maDot).all()).results
      .map((x) => ({ maPhieu: x.id, maHs: x.ma_hs, hoTen: x.ho_ten, tongDiem: x.tong_diem, diemToiDa: x.diem_toi_da }));
  },

  async gvXemPhieu(c, maPhieu) {
    const p = await c.db.prepare('SELECT p.du_lieu, lt.lop FROM phieu p JOIN lan_thi lt ON lt.id = p.lan_thi WHERE p.id = ? AND p.kg = ?').bind(String(maPhieu), c.kg).first();
    if (!p || !c.duocLopId(p.lop)) throw new Loi('Không tìm thấy phiếu.');
    return { d: JSON.parse(p.du_lieu), logo: c.nd.caiDat.logo || '' };
  },

  /** File mẫu: bảng kết quả (điền sẵn danh sách lớp) + bảng đáp án theo mã đề. */
  async gvLayMau(c, nhom) {
    nhom = L.chuoi_(nhom);
    const tenCuoi = (s) => s.split(' ').pop();
    const theoTen = (a, b) => tenCuoi(a.hoTen).localeCompare(tenCuoi(b.hoTen), 'vi') || a.hoTen.localeCompare(b.hoTen, 'vi');
    const hs = (await c.hocSinh()).filter((h) => c.duocHocSinh(h));
    let ds = [];
    if (nhom) { // chỉ 1 lớp
      c.kiemTraLop(nhom);
      const l = c.lopTheoTen(nhom);
      ds = hs.filter((h) => l && h.nhomId.includes(l.id)).sort(theoTen).map((h) => ({ maHs: h.maHs, hoTen: h.hoTen, lopMau: l.ten }));
    } else { // tất cả lớp mình phụ trách: mỗi lớp 1 khối, học sinh chưa có lớp ở cuối (cột Lớp để trống)
      c.lop.filter((l) => c.duocLopId(l.id)).sort((a, b) => a.ten.localeCompare(b.ten, 'vi')).forEach((l) => {
        hs.filter((h) => h.nhomId.includes(l.id)).sort(theoTen).forEach((h) => ds.push({ maHs: h.maHs, hoTen: h.hoTen, lopMau: l.ten }));
      });
      hs.filter((h) => !h.nhomId.length).sort(theoTen).forEach((h) => ds.push({ maHs: h.maHs, hoTen: h.hoTen, lopMau: '' }));
    }
    return { ketQua: L.taoMauKetQua(ds, nhom), dapAn: L.taoMauDapAn() };
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
async function taoLop(c, ten) {
  const id = taoId();
  await c.db.prepare('INSERT INTO lop (id, kg, ten, khoa, ngay_tao) VALUES (?, ?, ?, ?, ?)').bind(id, c.kg, ten, L.khongDau_(ten), ngayVN()).run();
  if (!c.tatCaLop) {
    c.nd.lop = [...c.nd.lop, id];
    await c.db.prepare('UPDATE thanh_vien SET lop = ? WHERE kg = ? AND tai_khoan = ?').bind(JSON.stringify(c.nd.lop), c.kg, c.nd.tkId).run();
  }
  await c.napLop();
  return id;
}

/** Đọc 2 file tải lên (dạng sổ { tênTab: [[ô…]] }). */
function docHaiFile(so, baiThi) {
  if (!so || !so.kq) return { ok: false, loi: 'Chưa có bảng kết quả học sinh.' };
  return L.ghepHaiFile(L.docFileKetQua(so.kq), so.da ? L.docFileDapAn(so.da) : null, { tieuDe: baiThi ? baiThi.toUpperCase() : '' });
}

/** Dữ liệu 1 phiếu (lưu JSON; trình duyệt dựng phiếu từ đây). */
function duLieuPhieu(c, kq, h, cham, hs, maPhieu, lanThi) {
  const truoc = lanThi.lichSu.length ? lanThi.lichSu[lanThi.lichSu.length - 1] : null;
  const chenh = truoc ? L.soThuc_(cham.diem.tong, 0) - L.soThuc_(truoc.tong, 0) : 0;
  return {
    trungTam: c.nd.tenKg, khauHieu: c.nd.caiDat.khauHieu || '',
    tieuDe: kq.thongTin.tieuDe, moTa: kq.thongTin.moTa, nhanLop: kq.thongTin.nhanLop, tenPhan: kq.thongTin.tenPhan, moTaPhan: kq.thongTin.moTaPhan,
    stt: h.stt, sbd: h.sbd || '', thuHang: h.thuHang || '', soXepHang: kq.soXepHang || 0,
    hoTen: hs.hoTen || h.hoTen, lop: lanThi.nhom || h.lop || '', maDe: h.maDe,
    cham, nhanXet: h.nhanXet, maPhieu, lan: lanThi.lan, ngayThi: lanThi.ngayThi, lichSu: lanThi.lichSu,
    chenhLech: truoc ? (chenh > 0 ? '+' : '') + L.dinhDangDiem_(chenh) : '', tangDiem: chenh > 0, giamDiem: chenh < 0,
    ngay: ngayVN()
  };
}
