// Kiểm thử bộ chấm theo cấu trúc đề (logic thuần, không cần máy chủ).
import test from 'node:test';
import assert from 'node:assert/strict';
import * as L from '../src/logic.js';
import { DANG_CAU, layCauTrucCoSan, kiemTraCauTruc, diemToiDa, CAU_TRUC_CO_SAN } from '../src/cau-truc.js';

const cham = (dang, hs, dung, p = {}) => DANG_CAU[dang].cham(hs, dung, Object.assign({ diemMoiCau: 1 }, p));

test('dạng câu: trắc nghiệm, đúng sai, trả lời ngắn (giữ cách so của v1)', () => {
  assert.equal(cham('trac_nghiem', 'b', 'B').ok, true);
  assert.equal(cham('trac_nghiem', '', 'B').ok, false);
  assert.equal(cham('tra_loi_ngan', '0,5', '0.5').ok, true);
  assert.equal(cham('tra_loi_ngan', '1/2', '0.5').ok, false);
  const ds = (hs, dung) => DANG_CAU.dung_sai.cham(hs, dung, { diemMoiCau: 1, bangDiem: [0, 0.1, 0.25, 0.5, 1] });
  assert.equal(ds('ĐSĐS', 'DSDS').diem, 1);
  assert.equal(ds('Đ,S,,S', 'DSDS').soDung, 3);
  assert.equal(ds('Đ,S,,S', 'DSDS').diem, 0.5);
  assert.equal(ds('SSSS', 'DDDD').diem, 0);
});

test('dạng câu: điền từ / viết lại câu và sắp xếp', () => {
  assert.equal(cham('dien_tu', ' Has  been ', 'has been').ok, true);
  assert.equal(cham('dien_tu', 'He said that he was tired.', "He said that he was tired").ok, true);
  assert.equal(cham('dien_tu', 'don’t', "don't").ok, true, 'nháy cong = nháy thẳng');
  assert.equal(cham('dien_tu', 'went', 'go / went / gone').ok, true, 'nhiều đáp án đúng ngăn bằng /');
  assert.equal(cham('dien_tu', 'goes', 'go / went').ok, false);
  assert.equal(cham('sap_xep', 'a - c - b - d', 'ACBD').ok, true);
  assert.equal(cham('sap_xep', 'a,c,b,d', 'a-c-b-d').ok, true);
  assert.equal(cham('sap_xep', 'acdb', 'a-c-b-d').ok, false);
});

test('cấu trúc có sẵn hợp lệ, tổng điểm 10', () => {
  CAU_TRUC_CO_SAN.forEach((ct) => {
    assert.deepEqual(kiemTraCauTruc(ct), [], ct.ten);
    assert.equal(Math.round(diemToiDa(ct) * 100) / 100, 10, ct.ten);
  });
  assert.ok(kiemTraCauTruc({ ten: 'X', phan: [{ ma: 'I', dang: 'khong_co', soCau: 0 }] }).length >= 2);
});

// Bảng kết quả + đáp án tạo trong bộ nhớ (cùng dạng đọc từ Excel)
function taoFile(soCau, dapAnDung, traLoi, them = []) {
  const td = ['STT', 'Họ và tên', 'Lớp', 'Mã đề thi', ...Array.from({ length: soCau }, (_, i) => 'Câu ' + (i + 1)), ...them.map((x) => x[0])];
  const dong = traLoi.map((t, i) => [String(i + 1), 'Học sinh ' + (i + 1), 'Lý 11', '101', ...t, ...them.map((x) => x[1][i] || '')]);
  const kq = { KetQua: [td, ...dong] };
  const da = { DapAn: [['Mã đề', ...Array.from({ length: soCau }, (_, i) => 'Câu ' + (i + 1))], ['101', ...dapAnDung]] };
  return { kq, da };
}

