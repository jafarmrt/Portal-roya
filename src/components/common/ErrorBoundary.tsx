import React from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';

const RELOAD_KEY = 'portal:chunk-reload-at';

/** True for the errors a browser raises when a code chunk of the app cannot be downloaded. */
export function isChunkLoadError(err: unknown): boolean {
  const message = err instanceof Error ? `${err.name} ${err.message}` : String(err);
  return /dynamically imported module|Importing a module script failed|module script|ChunkLoadError|Loading chunk/i.test(message);
}

/**
 * After an update, a page opened earlier still asks for the previous release's code chunks, which no
 * longer exist. Reloading once picks up the new release; the timestamp stops a reload loop when the
 * server itself is unreachable.
 */
export function reloadForNewRelease(): boolean {
  try {
    const last = Number(sessionStorage.getItem(RELOAD_KEY) ?? 0);
    if (Date.now() - last < 30_000) return false;
    sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
  } catch {
    return false;
  }
  window.location.reload();
  return true;
}

/** Loads a page module on demand, reloading the portal once if it was updated since the page opened. */
export function loadModule<T>(loader: () => Promise<T>): () => Promise<T> {
  return () =>
    loader().catch((err) => {
      if (isChunkLoadError(err) && reloadForNewRelease()) return new Promise<T>(() => {});
      throw err;
    });
}

interface Props {
  children: React.ReactNode;
  /** Changing this value clears a shown error, e.g. when the user opens another tab. */
  resetKey?: unknown;
  fullScreen?: boolean;
}

interface State {
  error: Error | null;
}

/** Shows a friendly message instead of a blank page when a part of the portal crashes. */
export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('Portal page crashed:', error, info.componentStack);
  }

  componentDidUpdate(prev: Props) {
    if (this.state.error && prev.resetKey !== this.props.resetKey) this.setState({ error: null });
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    const updated = isChunkLoadError(error);
    return (
      <div className={this.props.fullScreen ? 'min-h-screen bg-[#FDFBF7] flex items-center justify-center p-6' : 'py-12 flex justify-center'} dir="rtl">
        <div role="alert" className="bg-white p-8 rounded-3xl shadow-sm border border-[#fca5a5] max-w-md w-full text-center space-y-4">
          <div className="w-12 h-12 bg-[#fef2f2] text-[#dc2626] rounded-2xl flex items-center justify-center mx-auto">
            <AlertCircle className="w-6 h-6" />
          </div>
          <h2 className="text-lg font-bold text-[#2d2d2d]">{updated ? 'پرتال به‌روزرسانی شده است' : 'نمایش این بخش با خطا روبه‌رو شد'}</h2>
          <p className="text-sm text-[#6e6a60] leading-relaxed">
            {updated
              ? 'برای دیدن نسخهٔ جدید، صفحه را دوباره بارگذاری کنید.'
              : 'لطفاً صفحه را دوباره بارگذاری کنید. اگر مشکل ادامه داشت، به واحد فناوری اطلاعات خبر دهید.'}
          </p>
          <button
            onClick={() => window.location.reload()}
            className="w-full py-3 bg-[#dc2626] text-white font-bold rounded-xl hover:bg-[#b91c1c] transition-colors flex items-center justify-center gap-2"
          >
            <RefreshCw className="w-4 h-4" /> بارگذاری دوباره
          </button>
        </div>
      </div>
    );
  }
}
