import React, { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown, Search } from 'lucide-react';
import { normalizeForSearch } from '../../../shared/search';
import { isTouchScreen } from '../../lib/touch';

/** Lists longer than this get a search box at the top. */
export const SEARCH_FROM = 6;

interface Choice {
  value: string;
  label: string;
  group?: string;
  disabled: boolean;
}

/** The plain text inside an <option>, e.g. `{first} {last}` written as several pieces. */
const textOf = (node: React.ReactNode): string => {
  if (node === null || node === undefined || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(textOf).join('');
  if (React.isValidElement<{ children?: React.ReactNode }>(node)) return textOf(node.props.children);
  return '';
};

type OptionProps = { value?: string | number; disabled?: boolean; children?: React.ReactNode; label?: string };

/** Reads the <option> and <optgroup> children the same way a native <select> would. */
function readChoices(children: React.ReactNode, group?: string, groupDisabled = false): Choice[] {
  const list: Choice[] = [];
  React.Children.forEach(children, (child) => {
    if (!React.isValidElement<OptionProps>(child)) return;
    if (child.type === React.Fragment) {
      list.push(...readChoices(child.props.children, group, groupDisabled));
    } else if (child.type === 'optgroup') {
      list.push(...readChoices(child.props.children, child.props.label, !!child.props.disabled));
    } else if (child.type === 'option') {
      const label = textOf(child.props.children).trim();
      list.push({ value: String(child.props.value ?? label), label, group, disabled: groupDisabled || !!child.props.disabled });
    }
  });
  return list;
}

export interface SearchableSelectProps {
  id?: string;
  value: string | number | null | undefined;
  /** Called like a native select's handler, so `(e) => set(e.target.value)` keeps working. */
  onChange: (event: { target: { value: string } }) => void;
  children: React.ReactNode;
  className?: string;
  disabled?: boolean;
  required?: boolean;
  'aria-label'?: string;
  /** Shown when the value matches no option. */
  placeholder?: string;
}

/**
 * A drop-down list with a search box, written with the same <option>/<optgroup> children as a native
 * <select>. The search ignores Arabic/Persian letter variants and digits, as the portal's search does.
 * The list is drawn into <body> so dialogs and scrolling cards do not cut it off.
 */
export const SearchableSelect: React.FC<SearchableSelectProps> = ({
  id,
  value,
  onChange,
  children,
  className = '',
  disabled,
  required,
  placeholder = 'انتخاب کنید',
  'aria-label': ariaLabel,
}) => {
  const choices = useMemo(() => readChoices(children), [children]);
  const current = String(value ?? '');
  const selected = choices.find((c) => c.value === current);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const [place, setPlace] = useState<React.CSSProperties>({});
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const listId = useId();
  const searchable = choices.length > SEARCH_FROM;

  const shown = useMemo(() => {
    const q = normalizeForSearch(query.trim());
    if (!q) return choices;
    return choices.filter((c) => normalizeForSearch(`${c.label} ${c.group ?? ''}`).includes(q));
  }, [choices, query]);

  const close = (focusButton = true) => {
    setOpen(false);
    setQuery('');
    if (focusButton) buttonRef.current?.focus({ preventScroll: true });
  };

  const pick = (choice: Choice | undefined) => {
    if (!choice || choice.disabled) return;
    if (choice.value !== current) onChange({ target: { value: choice.value } });
    close();
  };

  const openList = () => {
    if (disabled) return;
    setActive(Math.max(0, choices.findIndex((c) => c.value === current)));
    setOpen(true);
  };

  // Places the list under the field, or above it when there is no room below.
  useLayoutEffect(() => {
    if (!open) return;
    const placeIt = () => {
      const rect = buttonRef.current?.getBoundingClientRect();
      if (!rect) return;
      const width = Math.min(Math.max(rect.width, 224), window.innerWidth - 16);
      const right = Math.min(Math.max(window.innerWidth - rect.right, 8), window.innerWidth - width - 8);
      const below = window.innerHeight - rect.bottom - 8;
      const above = rect.top - 8;
      const up = below < 240 && above > below;
      setPlace({
        position: 'fixed',
        right,
        width,
        maxHeight: Math.min(320, Math.max(up ? above : below, 160)),
        ...(up ? { bottom: window.innerHeight - rect.top + 4 } : { top: rect.bottom + 4 }),
      });
    };
    placeIt();
    // The list follows its field when the page scrolls (a phone scrolls to show the search box), and
    // closes once the field has left the screen.
    const onScroll = (e: Event) => {
      if (panelRef.current?.contains(e.target as Node)) return;
      const rect = buttonRef.current?.getBoundingClientRect();
      if (!rect || rect.bottom < 0 || rect.top > window.innerHeight) close(false);
      else placeIt();
    };
    window.addEventListener('resize', placeIt);
    window.addEventListener('scroll', onScroll, true);
    return () => {
      window.removeEventListener('resize', placeIt);
      window.removeEventListener('scroll', onScroll, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    // A mouse gets the search box at once; on a phone the keyboard would cover the list, so it waits for a tap.
    if (searchable && !isTouchScreen()) searchRef.current?.focus({ preventScroll: true });
    else panelRef.current?.focus({ preventScroll: true });
    const onDown = (e: MouseEvent | TouchEvent) => {
      const target = e.target as Node;
      if (!panelRef.current?.contains(target) && !buttonRef.current?.contains(target)) close(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('touchstart', onDown);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('touchstart', onDown);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Keeps the highlighted item in sight by scrolling only the list, never the page behind it.
  useEffect(() => {
    const list = listRef.current;
    const item = list?.querySelector<HTMLElement>(`[data-index="${active}"]`);
    if (!list || !item) return;
    if (item.offsetTop < list.scrollTop) list.scrollTop = item.offsetTop;
    else if (item.offsetTop + item.offsetHeight > list.scrollTop + list.clientHeight) {
      list.scrollTop = item.offsetTop + item.offsetHeight - list.clientHeight;
    }
  }, [active, open]);

  const move = (step: number) => {
    if (shown.length === 0) return;
    let next = active;
    for (let i = 0; i < shown.length; i++) {
      next = (next + step + shown.length) % shown.length;
      if (!shown[next].disabled) break;
    }
    setActive(next);
  };

  const onListKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') move(1);
    else if (e.key === 'ArrowUp') move(-1);
    else if (e.key === 'Home') setActive(0);
    else if (e.key === 'End') setActive(shown.length - 1);
    else if (e.key === 'Enter') pick(shown[active]);
    else if (e.key === 'Escape') {
      // Only the list closes, not the dialog it is in.
      e.stopPropagation();
      e.nativeEvent.stopImmediatePropagation();
      close();
    } else if (e.key === 'Tab') close(false);
    else return;
    if (e.key !== 'Tab') e.preventDefault();
  };

  let lastGroup: string | undefined;

  return (
    // `contents`: the field itself takes the place, width and spacing classes a <select> had.
    <div className="contents">
      <button
        ref={buttonRef}
        id={id}
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-label={ariaLabel}
        aria-required={required || undefined}
        disabled={disabled}
        onClick={() => (open ? close() : openList())}
        onKeyDown={(e) => {
          if (!open && (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter' || e.key === ' ')) {
            e.preventDefault();
            openList();
          }
        }}
        className={`${className} flex items-center justify-between gap-2 text-right cursor-pointer disabled:cursor-default`}
      >
        <span className={`truncate ${selected ? '' : 'text-faint'}`}>{selected?.label || placeholder}</span>
        <ChevronDown className={`w-4 h-4 shrink-0 text-faint transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
      </button>
      {/* Lets the form refuse to send while a required list is empty, as a native <select> would. */}
      {required && (
        <input
          tabIndex={-1}
          aria-hidden="true"
          required
          value={selected && !selected.disabled ? current : ''}
          onChange={() => undefined}
          onFocus={() => buttonRef.current?.focus()}
          className="sr-only"
        />
      )}
      {open &&
        createPortal(
          <div
            ref={panelRef}
            tabIndex={-1}
            dir="rtl"
            style={place}
            onKeyDown={onListKey}
            className="z-[80] flex flex-col bg-white border border-line-strong rounded-xl shadow-xl overflow-hidden text-sm text-ink outline-none"
          >
            {searchable && (
              <div className="p-2 border-b border-line shrink-0">
                <div className="relative">
                  <Search className="w-4 h-4 absolute right-2.5 top-1/2 -translate-y-1/2 text-faint" aria-hidden="true" />
                  <input
                    ref={searchRef}
                    type="search"
                    value={query}
                    onChange={(e) => {
                      setQuery(e.target.value);
                      setActive(0);
                    }}
                    placeholder="جستجو..."
                    aria-label="جستجو در فهرست"
                    aria-controls={listId}
                    className="w-full pr-8 pl-2 py-2 text-sm bg-surface-soft border border-line rounded-lg outline-hidden focus:border-red-600"
                  />
                </div>
              </div>
            )}
            <ul ref={listRef} id={listId} role="listbox" aria-label={ariaLabel} className="relative overflow-y-auto overscroll-contain py-1 flex-1 min-h-0">
              {shown.length === 0 && <li className="px-3 py-3 text-xs text-faint text-center">موردی پیدا نشد.</li>}
              {shown.map((c, i) => {
                const heading = c.group && c.group !== lastGroup ? c.group : null;
                lastGroup = c.group;
                return (
                  <React.Fragment key={`${c.group ?? ''}|${c.value}|${i}`}>
                    {heading && (
                      <li role="presentation" className="px-3 pt-2 pb-1 text-xs font-black text-faint">
                        {heading}
                      </li>
                    )}
                    <li
                      role="option"
                      data-index={i}
                      aria-selected={c.value === current}
                      aria-disabled={c.disabled || undefined}
                      onMouseEnter={() => !c.disabled && setActive(i)}
                      onClick={() => pick(c)}
                      className={`flex items-center justify-between gap-2 px-3 py-2 ${c.group ? 'pr-5' : ''} ${
                        c.disabled ? 'text-subtle cursor-default' : 'cursor-pointer'
                      } ${i === active && !c.disabled ? 'bg-red-50 text-red-900' : ''}`}
                    >
                      <span className="min-w-0 break-words">{c.label || '—'}</span>
                      {c.value === current && <Check className="w-4 h-4 shrink-0 text-red-700" aria-hidden="true" />}
                    </li>
                  </React.Fragment>
                );
              })}
            </ul>
          </div>,
          document.body,
        )}
    </div>
  );
};