test('Vật lí THPT 2025: chia 18/4/6 câu theo cấu trúc; phần III Tự luận lấy cột "Điểm tự luận", tổng 10', () => {
  const ct = layCauTrucCoSan('thpt2025-vat-li');
  const dung = [...Array(18).fill('A'), 'DSDS', 'DDSS', 'SSDD', 'DSSD', '1.5', '2', '30', '0.25', '12', '7'];
  const full = dung.slice();
  const nua = [...Array(9).fill('A'), ...Array(9).fill('B'), 'DSDS', 'DDSD', 'SSDD', 'SSSS', '1,5', '2', '31', '0.25', '', '7'];
  const { kq, da } = taoFile(28, dung, [full, nua], [['Điểm tự luận', ['1.5', '1']]]);
  const g = L.ghepHaiFile(L.docFileKetQua(kq), L.docFileDapAn(da), { tieuDe: 'KT' }, ct);
  assert.equal(g.ok, true);
  assert.deepEqual(Object.keys(g.cauHoi).map((p) => g.cauHoi[p].length), [18, 4, 6]);
  const a = L.chamBai_(g, g.hocSinh[0]);
  assert.deepEqual([a.diem.p1, a.diem.p2, a.diem.p3, a.diem.tong, a.diem.maxTong], ['4.50', '4.00', '1.50', '10.00', '10']);
  assert.equal(a.phan.length, 3); assert.equal(a.cauTruc.id, 'thpt2025-vat-li');
  const b = L.chamBai_(g, g.hocSinh[1]);
  // I: 9 câu đúng = 2,25 · II: 1 + 0,5 (3 ý) + 1 + 0,1 (1 ý: SSSS vs DSSD -> ý 2,3 đúng = 2 ý = 0,25)
  assert.equal(b.diem.p1, '2.25');
  assert.equal(b.diem.p2, (1 + 0.5 + 1 + 0.25).toFixed(2));
  assert.equal(b.diem.p3, '1.00', 'tự luận: lấy cột điểm giáo viên, không tự chấm bài làm câu 23–28');
  assert.equal(a.phan[2].dang, 'tu_luan');
});

test('Tiếng Anh THPT 2025: 40 câu trắc nghiệm, mỗi câu 0,25', () => {
  const ct = layCauTrucCoSan('thpt2025-tieng-anh');
  const dung = Array.from({ length: 40 }, (_, i) => 'ABCD'[i % 4]);
  const tl = dung.map((x, i) => (i < 30 ? x : 'A'));
  const { kq, da } = taoFile(40, dung, [tl]);
  const g = L.ghepHaiFile(L.docFileKetQua(kq), L.docFileDapAn(da), {}, ct);
  assert.deepEqual(Object.keys(g.cauHoi), ['I']);
  const c = L.chamBai_(g, g.hocSinh[0]);
  // 30 câu đầu đúng + câu 33, 37 (đáp án A) = 32 câu
  assert.equal(c.diem.tong, (32 * 0.25).toFixed(2));
  assert.equal(c.diem.maxTong, '10');
});

test('Tiếng Anh đề trung tâm (tự tạo): trắc nghiệm + điền từ + sắp xếp', () => {
  const ct = { id: 'ta-tt', ten: 'Tiếng Anh – đề trung tâm', mon: 'Tiếng Anh', phan: [
    { ma: 'A', ten: 'Trắc nghiệm', dang: 'trac_nghiem', soCau: 4, diemMoiCau: 0.5, phuongAn: 'ABCD' },
    { ma: 'B', ten: 'Viết lại câu', dang: 'dien_tu', soCau: 2, diemMoiCau: 2 },
    { ma: 'C', ten: 'Sắp xếp', dang: 'sap_xep', soCau: 2, diemMoiCau: 2 } ] };
  assert.deepEqual(kiemTraCauTruc(ct), []);
  const dung = ['A', 'B', 'C', 'D', 'has been built / was built', "I wish I were taller", 'a-c-b-d', 'b-a-d-c'];
  const tl = ['A', 'B', 'D', 'D', 'Was built.', 'I wish I was taller', 'acbd', 'b, a, c, d'];
  const { kq, da } = taoFile(8, dung, [tl]);
  const g = L.ghepHaiFile(L.docFileKetQua(kq), L.docFileDapAn(da), {}, ct);
  const c = L.chamBai_(g, g.hocSinh[0]);
  assert.deepEqual(c.phan.map((p) => [p.ma, p.diem, p.toiDa]), [['A', '1.50', '2'], ['B', '2.00', '4'], ['C', '2.00', '4']]);
  assert.equal(c.diem.tong, '5.50');
});

