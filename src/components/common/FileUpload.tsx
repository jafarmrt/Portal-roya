import React, { useId, useRef, useState } from 'react';
import { Loader2, Upload } from 'lucide-react';
import toast from 'react-hot-toast';
import { errorMessage, uploadFile, type UploadedFile } from '../../lib/api';

interface FileUploadProps {
  accept?: string;
  label: string;
  onUploaded: (file: UploadedFile) => void;
  className?: string;
}

/** Button that uploads one file to the portal server and reports the stored file. */
export const FileUpload: React.FC<FileUploadProps> = ({ accept, label, onUploaded, className = '' }) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const id = useId();
  const [busy, setBusy] = useState(false);

  const handleChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setBusy(true);
    try {
      onUploaded(await uploadFile(file));
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <input ref={inputRef} id={id} type="file" accept={accept} className="sr-only" onChange={handleChange} />
      <button
        type="button"
        disabled={busy}
        onClick={() => inputRef.current?.click()}
        className={`px-3 py-2 text-xs font-bold bg-white border border-dashed border-[#B9B2A6] hover:border-red-600 hover:text-red-700 rounded-xl flex items-center gap-1.5 disabled:opacity-60 ${className}`}
      >
        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
        <span>{busy ? 'در حال بارگذاری...' : label}</span>
      </button>
    </>
  );
};

export const IMAGE_ACCEPT = 'image/jpeg,image/png,image/webp,image/gif';
export const DOCUMENT_ACCEPT = '.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.zip,.txt';
