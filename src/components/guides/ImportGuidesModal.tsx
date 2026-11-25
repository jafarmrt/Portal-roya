import React, { useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, Download, FileSpreadsheet, LifeBuoy, Loader2, Upload } from 'lucide-react';
import toast from 'react-hot-toast';
import { usePortal } from '../../context/PortalContext';
import { api, errorMessage } from '../../lib/api';
import { downloadCsv } from '../../lib/download';
import { toPersianDigits } from '../../lib/jalali';
import type { GuideImportRow } from '../../types';
import { Modal, primaryButtonClass, secondaryButtonClass } from '../common/Modal';

const GUIDE_TEMPLATE_HEADER = ['پرسش', 'دسته', 'پاسخ کوتاه', 'متن کامل', 'واحد', 'مسئول', 'تاریخ بازبینی'];
const TEMPLATE_SAMPLES = [
  [
    'چطور درخواست مرخصی ثبت کنم؟',
    'مرخصی',
    'درخواست را در سامانهٔ حضور و غیاب ثبت کنید.',
    '۱. وارد سامانهٔ حضور و غیاب شوید.\n۲. درخواست مرخصی را ثبت کنید.\n۳. منتظر تأیید سرپرست واحد بمانید.',
    '',
    '',
    '',
  ],
  [
    'برای ازدواج یا فوت بستگان چه مرخصی‌ای دارم؟',
    'مرخصی',
    '۳ روز مرخصی با مزد، جدا از مرخصی سالانه.',
    'این مرخصی برای این موارد است:\n- ازدواج دائم\n- فوت همسر، پدر، مادر و فرزندان',
    '',
    '',
    '',
  ],
];