test('ưu tiên điểm chấm từ đáp án; cột điểm giáo viên lệch thì cảnh báo; phần không có bài làm thì dùng cột điểm giáo viên', () => {
  const ct = layCauTrucCoSan('thpt2025-tieng-anh');
  const dung = Array(40).fill('A');
  const { kq, da } = taoFile(40, dung, [dung, dung], [['Điểm trắc nghiệm', ['7.5', '10']]]);
  const g = L.ghepHaiFile(L.docFileKetQua(kq), L.docFileDapAn(da), {}, ct);
  const a = L.chamBai_(g, g.hocSinh[0]);
  assert.equal(a.diem.p1, '10.00');
  assert.deepEqual(a.lechNhap.map((x) => [x.file, x.cham]), [['7.50', '10.00']]);
  assert.deepEqual(L.chamBai_(g, g.hocSinh[1]).lechNhap, []);
  assert.match(g.canhBao.join(' '), /1 học sinh có "Điểm trắc nghiệm" trong file khác điểm hệ thống chấm từ đáp án: Học sinh 1 \(file 7\.50, chấm 10\.00\)/);
  // Toán: phần III không có bài làm (tự luận chấm tay) -> lấy cột "Tự luận"
  const toan = layCauTrucCoSan('thpt2025-toan');
  const d2 = [...Array(12).fill('A'), ...Array(4).fill('DSDS'), ...Array(6).fill('1')];
  const td = ['STT', 'Họ và tên', 'Lớp', 'Mã đề thi', 'Tự luận', ...Array.from({ length: 16 }, (_, i) => 'Câu ' + (i + 1))];
  const g2 = L.ghepHaiFile(L.docFileKetQua({ KetQua: [td, ['1', 'An', 'Toán 1', '101', '2.65', ...d2.slice(0, 16)]] }),
    L.docFileDapAn({ DapAn: [['Mã đề', ...d2.map((_, i) => 'Câu ' + (i + 1))], ['101', ...d2]] }), {}, toan);
  const c2 = L.chamBai_(g2, g2.hocSinh[0]);
  assert.deepEqual([c2.diem.p1, c2.diem.p2, c2.diem.p3, c2.diem.tong], ['3.00', '4.00', '2.65', '9.65']);
  assert.deepEqual(c2.lechNhap, []);
});

