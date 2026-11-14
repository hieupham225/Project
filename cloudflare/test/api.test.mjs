/**
 * Kiểm thử API đầu-cuối (chạy với máy chủ local):
 *   npx wrangler d1 execute phieu-ket-qua --local --file=schema.sql && npx wrangler dev   (cửa sổ khác)
 *   GOC=http://127.0.0.1:8787 npm test
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import * as L from '../src/logic.js';

const GOC = process.env.GOC || 'http://127.0.0.1:8787';
const lam = Date.now().toString(36);

/** Trình duyệt giả: giữ cookie, gửi header chống CSRF. */
function trinhDuyet() {
  let ck = '';
  const goi = async (duong, duLieu, them = {}) => {
    const r = await fetch(GOC + duong, {
      method: duLieu === undefined ? 'GET' : 'POST',
      headers: { 'Content-Type': 'application/json', 'X-KQ': '1', Cookie: ck, ...them },
      body: duLieu === undefined ? undefined : JSON.stringify(duLieu)
    });
    const sc = r.headers.get('set-cookie');
    if (sc) ck = sc.split(';')[0];
    const du = await r.json();
    return Array.isArray(du) ? Object.assign(du, { ma: r.status }) : { ma: r.status, ...du, du };
  };
  const rpc = async (ham, ...thamSo) => {
    const r = await goi('/api/rpc', { ham, thamSo });
    if (r.ma !== 200) throw new Error(r.loi);
    return Array.isArray(r) ? r : r.du;
  };
  return { goi, rpc };
}

/** Giáo viên điền bảng kết quả mẫu của lớp: mọi em làm mã đề 105, sai câu (i % 3) + 1. */
function dienKetQua(mauKq, maDe = '105') {
  const da = L.taoMauDapAn().DapAn.find((r) => r[0] === maDe);
  const tieuDe = mauKq.KetQua[0];
  const dong = mauKq.KetQua.slice(1).map((r, i) => {
    const x = r.slice();
    x[4] = '2101' + String(i).padStart(2, '0'); x[5] = maDe;
    for (let n = 1; n <= 22; n++) {
      const j = tieuDe.indexOf('Câu ' + n);
      if (n <= 12) x[j] = n === (i % 3) + 1 ? (da[n] === 'A' ? 'B' : 'A') : da[n];
      else if (n <= 16) x[j] = da[n].split('').join(',');
    }
    x[tieuDe.indexOf('Điểm điền từ')] = '2.5';
    x[tieuDe.indexOf('Ưu điểm')] = 'Chăm chỉ'; x[tieuDe.indexOf('Nhược điểm')] = 'Cần cẩn thận hơn';
    return x;
  });
  return { KetQua: [tieuDe, ...dong] };
}

const A = trinhDuyet(), B = trinhDuyet(), C = trinhDuyet(), PH = trinhDuyet();
const emailA = `lan.${lam}@vd.vn`, emailB = `minh.${lam}@vd.vn`, emailC = `hoa.${lam}@vd.vn`;
const st = {};

test('đăng ký, đăng nhập, CSRF', async () => {
  assert.equal((await A.goi('/api/dang-ky', { hoTen: 'Nguyễn Thị Lan', tenKhongGian: 'Lớp Toán cô Lan', email: emailA, matKhau: 'ngan' })).ma, 400);
  const r = await A.goi('/api/dang-ky', { hoTen: 'Nguyễn Thị Lan', tenKhongGian: 'Lớp Toán cô Lan', email: emailA.toUpperCase(), matKhau: 'matkhau123' });
  assert.equal(r.ok, true);
  assert.equal((await A.goi('/api/dang-ky', { hoTen: 'X', email: emailA, matKhau: 'matkhau123' })).ma, 400, 'trùng email');
  const toi = await A.goi('/api/toi');
  assert.equal(toi.dangNhap, true); assert.equal(toi.khongGian.ten, 'Lớp Toán cô Lan'); assert.equal(toi.email, emailA);
  assert.equal((await A.goi('/api/rpc', { ham: 'gvTaiDuLieu', thamSo: [] }, { 'X-KQ': '' })).ma, 403, 'thiếu header CSRF');
  assert.equal((await PH.goi('/api/rpc', { ham: 'gvTaiDuLieu', thamSo: [] })).ma, 401, 'chưa đăng nhập');
  assert.equal((await A.goi('/api/rpc', { ham: 'khongCo', thamSo: [] })).ma, 404);
  const dl = await A.rpc('gvTaiDuLieu');
  assert.equal(dl.toi.quanTri, true); assert.equal(dl.toi.vaiTro, 'Chủ'); assert.equal(dl.hocSinh.length, 0);
});

