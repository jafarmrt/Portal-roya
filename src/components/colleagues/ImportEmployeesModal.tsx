import React, { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, CheckCircle2, Download, FileSpreadsheet, Loader2, Printer, Upload, Users } from 'lucide-react';
import toast from 'react-hot-toast';
import { api, errorMessage } from '../../lib/api';
import { toPersianDigits } from '../../lib/jalali';
import { Modal, primaryButtonClass, secondaryButtonClass } from '../common/Modal';

interface PreviewRow {
  row: number;
  data: Record<string, string>;
  errors: string[];
}

interface CreatedAccount {
  id: string;
  username: string;
  firstName: string;
  lastName: string;
  position: string;
  department: string;
  temporaryPassword: string;
}

interface ImportResult {
  created: CreatedAccount[];
  skipped: { row: number; username: string; errors: string[] }[];
}

const TEMPLATE_HEADER = ['نام', 'نام خانوادگی', 'نام کاربری', 'سمت', 'واحد', 'نقش', 'ایمیل', 'موبایل', 'داخلی', 'تاریخ تولد', 'تاریخ استخدام'];
const TEMPLATE_SAMPLE = ['علی', 'رضایی', 'ali.rezaei', 'کارشناس فروش', 'فروش و امور مشتریان', 'کارشناس', 'ali.rezaei@roya.local', '09121234567', '215', '1370/05/12', '1400/01/15'];