test('mã đề đảo thứ tự câu: tab CauHoi dạng ngang (cột mã đề = câu số mấy trong mã đề) hoặc dạng "Mã đề | Câu | Câu gốc"; thiếu thì cảnh báo', () => {
  const da = L.taoMauDapAn();
  assert.deepEqual(da.CauHoi[0], ['Câu', 'Phần', 'Dạng bài', 'Chủ đề kiến thức', 'Mức độ', 'Nội dung phân tích cụ thể', '105', '106']);
  assert.deepEqual(da.CauHoi[1].slice(6), ['1', '2'], 'câu gốc 1 = câu 1 mã 105 = câu 2 mã 106');
  const td = ['STT', 'Họ và tên', 'Lớp', 'Mã đề thi', ...Array.from({ length: 22 }, (_, i) => 'Câu ' + (i + 1))];
  const r5 = ['1', 'An', 'Toán 1', '105', ...da.DapAn[1].slice(1)], r6 = ['2', 'Bình', 'Toán 1', '106', ...da.DapAn[2].slice(1)];
  const goc = da.CauHoi.slice(1).map((r) => r[5]);
  const kiemTra = (cauHoi, ten) => {
    const g = L.ghepHaiFile(L.docFileKetQua({ KetQua: [td, r5, r6] }), L.docFileDapAn({ DapAn: da.DapAn, CauHoi: cauHoi }), {});
    const c5 = L.chamBai_(g, g.hocSinh[0]), c6 = L.chamBai_(g, g.hocSinh[1]);
    assert.equal(c5.phan1[0].noiDung, goc[0], ten);
    assert.equal(c6.phan1[0].noiDung, goc[1], ten + ': câu 1 mã 106 = câu 2 đề gốc');
    assert.equal(c6.phan1[1].noiDung, goc[0], ten + ': câu 2 mã 106 = câu 1 đề gốc');
    assert.equal(c6.phan2[0].noiDung, goc[12], ten + ': câu giữ vị trí');
    assert.equal(c6.diem.p1, '3.00');
    assert.deepEqual(g.canhBao, [], ten);
  };
  kiemTra(da.CauHoi, 'dạng ngang');
  const doc = [['Mã đề', 'Câu', 'Câu gốc', 'Phần', 'Chủ đề kiến thức', 'Mức độ', 'Nội dung phân tích cụ thể']]
    .concat(da.CauHoi.slice(1).map((r) => ['', r[0], '', r[1], r[3], r[4], r[5]]))
    .concat(Array.from({ length: 12 }, (_, i) => ['106', String(i + 1), String(i % 2 ? i : i + 2), '', '', '', '']));
  kiemTra(doc, 'dạng dọc');
  const chiGoc = L.docFileDapAn({ DapAn: da.DapAn, CauHoi: da.CauHoi.map((r) => r.slice(0, 6)) });
  assert.match(L.ghepHaiFile(L.docFileKetQua({ KetQua: [td, r5, r6] }), chiGoc, {}).canhBao.join(' '), /chỉ có 1 bộ chủ đề/);
});

test('cột điểm không có chữ "Điểm": "Trắc nghiệm", "Đúng sai", "Tự luận", "Tổng" vẫn nhận', () => {
  const kq = L.docFileKetQua({ KetQua: [['STT', 'Họ và tên', 'Lớp', 'Mã đề thi', 'Trắc nghiệm', 'Đúng sai', 'Tự luận', 'Tổng'], ['1', 'An', 'Toán 1', '101', '3', '3.5', '2.65', '9.15']] });
  assert.deepEqual(kq.hocSinh[0].diemNhap, { p1: '3', p2: '3.5', p3: '2.65', tln: '', tong: '9.15' });
});

test('khối phân tích theo từng phần: data-phan chọn phần, data-ten đổi tên phần, giữ thứ tự trong mẫu', async () => {
  const KP = await import('../src/khoi-phieu.js');
  const d = KP.phieuMinhHoa();
  const html = '<div class="khoi" data-khoi="phan-tich" data-phan="II" data-ten="Đúng &amp; sai">x</div><p>giữa</p><div class="khoi" data-khoi="phan-tich" data-phan="I">y</div><div class="khoi" data-khoi="phan-tich" data-phan="IV">z</div>';
  const out = KP.dungKhoi(html, d);
  assert.match(out, /<b>Đúng &amp; sai<\/b>/);
  assert.ok(out.indexOf("Đúng &amp; sai") < out.indexOf("giữa") && out.indexOf('giữa') < out.indexOf('PHẦN I:'), 'phần II đứng trước phần I');
  assert.equal((out.match(/<table/g) || []).length, 2, 'phần IV không có thì để trống');
  assert.equal(L.chuanHoaPhan_('Phần 4'), 'IV');
});

test('khối phân tích chọn theo dạng bài (data-dang); tiêu đề tự đặt thay cả dòng', async () => {
  const KP = await import('../src/khoi-phieu.js');
  const d = KP.phieuMinhHoa();
  const out = KP.dungKhoi('<div class="khoi" data-khoi="phan-tich" data-dang="dung_sai" data-ten="Phần 2 – Đúng/Sai">x</div><div class="khoi" data-khoi="phan-tich" data-dang="trac_nghiem">y</div>', d);
  assert.match(out, /<b>Phần 2 – Đúng\/Sai<\/b>/);
  assert.match(out, /1\. PHẦN I: /);
  assert.ok(out.indexOf('Phần 2 – Đúng') < out.indexOf('1. PHẦN I'));
});