test('lớp, học sinh, file mẫu điền sẵn danh sách', async () => {
  await A.rpc('gvTaoNhom', 'Toán 1');
  let dl = await A.rpc('gvThemNhieuHocSinh', [['Phạm Minh Anh'], ['Lê Kim Huệ'], ['Đỗ Hải Nam'], ['Vũ Đức Minh']], {}, 'Toán 1');
  assert.equal(dl.hocSinh.length, 4); assert.match(dl.thongBao, /4 học sinh/);
  assert.ok(dl.hocSinh.every((h) => /^[A-Z2-9]{4}-[A-Z2-9]{4}$/.test(h.maTraCuu) && h.nhom[0] === 'Toán 1'));
  const mau = await A.rpc('gvLayMau', 'Toán 1');
  assert.equal(mau.ketQua.KetQua.length, 5);
  assert.deepEqual(mau.ketQua.KetQua.slice(1).map((r) => r[2]), ['Phạm Minh Anh', 'Lê Kim Huệ', 'Vũ Đức Minh', 'Đỗ Hải Nam'], 'sắp theo tên');
  assert.ok(mau.dapAn.DapAn.length >= 2);
  st.mau = mau;
});

test('gửi kết quả bằng 2 file -> phiếu -> phụ huynh tra cứu', async () => {
  const so = { kq: dienKetQua(st.mau.ketQua), da: st.mau.dapAn };
  // một em vắng
  so.kq.KetQua.splice(4, 1);
  const xt = await A.rpc('gvXemTruoc', so, {});
  assert.equal(xt.ok, true); assert.deepEqual(xt.soCau, { I: 12, II: 4, III: 6 }); assert.deepEqual(xt.canhBao, []);
  assert.equal(xt.hocSinh.filter((h) => h.trangThai === 'co').length, 3);
  assert.equal(xt.nhom.length, 1); assert.equal(xt.nhom[0].nhom, 'Toán 1'); assert.equal(xt.nhom[0].vang.length, 1);
  assert.equal(xt.hocSinh[0].tongDiem, (11 * 0.25 + 4 + 2.5).toFixed(2));
  assert.ok(xt.phieuXemTruoc && xt.phieuXemTruoc.cham.phan1.length === 12);
  const bd0 = await A.rpc('gvBatDauDot', so, { baiThi: 'Kiểm tra tháng 11', ngayThi: '10/11/2026' });
  assert.equal(bd0.ok, true); assert.equal(bd0.dsDot.length, 1);
  const bd = bd0.dsDot[0];
  assert.equal(bd.nhom, 'Toán 1'); assert.equal(bd.lan, 1); assert.equal(bd.canTao.length, 3); assert.equal(bd.vang.length, 1);
  const r = await A.rpc('gvTaoPhieuLo', bd.maDot, so, bd.canTao);
  assert.equal(r.xong, 3);
  const ds = await A.rpc('gvDsPhieuLan', bd.maDot);
  assert.equal(ds.length, 3);
  const xem = await A.rpc('gvXemPhieu', ds[0].maPhieu);
  assert.equal(xem.d.tieuDe, 'PHÂN TÍCH BÀI THI - THÁNG 9 NĂM 2026'); assert.equal(xem.d.trungTam, 'Lớp Toán cô Lan');
  const dl = await A.rpc('gvTaiDuLieu');
  const em = dl.hocSinh.find((h) => h.hoTen === 'Lê Kim Huệ');
  // chưa công bố -> phụ huynh chưa thấy
  let tc = await PH.goi('/api/tra-cuu', { ma: em.maTraCuu.toLowerCase().replace('-', ' ') });
  assert.equal(tc.ok, true); assert.equal(tc.phieu.length, 0); assert.equal(tc.trungTam, 'Lớp Toán cô Lan');
  await A.rpc('gvCongBo', bd.maDot, true);
  tc = await PH.goi('/api/tra-cuu', { ma: em.maTraCuu });
  assert.equal(tc.phieu.length, 1); assert.equal(tc.phieu[0].nhom, 'Toán 1');
  const p = await PH.goi('/api/phieu', { ma: em.maTraCuu, maPhieu: tc.phieu[0].maPhieu });
  assert.equal(p.ok, true); assert.equal(p.d.hoTen, 'Lê Kim Huệ'); assert.equal(p.d.maDe, '105');
  // mã của em khác không mở được phiếu này
  const em2 = dl.hocSinh.find((h) => h.hoTen === 'Phạm Minh Anh');
  assert.equal((await PH.goi('/api/phieu', { ma: em2.maTraCuu, maPhieu: tc.phieu[0].maPhieu })).ok, false);
  // lần 2: gửi lại cùng bài -> Lần 2, phiếu có lịch sử
  const bd2 = (await A.rpc('gvBatDauDot', so, { baiThi: 'kiểm tra THÁNG 11', ngayThi: '20/11/2026' })).dsDot[0];
  assert.equal(bd2.lan, 2); assert.equal(bd2.baiThi, 'Kiểm tra tháng 11');
  await A.rpc('gvTaoPhieuLo', bd2.maDot, so, bd2.canTao);
  const ds2 = await A.rpc('gvDsPhieuLan', bd2.maDot);
  const x2 = await A.rpc('gvXemPhieu', ds2[0].maPhieu);
  assert.equal(x2.d.lichSu.length, 1); assert.equal(x2.d.lan, 2);
  st.em = em; st.maDot = bd.maDot; st.maPhieu = tc.phieu[0].maPhieu;
});