const csvCell = (value: string) => (/[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value);

/** Saves a UTF-8 CSV with a BOM so Excel shows the Persian text correctly. */
function downloadCsv(filename: string, rows: string[][]) {
  const blob = new Blob(['\uFEFF' + rows.map((r) => r.map(csvCell).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** One card per person, only visible when printing (see .print-sheet in index.css). */
const PrintSheet: React.FC<{ accounts: CreatedAccount[] }> = ({ accounts }) =>
  createPortal(
    <div className="print-sheet" dir="rtl">
      {accounts.map((a) => (
        <div key={a.id} className="print-card">
          <p className="print-card-title">حساب کاربری پرتال سازمانی رویا</p>
          <p><strong>{a.firstName} {a.lastName}</strong> · {a.position} · {a.department}</p>
          <p>آدرس پرتال: <span dir="ltr">{window.location.origin}</span></p>
          <p>نام کاربری: <code dir="ltr">{a.username}</code></p>
          <p>رمز موقت: <code dir="ltr">{a.temporaryPassword}</code></p>
          <p className="print-card-note">در اولین ورود از شما خواسته می‌شود رمز شخصی انتخاب کنید. این برگه را پس از ورود از بین ببرید.</p>
        </div>
      ))}
    </div>,
    document.body,
  );

export const ImportEmployeesModal: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [fileName, setFileName] = useState('');
  const [preview, setPreview] = useState<PreviewRow[] | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [introduce, setIntroduce] = useState(false);

  const validRows = preview?.filter((r) => r.errors.length === 0) ?? [];
  const invalidCount = (preview?.length ?? 0) - validRows.length;

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setBusy(true);
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await api.post<{ rows: PreviewRow[] }>('/api/employees/import/preview', form);
      setFileName(file.name);
      setPreview(res.rows);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const handleImport = async () => {
    setBusy(true);
    try {
      const res = await api.post<ImportResult>('/api/employees/import', { rows: validRows.map((r) => r.data), introduce });
      setResult(res);
      toast.success(`${toPersianDigits(res.created.length)} حساب کاربری ساخته شد.`);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const downloadPasswords = () =>
    downloadCsv('roya-portal-accounts.csv', [
      ['نام', 'نام خانوادگی', 'نام کاربری', 'رمز موقت', 'سمت', 'واحد'],
      ...(result?.created ?? []).map((a) => [a.firstName, a.lastName, a.username, a.temporaryPassword, a.position, a.department]),
    ]);

  if (result) {
    return (
      <Modal
        title="حساب‌ها ساخته شد"
        subtitle="رمزهای موقت فقط همین یک بار نمایش داده می‌شوند"
        icon={<CheckCircle2 className="w-5 h-5" />}
        onClose={onClose}
        size="xl"
        footer={
          <>
            <button type="button" onClick={downloadPasswords} className={secondaryButtonClass}><Download className="w-4 h-4" /> دانلود فایل رمزها</button>
            <button type="button" onClick={() => window.print()} className={secondaryButtonClass}><Printer className="w-4 h-4" /> چاپ برگهٔ رمزها</button>
            <button type="button" onClick={onClose} className={primaryButtonClass}>بستن</button>
          </>
        }
      >
        <PrintSheet accounts={result.created} />
        <div className="space-y-4">
          <div className="p-4 bg-amber-50 border border-amber-300 rounded-2xl text-amber-900 leading-relaxed">
            قبل از بستن این پنجره برگهٔ رمزها را چاپ یا فایل آن را دانلود کنید. هر همکار در اولین ورود رمز شخصی خودش را انتخاب می‌کند. اگر کسی رمزش را گم کرد، از پروفایل او «ساخت رمز موقت جدید» را بزنید.
          </div>
          <div className="overflow-x-auto border border-[#E6E0D5] rounded-2xl">
            <table className="w-full text-xs">
              <thead className="bg-[#F5F2ED] text-[#4B4740]">
                <tr><th className="p-2 text-right">نام</th><th className="p-2 text-right">نام کاربری</th><th className="p-2 text-right">رمز موقت</th><th className="p-2 text-right">واحد</th></tr>
              </thead>
              <tbody>
                {result.created.map((a) => (
                  <tr key={a.id} className="border-t border-[#E6E0D5]">
                    <td className="p-2">{a.firstName} {a.lastName}</td>
                    <td className="p-2"><code dir="ltr">{a.username}</code></td>
                    <td className="p-2"><code dir="ltr" className="font-bold select-all">{a.temporaryPassword}</code></td>
                    <td className="p-2">{a.department}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {result.skipped.length > 0 && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-2xl text-red-800 space-y-1">
              <p className="font-bold">{toPersianDigits(result.skipped.length)} ردیف ساخته نشد:</p>
              {result.skipped.map((s) => <p key={s.row}>{s.username || '—'}: {s.errors.join(' ')}</p>)}
            </div>
          )}
        </div>
      </Modal>
    );
  }

  return (
    <Modal
      title="ورود گروهی همکاران از اکسل"
      subtitle="ساخت حساب کاربری برای چند نفر با یک فایل"
      icon={<FileSpreadsheet className="w-5 h-5" />}
      onClose={onClose}
      size="xl"
      footer={
        <>
          <button type="button" onClick={onClose} className={secondaryButtonClass}>انصراف</button>
          {preview && (
            <button type="button" onClick={handleImport} disabled={busy || validRows.length === 0} className={primaryButtonClass}>
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Users className="w-4 h-4" />}
              {busy ? 'در حال ساخت حساب‌ها...' : `ساخت ${toPersianDigits(validRows.length)} حساب`}
            </button>
          )}
        </>
      }
    >
      <div className="space-y-4">
        <ol className="list-decimal pr-5 space-y-1.5 text-[#4B4740] leading-relaxed">
          <li>
            فایل نمونه را دانلود کنید و در اکسل برای هر همکار یک ردیف پر کنید. ستون‌های نام، نام خانوادگی، نام کاربری، سمت و واحد الزامی‌اند.
            <button type="button" onClick={() => downloadCsv('roya-portal-staff-template.csv', [TEMPLATE_HEADER, TEMPLATE_SAMPLE])} className="mr-2 text-red-700 font-bold hover:underline inline-flex items-center gap-1">
              <Download className="w-3.5 h-3.5" /> دانلود فایل نمونه
            </button>
          </li>
          <li><strong>نام کاربری</strong> را همان نام ورود ویندوز همکار بنویسید (مثلاً <code dir="ltr">ali.rezaei</code>) تا بعداً با ورود اکتیو دایرکتوری یکی شود.</li>
          <li>در ستون نقش نام یکی از نقش‌های پرتال را بنویسید، مثلاً «مدیر» یا «کارشناس» (خالی یعنی کارشناس). تاریخ‌ها به شکل ۱۴۰۰/۰۱/۱۵.</li>
          <li>فایل را با فرمت xlsx یا CSV ذخیره و اینجا بارگذاری کنید. قبل از ساخت حساب‌ها پیش‌نمایش و خطاها را می‌بینید.</li>
        </ol>

        <input ref={inputRef} type="file" accept=".xlsx,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="sr-only" onChange={handleFile} />
        <button
          type="button"
          disabled={busy}
          onClick={() => inputRef.current?.click()}
          className="w-full p-5 border-2 border-dashed border-[#D9D4CB] hover:border-red-600 hover:text-red-700 rounded-2xl flex items-center justify-center gap-2 font-bold disabled:opacity-60"
        >
          {busy && !preview ? <Loader2 className="w-5 h-5 animate-spin" /> : <Upload className="w-5 h-5" />}
          {fileName ? `فایل «${fileName}» — انتخاب فایل دیگر` : 'انتخاب فایل اکسل یا CSV'}
        </button>

        {preview && (
          <>
            <div className="flex flex-wrap gap-2 font-bold">
              <span className="px-3 py-1 rounded-full bg-emerald-50 text-emerald-800">{toPersianDigits(validRows.length)} ردیف آماده</span>
              {invalidCount > 0 && <span className="px-3 py-1 rounded-full bg-red-50 text-red-700">{toPersianDigits(invalidCount)} ردیف با خطا (ساخته نمی‌شود)</span>}
            </div>
            <label className="flex items-start gap-2 p-3 bg-[#F5F2ED] rounded-xl cursor-pointer leading-relaxed">
              <input type="checkbox" checked={introduce} onChange={(e) => setIntroduce(e.target.checked)} className="accent-red-700 mt-0.5" />
              <span>
                <strong>این افراد همکار جدید هستند؛ در داشبورد معرفی شوند.</strong>
                <span className="block text-[#6E6A60]">برای ورود اولیهٔ همهٔ کارکنان فعلی این گزینه را خاموش بگذارید. به همه یک اعلان جمعی داده می‌شود.</span>
              </span>
            </label>
            <div className="overflow-x-auto border border-[#E6E0D5] rounded-2xl max-h-[45dvh]">
              <table className="w-full text-xs">
                <thead className="bg-[#F5F2ED] text-[#4B4740] sticky top-0">
                  <tr>
                    <th className="p-2 text-right">ردیف</th><th className="p-2 text-right">نام</th><th className="p-2 text-right">نام کاربری</th>
                    <th className="p-2 text-right">سمت</th><th className="p-2 text-right">واحد</th><th className="p-2 text-right">وضعیت</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.map((r) => (
                    <tr key={r.row} className={`border-t border-[#E6E0D5] ${r.errors.length ? 'bg-red-50/60' : ''}`}>
                      <td className="p-2">{toPersianDigits(r.row)}</td>
                      <td className="p-2">{r.data.firstName} {r.data.lastName}</td>
                      <td className="p-2"><code dir="ltr">{r.data.username}</code></td>
                      <td className="p-2">{r.data.position}</td>
                      <td className="p-2">{r.data.department}</td>
                      <td className="p-2">
                        {r.errors.length === 0 ? (
                          <span className="text-emerald-700 font-bold flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5" /> آماده</span>
                        ) : (
                          <span className="text-red-700 flex items-start gap-1"><AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" /> {r.errors.join(' ')}</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
};