test('cột "Dạng bài" (tab CauHoi) quyết định câu vào phần nào, không phụ thuộc cột "Phần"', () => {
  const ct = layCauTrucCoSan('thpt2025-toan');
  // đề 5 câu: trắc nghiệm, đúng sai, trắc nghiệm, tự luận, đúng sai — xen kẽ, cột Phần ghi lung tung
  const dung = ['A', 'DSDS', 'B', '0.5', 'SSDD'];
  const td = ['STT', 'Họ và tên', 'Lớp', 'Mã đề thi', 'Câu 1', 'Câu 2', 'Câu 3', 'Câu 4', 'Câu 5'];
  const kq = L.docFileKetQua({ KetQua: [td, ['1', 'An', 'Toán 1', '101', 'A', 'DSDS', 'C', '0,5', 'SSDD']] });
  const da = L.docFileDapAn({ DapAn: [['Mã đề', 'Câu 1', 'Câu 2', 'Câu 3', 'Câu 4', 'Câu 5'], ['101', ...dung]],
    CauHoi: [['Câu', 'Phần', 'Dạng bài', 'Chủ đề'], ['1', 'III', 'Trắc nghiệm ABCD', 'a'], ['2', 'I', 'Đúng sai', 'b'], ['3', 'II', 'TN', 'c'], ['4', 'I', 'Tự luận', 'd'], ['5', '', 'đúng sai', 'e']] });
  const g = L.ghepHaiFile(kq, da, {}, ct);
  assert.deepEqual(Object.keys(g.cauHoi).map((p) => g.cauHoi[p].map((q) => q.cauGoc)), [[1, 3], [2, 5], [4]]);
  const c = L.chamBai_(g, g.hocSinh[0]);
  assert.deepEqual(c.phan.map((p) => [p.dang, p.diem]), [['trac_nghiem', '0.25'], ['dung_sai', '2.00'], ['tu_luan', '0.00']], 'tự luận không tự chấm');
  assert.deepEqual(g.canhBao.filter((x) => /dạng bài/.test(x)), []);
  // dạng bài cấu trúc không có (Trả lời ngắn với cấu trúc Toán): cảnh báo rõ, xếp theo cột Phần
  const da2 = L.docFileDapAn({ DapAn: [['Mã đề', 'Câu 1', 'Câu 2'], ['101', 'A', '0.5']], CauHoi: [['Câu', 'Phần', 'Dạng bài'], ['1', 'I', 'TN'], ['2', 'III', 'Trả lời ngắn']] });
  const g2 = L.ghepHaiFile(L.docFileKetQua({ KetQua: [['Họ và tên', 'Mã đề thi', 'Câu 1', 'Câu 2'], ['An', '101', 'A', '0.5']] }), da2, {}, ct);
  assert.deepEqual(g2.cauHoi.III.map((q) => q.cauGoc), [2]);
  assert.match(g2.canhBao.join(' '), /Câu 2 ghi dạng bài "Trả lời ngắn" nhưng cấu trúc đề "THPT 2025 – Toán" không có phần dạng này/);
});