test('chỉ có bảng kết quả (đáp án chép trong từng dòng, kiểu trộn thư)', async () => {
  // dựng bảng giống file giáo viên đang dùng: có thêm cột 1..22 = đáp án đúng ở cuối mỗi dòng, gộp nhận xét 1 ô
  const da = L.taoMauDapAn().DapAn.find((r) => r[0] === '105');
  const tieuDe = ['Thứ hạng', 'STT', 'Họ và tên', 'Lớp', 'Số báo danh', 'Mã đề thi', 'Điểm trắc nghiệm', '', 'Điểm đúng sai', '', 'Điểm điền từ', '', 'Tổng điểm', '',
    ...Array.from({ length: 22 }, (_, i) => 'Câu ' + (i + 1)), '', 'Ưu, nhược', 'Hướng khắc phục', ...Array.from({ length: 22 }, (_, i) => String(i + 1))];
  const dong = (ten, i) => [String(i + 1), String(i + 1), ten, 'Toán 1', '9999' + i, '105', '3', '3.00', '4', '4.00', '2', '2.00', '9', '9.00',
    ...da.slice(1, 13), ...da.slice(13, 17).map((x) => x.split('').join(',')), '', '', '', '', '', '', '',
    '+ Ưu điểm: Giỏi\r\n+ Nhược điểm: Chưa có', 'Phát huy', ...da.slice(1)];
  const kq = { 'Tong hop diem': [tieuDe, dong('Phạm Minh Anh', 0), dong('Đỗ Hải Nam', 1), dong('Học Sinh Lớp Khác', 2).map((v, j) => (j === 3 ? 'Toán 3' : v)), Array(70).fill('')] };
  const xt = await A.rpc('gvXemTruoc', { kq, da: null }, {});
  assert.equal(xt.ok, true); assert.deepEqual(xt.maDe, ['105']);
  assert.match(xt.canhBao.join(' '), /đáp án đúng chép trong từng dòng/);
  // dòng ghi lớp "Toán 3" (chưa có) -> lớp mới, học sinh mới
  assert.deepEqual(xt.hocSinh.map((h) => h.trangThai), ['co', 'co', 'moi']);
  assert.deepEqual(xt.nhom.map((x) => [x.nhom, x.lopMoi, x.soDong]), [['Toán 1', false, 2], ['Toán 3', true, 1]]);
  assert.equal(xt.phieuXemTruoc.nhanXet.uu, 'Giỏi'); assert.equal(xt.phieuXemTruoc.nhanXet.nhuoc, 'Chưa có'); assert.equal(xt.phieuXemTruoc.thuHang, '1');
});