/** Writes many guides at once from an Excel file: upload, check the preview, then save the rows without an error. */
export const ImportGuidesModal: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const { importGuides } = usePortal();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [fileName, setFileName] = useState('');
  const [preview, setPreview] = useState<GuideImportRow[] | null>(null);
  // Guides the portal already has are left alone unless the manager asks for them to be brought up to date.
  const [updateExisting, setUpdateExisting] = useState(false);

  const validRows = preview?.filter((r) => r.errors.length === 0) ?? [];
  const invalidCount = (preview?.length ?? 0) - validRows.length;
  const newRows = validRows.filter((r) => r.action === 'create');
  const updateRows = validRows.filter((r) => r.action === 'update');
  const unchangedCount = validRows.filter((r) => r.action === 'unchanged').length;
  const toSend = [...newRows, ...(updateExisting ? updateRows : [])];

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setBusy(true);
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await api.post<{ rows: GuideImportRow[] }>('/api/guides/import/preview', form);
      setFileName(file.name);
      setPreview(res.rows);
      setUpdateExisting(false);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const handleImport = async () => {
    setBusy(true);
    const result = await importGuides(toSend.map((r) => r.data), updateExisting);
    setBusy(false);
    if (!result) return;
    const done = [
      result.created > 0 ? `${toPersianDigits(result.created)} راهنمای جدید منتشر شد` : '',
      result.updated > 0 ? `${toPersianDigits(result.updated)} راهنما به‌روز شد` : '',
    ].filter(Boolean);
    if (done.length > 0) toast.success(`${done.join(' و ')}.`);
    if (result.skipped.length > 0) toast.error(`${toPersianDigits(result.skipped.length)} ردیف ثبت نشد؛ فایل را دوباره بارگذاری کنید.`);
    onClose();
  };

  return (
    <Modal
      title="ورود راهنماها از اکسل"
      subtitle="نوشتن چند پرسش و پاسخ با یک فایل"
      icon={<FileSpreadsheet className="w-5 h-5" />}
      onClose={onClose}
      size="xl"
      footer={
        <>
          <button type="button" onClick={onClose} className={secondaryButtonClass}>انصراف</button>
          {preview && (
            <button type="button" onClick={handleImport} disabled={busy || toSend.length === 0} className={primaryButtonClass}>
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <LifeBuoy className="w-4 h-4" />}
              {busy ? 'در حال ثبت...' : `ثبت ${toPersianDigits(toSend.length)} راهنما`}
            </button>
          )}
        </>
      }
    >
      <div className="space-y-4">
        <ol className="list-decimal pr-5 space-y-1.5 text-ink-soft leading-relaxed">
          <li>
            فایل نمونه را دانلود کنید و در اکسل برای هر پرسش یک ردیف پر کنید. ستون‌های «پرسش»، «دسته» و «متن کامل» الزامی‌اند.
            <button
              type="button"
              onClick={() => downloadCsv('roya-portal-guides-template.csv', [GUIDE_TEMPLATE_HEADER, ...TEMPLATE_SAMPLES])}
              className="mr-2 text-red-700 font-bold hover:underline inline-flex items-center gap-1"
            >
              <Download className="w-3.5 h-3.5" /> دانلود فایل نمونه
            </button>
          </li>
          <li>
            در «متن کامل» هر خط یک بند می‌شود (خط تازه در اکسل: <span dir="ltr">Alt+Enter</span>). خط‌هایی که با «-» شروع شوند فهرست، و خط‌هایی که با «۱.» و «۲.» شروع شوند
            مراحل شماره‌دار می‌شوند. چند خط پشت هم به شکل <span dir="ltr">| ستون | ستون |</span> یک جدول می‌سازند که خط اولش سرستون است.
          </li>
          <li>«واحد» باید یکی از واحدهای پرتال باشد. در «مسئول» نام کامل یا نام کاربری همکاری را بنویسید که پرسش‌های «جوابم را پیدا نکردم» به او می‌رسد. هر دو اختیاری‌اند.</li>
          <li>«تاریخ بازبینی» اختیاری است و به شکل ۱۴۰۶/۰۹/۰۱ نوشته می‌شود.</li>
          <li>فایل را با فرمت xlsx یا CSV ذخیره و اینجا بارگذاری کنید. پیش از ثبت، پیش‌نمایش راهنماها و خطاها را می‌بینید.</li>
        </ol>

        <input ref={inputRef} type="file" accept=".xlsx,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="sr-only" onChange={handleFile} />
        <button
          type="button"
          disabled={busy}
          onClick={() => inputRef.current?.click()}
          className="w-full p-5 border-2 border-dashed border-line-strong hover:border-red-600 hover:text-red-700 rounded-2xl flex items-center justify-center gap-2 font-bold disabled:opacity-60"
        >
          {busy && !preview ? <Loader2 className="w-5 h-5 animate-spin" /> : <Upload className="w-5 h-5" />}
          {fileName ? `فایل «${fileName}» — انتخاب فایل دیگر` : 'انتخاب فایل اکسل یا CSV'}
        </button>

        {preview && (
          <>
            <div className="flex flex-wrap gap-2 font-bold">
              {newRows.length > 0 && <span className="px-3 py-1 rounded-full bg-emerald-50 text-emerald-800">{toPersianDigits(newRows.length)} راهنمای جدید</span>}
              {updateRows.length > 0 && <span className="px-3 py-1 rounded-full bg-sky-50 text-sky-800">{toPersianDigits(updateRows.length)} راهنمای موجود با تغییر</span>}
              {unchangedCount > 0 && <span className="px-3 py-1 rounded-full bg-stone-100 text-stone-700">{toPersianDigits(unchangedCount)} راهنما بدون تغییر</span>}
              {invalidCount > 0 && <span className="px-3 py-1 rounded-full bg-danger-50 text-danger-700">{toPersianDigits(invalidCount)} ردیف با خطا (ثبت نمی‌شود)</span>}
            </div>
            {updateRows.length > 0 && (
              <label className="flex items-start gap-2 p-3 bg-surface rounded-xl cursor-pointer leading-relaxed">
                <input type="checkbox" checked={updateExisting} onChange={(e) => setUpdateExisting(e.target.checked)} className="accent-red-700 mt-0.5" />
                <span>
                  <strong>راهنماهای موجود هم با این فایل به‌روز شوند.</strong>
                  <span className="block text-muted">
                    پرسش {toPersianDigits(updateRows.length)} ردیف از قبل در پرتال هست. بدون این گزینه آن راهنماها دست نمی‌خورند. خانه‌های خالی فایل چیزی را پاک نمی‌کنند.
                  </span>
                </span>
              </label>
            )}
            <div className="overflow-x-auto border border-line rounded-2xl max-h-[45dvh]">
              <table className="w-full text-xs">
                <thead className="bg-surface text-ink-soft sticky top-0">
                  <tr>
                    <th className="p-2 text-right">ردیف</th><th className="p-2 text-right">پرسش</th><th className="p-2 text-right">دسته</th>
                    <th className="p-2 text-right">واحد و مسئول</th><th className="p-2 text-right">وضعیت</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.map((r) => (
                    <tr key={r.row} className={`border-t border-line align-top ${r.errors.length ? 'bg-danger-50/60' : ''}`}>
                      <td className="p-2">{toPersianDigits(r.row)}</td>
                      <td className="p-2 min-w-48">
                        <span className="font-bold">{r.data.title}</span>
                        {r.data.summary && <span className="block text-ink-soft mt-0.5">{r.data.summary}</span>}
                      </td>
                      <td className="p-2">{r.data.category}</td>
                      <td className="p-2">
                        {r.data.department}
                        {(r.owner ?? r.data.owner) && <span className="block text-muted">{r.owner ?? r.data.owner}</span>}
                      </td>
                      <td className="p-2">
                        {r.errors.length > 0 ? (
                          <span className="text-danger-700 flex items-start gap-1"><AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" /> {r.errors.join(' ')}</span>
                        ) : r.action === 'update' ? (
                          <>
                            <span className={`font-bold flex items-center gap-1 ${updateExisting ? 'text-sky-800' : 'text-stone-600'}`}>
                              <CheckCircle2 className="w-3.5 h-3.5" /> {updateExisting ? 'به‌روزرسانی' : 'از قبل هست (دست نمی‌خورد)'}
                            </span>
                            {r.changes?.map((c) => <span key={c} className="block text-ink-soft mt-0.5">{c}</span>)}
                          </>
                        ) : r.action === 'unchanged' ? (
                          <span className="text-stone-600">بدون تغییر</span>
                        ) : (
                          <span className="text-emerald-700 font-bold flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5" /> راهنمای جدید</span>
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