test('khối Điểm các phần: theo dạng bài, thứ tự + nhãn tự đặt; nhận xét "Ưu và nhược điểm" / "Điểm cần lưu ý"', async () => {
  const KP = await import('../src/khoi-phieu.js');
  const d = KP.phieuMinhHoa();
  assert.match(KP.dungKhoi('<div class="khoi" data-khoi="bang-diem">x</div>', d), /Trắc nghiệm: <span[^>]*>2\.50<\/span>\/3; Đúng sai: .*Tự luận: /);
  const out = KP.dungKhoi('<div class="khoi" data-khoi="bang-diem" data-thutu="dung_sai,trac_nghiem" data-nhan="dung_sai=Phần II – ĐS">x</div>', d);
  assert.ok(out.indexOf('Phần II – ĐS') < out.indexOf('Trắc nghiệm') && out.indexOf('Trắc nghiệm') < out.indexOf('Tự luận'), out);
  const kq = L.docFileKetQua({ KetQua: [['Họ và tên', 'Ưu và nhược điểm'], ['An', '+ Ưu điểm: Chăm.\r\n+ Điểm cần lưu ý: Ẩu.']] });
  assert.deepEqual([kq.hocSinh[0].nhanXet.uu, kq.hocSinh[0].nhanXet.nhuoc, kq.hocSinh[0].nhanXet.nhanNhuoc], ['Chăm.', 'Ẩu.', 'Điểm cần lưu ý']);
});

test('khối Điểm các phần: mỗi dòng = nhãn + dạng bài tính điểm (data-muc)', async () => {
  const KP = await import('../src/khoi-phieu.js');
  const d = KP.phieuMinhHoa();
  assert.equal(KP.ghiMuc([{ dang: 'dung_sai', nhan: 'Phần 2 | ĐS' }, { dang: 'trac_nghiem', nhan: 'TN: ABCD' }]), 'dung_sai:Phần 2   ĐS|trac_nghiem:TN: ABCD');
  const out = KP.dungKhoi('<div class="khoi" data-khoi="bang-diem" data-muc="dung_sai:Phần 2|trac_nghiem:TN: ABCD|dien_tu:Không có">x</div>', d);
  assert.match(out, /Phần 2: <span[^>]*>3\.50<\/span>\/4; TN: ABCD: <span[^>]*>2\.50<\/span>\/3; <b>Tổng điểm: <span[^>]*>8\.50/);
  assert.doesNotMatch(out, /Không có|Tự luận/, 'dạng đề không có -> ẩn; dạng không có dòng -> không hiện riêng');
});

test('dạng Tự luận (chấm tay) tách khỏi Trả lời ngắn: tự luận lấy cột "Điểm tự luận", trả lời ngắn tự chấm', () => {
  const ct = { id: 'x', ten: 'Đề có tự luận', mon: 'Toán', phan: [
    { ma: 'I', ten: 'TN', dang: 'trac_nghiem', soCau: 2, diemMoiCau: 1, phuongAn: 'ABCD' },
    { ma: 'II', ten: 'TLN', dang: 'tra_loi_ngan', soCau: 2, diemMoiCau: 1 },
    { ma: 'III', ten: 'TL', dang: 'tu_luan', soCau: 2, diemMoiCau: 3 }] };
  assert.deepEqual(kiemTraCauTruc(ct), []);
  const td = ['STT', 'Họ và tên', 'Lớp', 'Mã đề thi', 'Câu 1', 'Câu 2', 'Câu 3', 'Câu 4', 'Điểm tự luận'];
  const g = L.ghepHaiFile(L.docFileKetQua({ KetQua: [td, ['1', 'An', 'L', '101', 'A', 'C', '5', '7', '4.5']] }),
    L.docFileDapAn({ DapAn: [['Mã đề', 'Câu 1', 'Câu 2', 'Câu 3', 'Câu 4', 'Câu 5', 'Câu 6'], ['101', 'A', 'B', '5', '8', 'x=2', '']],
      CauHoi: [['Câu', 'Dạng bài'], ['1', 'Trắc nghiệm'], ['2', 'Trắc nghiệm'], ['3', 'Trả lời ngắn'], ['4', 'Trả lời ngắn'], ['5', 'Tự luận'], ['6', 'Tự luận']] }), {}, ct);
  assert.deepEqual(Object.keys(g.cauHoi).map((p) => g.cauHoi[p].length), [2, 2, 2]);
  const c = L.chamBai_(g, g.hocSinh[0]);
  assert.deepEqual(c.phan.map((p) => [p.dang, p.diem, p.toiDa]), [['trac_nghiem', '1.00', '2'], ['tra_loi_ngan', '1.00', '2'], ['tu_luan', '4.50', '6']]);
  assert.deepEqual(c.lechNhap, []);
  assert.equal(L.docFileDapAn({ DapAn: [['Mã đề', 'Câu 1'], ['1', 'A']], CauHoi: [['Câu', 'Dạng bài'], ['1', 'Tự luận']] }).cauHoi[1].dang, 'tu_luan');
});