test('1 file nhiều lớp: tự ghép theo cột Lớp, tạo lớp mới, cột Lớp trống thì đoán theo học sinh', async () => {
  const dl = await A.rpc('gvTaiDuLieu');
  const hue = dl.hocSinh.find((h) => h.hoTen === 'Lê Kim Huệ');
  const mau = await A.rpc('gvLayMau', '');
  assert.ok(mau.ketQua.KetQua.slice(1).some((r) => r[3] === 'Toán 1'), 'mẫu chung ghi lớp từng em');
  const kq = dienKetQua({ KetQua: [st.mau.ketQua.KetQua[0],
    ['1', '', 'Phạm Minh Anh', '', ...Array(36).fill('')],           // lớp trống -> đoán Toán 1 (em chỉ học 1 lớp)
    ['2', '', 'Trần Văn Mới', 'Lý 1', ...Array(36).fill('')],        // lớp mới + học sinh mới
    ['3', hue.maHs, 'Lê Kim Huệ', 'lý 1', ...Array(36).fill('')],    // em đã có (Toán 1) -> thêm vào Lý 1
    ['4', '', 'Người Lạ Hoắc', '', ...Array(36).fill('')]] });       // không rõ lớp -> giáo viên chọn
  const so = { kq, da: st.mau.dapAn };
  let xt = await A.rpc('gvXemTruoc', so, {});
  assert.deepEqual(xt.hocSinh.map((h) => [h.nhom, h.trangThai]), [['Toán 1', 'co'], ['Lý 1', 'moi'], ['Lý 1', 'co'], ['', 'canChon']]);
  assert.equal(xt.hocSinh[0].lopDoan, true); assert.equal(xt.hocSinh[2].themVaoLop, true); assert.equal(xt.hocSinh[3].canChon, 'canLop');
  assert.equal((await A.rpc('gvBatDauDot', so, { baiThi: 'Khảo sát chung' })).ok, false, 'còn dòng chưa rõ lớp');
  xt = await A.rpc('gvXemTruoc', so, { quyetDinh: { 3: 'boqua' } });
  assert.equal(xt.hocSinh[3].trangThai, 'boqua');
  const bd = await A.rpc('gvBatDauDot', so, { baiThi: 'Khảo sát chung', ngayThi: '01/12/2026', quyetDinh: { 3: 'boqua' } });
  assert.equal(bd.ok, true);
  assert.deepEqual(bd.dsDot.map((d) => [d.nhom, d.lan, d.canTao.length, d.lopMoi]), [['Toán 1', 1, 1, false], ['Lý 1', 1, 2, true]]);
  for (const d of bd.dsDot) assert.equal((await A.rpc('gvTaoPhieuLo', d.maDot, so, d.canTao)).xong, d.canTao.length);
  const sau = await A.rpc('gvTaiDuLieu');
  assert.ok(sau.nhom.includes('Lý 1'));
  assert.deepEqual(sau.hocSinh.find((h) => h.maHs === hue.maHs).nhom.sort(), ['Lý 1', 'Toán 1']);
  assert.ok(sau.hocSinh.some((h) => h.hoTen === 'Trần Văn Mới' && h.nhom[0] === 'Lý 1'));
  // phụ huynh Huệ thấy phiếu Lý 1 sau khi công bố, cùng 1 mã tra cứu
  await A.rpc('gvCongBo', bd.dsDot[1].maDot, true);
  const tc = await PH.goi('/api/tra-cuu', { ma: hue.maTraCuu });
  assert.ok(tc.phieu.some((p) => p.nhom === 'Lý 1'));
  st.soPhieuEm = tc.phieu.length;
});

