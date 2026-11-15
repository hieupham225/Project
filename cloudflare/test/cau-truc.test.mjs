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

test('Vật lí THPT 2025: chia 18/4/6 câu theo cấu trúc, điểm III 0,25/câu, tổng 10', () => {
  const ct = layCauTrucCoSan('thpt2025-vat-li');
  const dung = [...Array(18).fill('A'), 'DSDS', 'DDSS', 'SSDD', 'DSSD', '1.5', '2', '30', '0.25', '12', '7'];
  const full = dung.slice();
  const nua = [...Array(9).fill('A'), ...Array(9).fill('B'), 'DSDS', 'DDSD', 'SSDD', 'SSSS', '1,5', '2', '31', '0.25', '', '7'];
  const { kq, da } = taoFile(28, dung, [full, nua]);
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
  assert.equal(b.diem.p3, (4 * 0.25).toFixed(2)); // 1,5 · 2 · 0,25 · 7 đúng; 31 sai; bỏ trống
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

test('điểm giáo viên nhập vẫn được ưu tiên theo từng phần', () => {
  const ct = layCauTrucCoSan('thpt2025-tieng-anh');
  const dung = Array(40).fill('A');
  const { kq, da } = taoFile(40, dung, [dung], [['Điểm trắc nghiệm', ['7.5']]]);
  const g = L.ghepHaiFile(L.docFileKetQua(kq), L.docFileDapAn(da), {}, ct);
  assert.equal(L.chamBai_(g, g.hocSinh[0]).diem.p1, '7.50');
});

test('mã đề đảo thứ tự câu: tab CauHoi dạng ngang (cột mã đề = câu số mấy trong mã đề) hoặc dạng "Mã đề | Câu | Câu gốc"; thiếu thì cảnh báo', () => {
  const da = L.taoMauDapAn();
  assert.deepEqual(da.CauHoi[0], ['Câu', 'Phần', 'Chủ đề kiến thức', 'Mức độ', 'Nội dung phân tích cụ thể', '105', '106']);
  assert.deepEqual(da.CauHoi[1].slice(5), ['1', '2'], 'câu gốc 1 = câu 1 mã 105 = câu 2 mã 106');
  const td = ['STT', 'Họ và tên', 'Lớp', 'Mã đề thi', ...Array.from({ length: 22 }, (_, i) => 'Câu ' + (i + 1))];
  const r5 = ['1', 'An', 'Toán 1', '105', ...da.DapAn[1].slice(1)], r6 = ['2', 'Bình', 'Toán 1', '106', ...da.DapAn[2].slice(1)];
  const goc = da.CauHoi.slice(1).map((r) => r[4]);
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
    .concat(da.CauHoi.slice(1).map((r) => ['', r[0], '', r[1], r[2], r[3], r[4]]))
    .concat(Array.from({ length: 12 }, (_, i) => ['106', String(i + 1), String(i % 2 ? i : i + 2), '', '', '', '']));
  kiemTra(doc, 'dạng dọc');
  const chiGoc = L.docFileDapAn({ DapAn: da.DapAn, CauHoi: da.CauHoi.map((r) => r.slice(0, 5)) });
  assert.match(L.ghepHaiFile(L.docFileKetQua({ KetQua: [td, r5, r6] }), chiGoc, {}).canhBao.join(' '), /chỉ có 1 bộ chủ đề/);
});

test('cột điểm không có chữ "Điểm": "Trắc nghiệm", "Đúng sai", "Tự luận", "Tổng" vẫn nhận', () => {
  const kq = L.docFileKetQua({ KetQua: [['STT', 'Họ và tên', 'Lớp', 'Mã đề thi', 'Trắc nghiệm', 'Đúng sai', 'Tự luận', 'Tổng'], ['1', 'An', 'Toán 1', '101', '3', '3.5', '2.65', '9.15']] });
  assert.deepEqual(kq.hocSinh[0].diemNhap, { p1: '3', p2: '3.5', p3: '2.65', tong: '9.15' });
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
