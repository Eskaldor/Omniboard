import React, { useState } from 'react';
import { X, BookOpen, Loader2, Download } from 'lucide-react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

interface ReportResult {
  filename: string;
  markdown: string;
  actors_written: number;
}

export function CombatReportModal({ isOpen, onClose }: Props) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ReportResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const generate = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/player/combat-report', { method: 'POST' });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { detail?: string };
        throw new Error(body.detail ?? `HTTP ${res.status}`);
      }
      setResult((await res.json()) as ReportResult);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка генерации');
    } finally {
      setLoading(false);
    }
  };

  const downloadMd = () => {
    if (!result) return;
    const blob = new Blob([result.markdown], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = result.filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-zinc-900 border border-zinc-700/60 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800 shrink-0">
          <div className="flex items-center gap-2 text-zinc-100 font-semibold">
            <BookOpen size={18} className="text-amber-400" />
            Отчёт о бое
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {!result && !loading && !error && (
            <div className="flex flex-col items-center gap-4 py-8 text-center">
              <BookOpen size={40} className="text-amber-500/60" />
              <p className="text-zinc-300 text-sm max-w-sm">
                Сформировать итоговый отчёт о бое: изменения характеристик персонажей
                будут сохранены в файл, а данные кампании обновлены.
              </p>
              <button
                onClick={() => void generate()}
                className="px-6 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-medium text-sm transition-colors"
              >
                Сформировать отчёт
              </button>
            </div>
          )}

          {loading && (
            <div className="flex flex-col items-center gap-3 py-12">
              <Loader2 size={28} className="animate-spin text-amber-500" />
              <p className="text-zinc-400 text-sm">Генерация отчёта…</p>
            </div>
          )}

          {error && (
            <div className="flex flex-col items-center gap-3 py-8 text-center">
              <p className="text-red-400 text-sm">{error}</p>
              <button
                onClick={() => { setError(null); setResult(null); }}
                className="px-4 py-2 rounded-lg bg-zinc-800 text-zinc-300 text-sm hover:bg-zinc-700 transition-colors"
              >
                Попробовать снова
              </button>
            </div>
          )}

          {result && (
            <div className="flex flex-col gap-4">
              <div className="flex items-center justify-between text-xs text-zinc-500">
                <span>Сохранено: <span className="text-zinc-300">{result.filename}</span></span>
                <span>Персонажей обновлено: <span className="text-emerald-400">{result.actors_written}</span></span>
              </div>
              <pre className="bg-zinc-950 border border-zinc-800 rounded-xl p-4 text-xs text-zinc-300 overflow-x-auto whitespace-pre-wrap leading-relaxed font-mono">
                {result.markdown}
              </pre>
            </div>
          )}
        </div>

        {/* Footer */}
        {result && (
          <div className="flex items-center justify-end gap-3 px-5 py-3 border-t border-zinc-800 shrink-0">
            <button
              onClick={downloadMd}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-zinc-800 text-zinc-200 text-sm hover:bg-zinc-700 transition-colors"
            >
              <Download size={14} />
              Скачать .md
            </button>
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-500 text-white text-sm font-medium transition-colors"
            >
              Закрыть
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