test('2 không gian tách biệt hoàn toàn', async () => {
  await B.goi('/api/dang-ky', { hoTen: 'Trần Văn Minh', email: emailB, matKhau: 'matkhau456' });
  const dl = await B.rpc('gvTaiDuLieu');
  assert.equal(dl.hocSinh.length, 0); assert.equal(dl.nhom.length, 0); assert.equal(dl.toi.khongGian.ten, 'Trần Văn Minh');
  await assert.rejects(B.rpc('gvXemPhieu', st.maPhieu), /Không tìm thấy/);
  await assert.rejects(B.rpc('gvDsPhieuLan', st.maDot), /Không tìm thấy/);
  await assert.rejects(B.rpc('gvCongBo', st.maDot, false), /Không tìm thấy/);
  await assert.rejects(B.rpc('gvXoaDot', st.maDot), /Không tìm thấy/);
  await assert.rejects(B.rpc('gvCapLaiMa', st.em.maHs), /Không tìm thấy/);
  await assert.rejects(B.rpc('gvXoaHocSinh', st.em.maHs), /Không tìm thấy/);
  // B tạo lớp cùng tên "Toán 1" -> là lớp riêng của B
  const d2 = await B.rpc('gvTaoNhom', 'Toán 1');
  assert.deepEqual(d2.nhom, ['Toán 1']); assert.equal(d2.hocSinh.length, 0);
  assert.equal((await PH.goi('/api/tra-cuu', { ma: st.em.maTraCuu })).phieu.length, st.soPhieuEm, 'phiếu của A còn nguyên');
  // B không chọn được không gian của A
  const toiA = await A.goi('/api/toi');
  assert.equal((await B.goi('/api/chon-khong-gian', { kg: toiA.khongGian.id })).ma, 403);
});

test('mời giáo viên + phân quyền theo lớp', async () => {
  await A.rpc('gvTaoNhom', 'Toán 2');
  const dl = await A.rpc('gvLuuTaiKhoan', { ten: emailC, hoTen: 'Lê Thu Hòa', lop: ['Toán 2'] });
  const mk = dl.matKhauTam.matKhau;
  assert.match(mk, /^[a-z2-9]{4}-[a-z2-9]{4}$/);
  await A.rpc('gvThemNhieuHocSinh', [['Bùi Ngọc Lan']], {}, 'Toán 2');
  assert.equal((await C.goi('/api/dang-nhap', { email: emailC, matKhau: mk })).ok, true);
  const c = await C.rpc('gvTaiDuLieu');
  assert.deepEqual(c.nhom, ['Toán 2']); assert.deepEqual(c.hocSinh.map((h) => h.hoTen), ['Bùi Ngọc Lan']);
  assert.equal(c.dot.length, 0); assert.equal(c.taiKhoan.length, 0); assert.equal(c.toi.quanTri, false);
  const xtC = await C.rpc('gvXemTruoc', { kq: dienKetQua(st.mau.ketQua), da: st.mau.dapAn }, {});
  assert.ok(xtC.hocSinh.every((h) => h.trangThai === 'loi' && /giáo viên khác phụ trách/.test(h.loi)), 'không gửi được vào lớp của người khác');
  await assert.rejects(C.rpc('gvBatDauDot', { kq: dienKetQua(st.mau.ketQua), da: st.mau.dapAn }, { baiThi: 'X' }).then((r) => { if (!r.ok) throw new Error(r.loi); }), /Không có dòng nào/);
  await assert.rejects(C.rpc('gvXemPhieu', st.maPhieu), /Không tìm thấy/);
  await assert.rejects(C.rpc('gvLuuCaiDat', { tenTrungTam: 'X' }), /quản trị/);
  await assert.rejects(C.rpc('gvLuuTaiKhoan', { ten: 'x@y.vn', hoTen: 'X' }), /quản trị/);
  await assert.rejects(C.rpc('gvThemNhieuHocSinh', [['Em Mới', 'Toán 1']], {}, ''), /không phụ trách/);
  await assert.rejects(C.rpc('gvTaoNhom', 'Toán 1'), /giáo viên khác phụ trách/);
  const tao = await C.rpc('gvTaoNhom', 'Toán 2 nâng cao');
  assert.deepEqual(tao.nhom.sort(), ['Toán 2', 'Toán 2 nâng cao']);
  // xóa lớp: chỉ lớp mình phụ trách
  await assert.rejects(C.rpc('gvXoaLop', 'Toán 1'), /không phụ trách/);
  const xoa = await C.rpc('gvXoaLop', 'Toán 2 nâng cao');
  assert.deepEqual(xoa.nhom, ['Toán 2']); assert.match(xoa.thongBao, /Đã xóa lớp/);
  // đổi mật khẩu
  await assert.rejects(C.rpc('gvDoiMatKhau', 'sai', 'matkhau789'), /không đúng/);
  await C.rpc('gvDoiMatKhau', mk, 'matkhau789');
  // B (chủ không gian khác) được mời vào A: dùng mật khẩu sẵn có, A không đặt lại mật khẩu của B được
  const moiB = await A.rpc('gvLuuTaiKhoan', { ten: emailB, hoTen: 'Trần Văn Minh', lop: ['Toán 1'] });
  assert.ok(!moiB.matKhauTam); assert.match(moiB.thongBao, /mật khẩu sẵn có/);
  await assert.rejects(A.rpc('gvDatLaiMatKhau', emailB), /trung tâm khác/);
  const toiB = await B.goi('/api/toi');
  assert.equal(toiB.dsKhongGian.length, 2);
  // khóa C -> bị đăng xuất ngay
  await A.rpc('gvLuuTaiKhoan', { ten: emailC, hoTen: 'Lê Thu Hòa', lop: ['Toán 2'], trangThai: 'Khóa', sua: true });
  assert.equal((await C.goi('/api/rpc', { ham: 'gvTaiDuLieu', thamSo: [] })).ma, 401);
  assert.equal((await C.goi('/api/dang-nhap', { email: emailC, matKhau: 'matkhau789' })).ma, 403);
});

