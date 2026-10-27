import React, { useRef, useState } from 'react';
import { EditorContent, useEditor, useEditorState, type Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Image from '@tiptap/extension-image';
import { TableKit } from '@tiptap/extension-table';
import { Placeholder } from '@tiptap/extensions';
import {
  Bold,
  Columns3,
  Heading2,
  Heading3,
  ImagePlus,
  Italic,
  Link2,
  List,
  ListOrdered,
  Loader2,
  Minus,
  Quote,
  Redo2,
  Rows3,
  Table as TableIcon,
  Trash2,
  Underline,
  Undo2,
  Unlink,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { usePortal } from '../../context/PortalContext';
import { errorMessage, uploadFile } from '../../lib/api';
import { IMAGE_ACCEPT } from '../common/FileUpload';
import { inputClass, primaryButtonClass, secondaryButtonClass } from '../common/Modal';

interface RichTextEditorProps {
  value: string;
  onChange: (html: string, isEmpty: boolean) => void;
  id?: string;
  placeholder?: string;
}

const ToolButton: React.FC<{ label: string; active?: boolean; disabled?: boolean; onClick: () => void; children: React.ReactNode }> = ({
  label,
  active,
  disabled,
  onClick,
  children,
}) => (
  <button
    type="button"
    title={label}
    aria-label={label}
    aria-pressed={active}
    disabled={disabled}
    onMouseDown={(e) => e.preventDefault()}
    onClick={onClick}
    className={`p-1.5 rounded-lg transition-colors disabled:opacity-30 ${active ? 'bg-red-700 text-white' : 'text-[#4B4740] hover:bg-[#E6E0D5]'}`}
  >
    {children}
  </button>
);

const Divider = () => <span className="w-px h-5 bg-[#D9D4CB] mx-0.5" aria-hidden="true" />;

/** Adds or changes the link on the selected text: a web address, or a document or guide of the portal. */
const LinkForm: React.FC<{ editor: Editor; onDone: () => void }> = ({ editor, onDone }) => {
  const { documents, guides } = usePortal();
  const [href, setHref] = useState<string>(editor.getAttributes('link').href ?? '');

  const apply = (value: string) => {
    const url = value.trim();
    const chain = editor.chain().focus().extendMarkRange('link');
    if (!url) chain.unsetLink().run();
    else chain.setLink({ href: /^(https?:|mailto:|tel:|\/|#)/i.test(url) ? url : `https://${url}` }).run();
    onDone();
  };

  return (
    <div className="p-3 border-b border-[#E6E0D5] bg-white space-y-2">
      <div className="flex gap-2">
        <input
          autoFocus
          dir="ltr"
          aria-label="نشانی پیوند"
          placeholder="https://..."
          value={href}
          onChange={(e) => setHref(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              apply(href);
            }
            if (e.key === 'Escape') {
              e.stopPropagation();
              onDone();
            }
          }}
          className={inputClass}
        />
        <button type="button" onClick={() => apply(href)} className={primaryButtonClass}>ثبت</button>
        <button type="button" onClick={onDone} className={secondaryButtonClass}>انصراف</button>
      </div>
      {documents.length + guides.length > 0 && (
        <select aria-label="پیوند به سند یا راهنما" value="" onChange={(e) => e.target.value && apply(e.target.value)} className={inputClass}>
          <option value="">یا پیوند به یکی از اسناد یا راهنماهای پرتال...</option>
          {documents.length > 0 && (
            <optgroup label="اسناد و فرم‌ها">
              {documents.map((d) => (
                // The document's page, not its file: the link keeps working when a new version replaces the file.
                <option key={d.id} value={`#documents/${d.id}`}>{d.title}</option>
              ))}
            </optgroup>
          )}
          {guides.length > 0 && (
            <optgroup label="راهنماها">
              {guides.map((g) => (
                <option key={g.id} value={`#guides/${g.id}`}>{g.title}</option>
              ))}
            </optgroup>
          )}
        </select>
      )}
    </div>
  );
};

/**
 * The editor for news text: headings, bold, lists, links, tables and pictures. It writes HTML; the
 * server keeps only this formatting when the item is saved.
 */
export const RichTextEditor: React.FC<RichTextEditorProps> = ({ value, onChange, id, placeholder = 'متن کامل خبر یا بخشنامه را اینجا بنویسید...' }) => {
  const [linkOpen, setLinkOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3] },
        code: false,
        codeBlock: false,
        link: { openOnClick: false, autolink: true, defaultProtocol: 'https' },
      }),
      Image,
      TableKit.configure({ table: { resizable: false } }),
      Placeholder.configure({ placeholder }),
    ],
    content: value,
    immediatelyRender: true,
    editorProps: {
      attributes: { class: 'rich-text', dir: 'rtl', role: 'textbox', 'aria-multiline': 'true', 'aria-label': 'متن کامل', ...(id ? { id } : {}) },
    },
    onUpdate: ({ editor }) => onChange(editor.getHTML(), editor.isEmpty),
  });

  const state = useEditorState({
    editor,
    selector: ({ editor }) => ({
      bold: editor.isActive('bold'),
      italic: editor.isActive('italic'),
      underline: editor.isActive('underline'),
      h2: editor.isActive('heading', { level: 2 }),
      h3: editor.isActive('heading', { level: 3 }),
      bullet: editor.isActive('bulletList'),
      ordered: editor.isActive('orderedList'),
      quote: editor.isActive('blockquote'),
      link: editor.isActive('link'),
      table: editor.isActive('table'),
      canUndo: editor.can().undo(),
      canRedo: editor.can().redo(),
    }),
  });

  const insertImage = async (file: File | undefined) => {
    if (!file) return;
    setUploading(true);
    try {
      const uploaded = await uploadFile(file);
      editor.chain().focus().setImage({ src: uploaded.url, alt: '' }).run();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = '';
    }
  };

  const chain = () => editor.chain().focus();

  return (
    <div className="rich-text-editor border border-[#D9D4CB] rounded-xl bg-white overflow-hidden focus-within:border-red-600 focus-within:ring-2 focus-within:ring-red-600/20">
      <div className="flex flex-wrap items-center gap-0.5 p-1.5 bg-[#F5F2ED] border-b border-[#E6E0D5]" role="toolbar" aria-label="قالب‌بندی متن">
        <ToolButton label="تیتر" active={state.h2} onClick={() => chain().toggleHeading({ level: 2 }).run()}><Heading2 className="w-4 h-4" /></ToolButton>
        <ToolButton label="زیرتیتر" active={state.h3} onClick={() => chain().toggleHeading({ level: 3 }).run()}><Heading3 className="w-4 h-4" /></ToolButton>
        <Divider />
        <ToolButton label="پررنگ" active={state.bold} onClick={() => chain().toggleBold().run()}><Bold className="w-4 h-4" /></ToolButton>
        <ToolButton label="کج" active={state.italic} onClick={() => chain().toggleItalic().run()}><Italic className="w-4 h-4" /></ToolButton>
        <ToolButton label="زیرخط" active={state.underline} onClick={() => chain().toggleUnderline().run()}><Underline className="w-4 h-4" /></ToolButton>
        <Divider />
        <ToolButton label="فهرست نقطه‌ای" active={state.bullet} onClick={() => chain().toggleBulletList().run()}><List className="w-4 h-4" /></ToolButton>
        <ToolButton label="فهرست شماره‌دار" active={state.ordered} onClick={() => chain().toggleOrderedList().run()}><ListOrdered className="w-4 h-4" /></ToolButton>
        <ToolButton label="نقل قول" active={state.quote} onClick={() => chain().toggleBlockquote().run()}><Quote className="w-4 h-4" /></ToolButton>
        <ToolButton label="خط جداکننده" onClick={() => chain().setHorizontalRule().run()}><Minus className="w-4 h-4" /></ToolButton>
        <Divider />
        <ToolButton label="پیوند" active={state.link} onClick={() => setLinkOpen(true)}><Link2 className="w-4 h-4" /></ToolButton>
        {state.link && <ToolButton label="برداشتن پیوند" onClick={() => chain().extendMarkRange('link').unsetLink().run()}><Unlink className="w-4 h-4" /></ToolButton>}
        <ToolButton label="تصویر" disabled={uploading} onClick={() => fileInput.current?.click()}>
          {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ImagePlus className="w-4 h-4" />}
        </ToolButton>
        <ToolButton label="جدول" active={state.table} onClick={() => chain().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}><TableIcon className="w-4 h-4" /></ToolButton>
        {state.table && (
          <>
            <ToolButton label="افزودن سطر" onClick={() => chain().addRowAfter().run()}><Rows3 className="w-4 h-4" /></ToolButton>
            <ToolButton label="افزودن ستون" onClick={() => chain().addColumnAfter().run()}><Columns3 className="w-4 h-4" /></ToolButton>
            <ToolButton label="حذف سطر" onClick={() => chain().deleteRow().run()}><span className="text-[10px] font-black px-0.5">− سطر</span></ToolButton>
            <ToolButton label="حذف ستون" onClick={() => chain().deleteColumn().run()}><span className="text-[10px] font-black px-0.5">− ستون</span></ToolButton>
            <ToolButton label="حذف جدول" onClick={() => chain().deleteTable().run()}><Trash2 className="w-4 h-4" /></ToolButton>
          </>
        )}
        <span className="flex-1" />
        <ToolButton label="واگرد" disabled={!state.canUndo} onClick={() => chain().undo().run()}><Undo2 className="w-4 h-4" /></ToolButton>
        <ToolButton label="ازنو" disabled={!state.canRedo} onClick={() => chain().redo().run()}><Redo2 className="w-4 h-4" /></ToolButton>
      </div>
      {linkOpen && <LinkForm editor={editor} onDone={() => setLinkOpen(false)} />}
      <input ref={fileInput} type="file" accept={IMAGE_ACCEPT} hidden onChange={(e) => insertImage(e.target.files?.[0])} />
      <EditorContent editor={editor} />
    </div>
  );
};

export default RichTextEditor;