test('file mẫu có tab HuongDan đứng đầu (kể cả tab dữ liệu bị đổi tên) vẫn đọc đúng', () => {
  const kq = L.taoMauKetQua(), da = L.taoMauDapAn();
  const dauHd = (so, doiTen) => { const o = { HuongDan: so.HuongDan }; Object.keys(so).forEach((k) => { if (k !== 'HuongDan') o[doiTen && k === doiTen ? 'Sheet1' : k] = so[k]; }); return o; };
  assert.equal(L.docFileKetQua(dauHd(kq)).hocSinh.length, 1);
  assert.equal(L.docFileKetQua(dauHd(kq, 'KetQua')).hocSinh.length, 1, 'tab KetQua đổi tên -> lấy tab dữ liệu đầu, bỏ qua HuongDan');
  assert.ok(L.docFileDapAn(dauHd(da, 'DapAn')).ok);
});

test('kiểm tra cột mã đề ở tab CauHoi: số ngoài phần, số lặp, thiếu số -> cảnh báo; cột đúng / trống thì không', () => {
  const cot = { '101': [2, 1, 3, 5, 4], '102': [1, 2, 4, 4, 5], '103': ['', '', '', '', ''] };
  const ch = [['Câu', 'Phần', 'Chủ đề', '101', '102', '103'], ...[1, 2, 3, 4, 5].map((g) => [String(g), g <= 3 ? 'I' : 'II', 'cd' + g, ...['101', '102', '103'].map((m) => String(cot[m][g - 1]))])];
  const da = L.docFileDapAn({ DapAn: [['Mã đề', 'Câu 1', 'Câu 2', 'Câu 3', 'Câu 4', 'Câu 5'], ['101', 'A', 'B', 'C', 'DSDS', 'DSDD'], ['102', 'A', 'B', 'C', 'DSDS', 'DSDD'], ['103', 'A', 'B', 'C', 'DSDS', 'DSDD']], CauHoi: ch });
  assert.equal(da.canhBao.length, 1, JSON.stringify(da.canhBao));
  assert.match(da.canhBao[0], /cột mã đề 102: số 4 ghi ở 2 câu gốc \(3, 4\); câu gốc 3 ghi 4 — không thuộc phần I \(câu 1–3\); phần I \(câu 1–3\) thiếu số 3/);
  assert.deepEqual(L.docFileDapAn(L.taoMauDapAn()).canhBao, [], 'file mẫu hợp lệ');
});