test('chống dò mật khẩu và mã tra cứu', async () => {
  const D = trinhDuyet();
  const ipGia = { 'CF-Connecting-IP': '10.9.' + (Date.now() % 250) + '.1' };
  for (let i = 0; i < 10; i++) assert.equal((await D.goi('/api/dang-nhap', { email: emailA, matKhau: 'sai' + i }, ipGia)).ma, 401);
  assert.equal((await D.goi('/api/dang-nhap', { email: emailA, matKhau: 'matkhau123' }, ipGia)).ma, 429, 'bị khóa tạm dù đúng mật khẩu');
  const ipGia2 = { 'CF-Connecting-IP': '10.8.' + (Date.now() % 250) + '.2' };
  for (let i = 0; i < 20; i++) assert.equal((await D.goi('/api/tra-cuu', { ma: 'ZZZZ-ZZZ' + 'ABCDEFGHJKMNPQRSTUVWX'[i] }, ipGia2)).ok, false);
  assert.equal((await D.goi('/api/tra-cuu', { ma: st.em.maTraCuu }, ipGia2)).ma, 429);
});

test('xóa lớp có kết quả thi: học sinh còn, phiếu mất', async () => {
  const truoc = await A.rpc('gvTaiDuLieu');
  const soHs = truoc.hocSinh.length;
  assert.ok(truoc.dot.some((d) => d.nhom === 'Toán 1'));
  const dl = await A.rpc('gvXoaLop', 'Toán 1');
  assert.ok(!dl.nhom.includes('Toán 1'));
  assert.equal(dl.hocSinh.length, soHs, 'học sinh vẫn còn');
  assert.ok(!dl.dot.some((d) => d.nhom === 'Toán 1'), 'lần thi của lớp bị xóa');
  assert.ok(dl.hocSinh.every((h) => !h.nhom.includes('Toán 1')));
  await assert.rejects(A.rpc('gvXoaLop', 'Toán 1'), /phụ trách|Không tìm thấy/);
});