test('cột "Đề gốc": 1 bài thi có 2 bộ đề gốc (mã lẻ / mã chẵn), mỗi bộ 4 mã đảo câu — chủ đề đúng bộ + đúng vị trí; xếp hạng chung 1 file', () => {
  const ct = { id: 'x', ten: 'Toán 10 – Giữa kì', mon: 'Toán', phan: [
    { ma: 'I', ten: 'TN', dang: 'trac_nghiem', soCau: 16, diemMoiCau: 0.25, phuongAn: 'ABCD' },
    { ma: 'II', ten: 'ĐS', dang: 'dung_sai', soCau: 2, soY: 4, diemMoiCau: 1, bangDiem: [0, 0.1, 0.25, 0.5, 1] },
    { ma: 'III', ten: 'TLN', dang: 'tra_loi_ngan', soCau: 4, diemMoiCau: 0.5 },
    { ma: 'IV', ten: 'TL', dang: 'tu_luan', soCau: 4, diemMoiCau: 0.5 }] };
  const PH = [[1, 16, 'I', 'Trắc nghiệm'], [17, 18, 'II', 'Đúng sai'], [19, 22, 'III', 'Trả lời ngắn'], [23, 26, 'IV', 'Tự luận']];
  const phanCua = (g) => PH.find(([a, b]) => g >= a && g <= b);
  const MA = { A: ['1101', '1103', '1105', '1107'], B: ['1102', '1104', '1106', '1108'] };
  // hoán vị trong từng phần: mã thứ k đảo vòng k vị trí
  const viTri = (k, g) => { const [a, b] = phanCua(g), n = b - a + 1; return a + ((g - a + k) % n); };
  const ch = [['Đề gốc', 'Câu', 'Phần', 'Dạng bài', 'Chủ đề', 'Nội dung', ...MA.A, ...MA.B]];
  ['A', 'B'].forEach((bo) => { for (let g = 1; g <= 26; g++) ch.push([bo, String(g), phanCua(g)[2], phanCua(g)[3], bo + '-cd' + g, bo + '-nd' + g,
    ...MA.A.map((m, k) => (bo === 'A' ? String(viTri(k, g)) : '')), ...MA.B.map((m, k) => (bo === 'B' ? String(viTri(k, g)) : ''))]); });
  const dapGoc = (g) => (g <= 16 ? 'ABCD'[g % 4] : g <= 18 ? 'DSDS' : g <= 22 ? String(g) : '');
  const daRows = [...MA.A, ...MA.B].map((m) => { const k = (MA.A.includes(m) ? MA.A : MA.B).indexOf(m), r = Array(26); for (let g = 1; g <= 26; g++) r[viTri(k, g) - 1] = dapGoc(g); return [m, ...r]; });
  const da = L.docFileDapAn({ DapAn: [['Mã đề', ...Array.from({ length: 26 }, (_, i) => 'Câu ' + (i + 1))], ...daRows], CauHoi: ch });
  assert.deepEqual(da.canhBao, []);
  const td = ['STT', 'Họ và tên', 'Lớp', 'Mã đề thi', 'Thứ hạng', ...Array.from({ length: 22 }, (_, i) => 'Câu ' + (i + 1)), 'Điểm tự luận'];
  const kq = [td, ...daRows.map((r, i) => [String(i + 1), 'HS ' + r[0], '10A', r[0], String(i + 1), ...r.slice(1, 23), '1.5'])];
  const g = L.ghepHaiFile(L.docFileKetQua({ KetQua: kq }), da, {}, ct);
  assert.deepEqual(g.canhBao, []);
  assert.equal(g.soXepHang, 8, 'xếp hạng chung cả 8 mã trong 1 bài thi');
  g.hocSinh.forEach((h) => {
    const bo = MA.A.includes(h.maDe) ? 'A' : 'B', k = MA[bo].indexOf(h.maDe), c = L.chamBai_(g, h);
    assert.equal(c.diem.tong, '9.50', h.maDe + ': 4 + 2 + 2 + tự luận 1,5');
    c.phan.forEach((p, iP) => p.cau.forEach((q) => {
      const soTrongMa = PH[iP][0] + q.cau - 1, goc = [...Array(26).keys()].map((x) => x + 1).find((x) => viTri(k, x) === soTrongMa);
      assert.equal(q.chuDe, bo + '-cd' + goc, h.maDe + ' câu ' + soTrongMa);
    }));
  });
  // lỗi khai báo: cột mã đề điền lẫn 2 bộ; mã đề không có cột
  ch[30][6] = '3'; // hàng bộ B, cột 1101
  const da2 = L.docFileDapAn({ DapAn: [['Mã đề', 'Câu 1'], ...daRows.map((r) => r.slice(0, 2)), ['1109', 'A']], CauHoi: ch });
  assert.match(da2.canhBao.join(' '), /cột mã đề 1101: có số ở hàng của nhiều đề gốc \("A", "B"\)/);
  assert.match(da2.canhBao.join(' '), /Mã đề 1109 chưa có cột ở tab CauHoi/);
});
