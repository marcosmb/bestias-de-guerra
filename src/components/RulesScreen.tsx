import { ArrowLeft, BookOpen } from 'lucide-react';
import rulesText from '../../REGLAS_JUEGO_DEFINITIVAS.md?raw';

interface RulesScreenProps {
  onBack: () => void;
}

export function RulesScreen({ onBack }: RulesScreenProps) {
  return (
    <div className="bg-ink-900 min-h-[100dvh] text-ink-100 flex flex-col">
      <header className="shrink-0 flex items-center gap-3 px-4 sm:px-6 py-3 border-b border-ink-700 bg-ink-900/95">
        <button type="button" onClick={onBack} className="px-3 py-2 rounded-lg bg-ink-800 border border-ink-600 text-ink-200 font-display font-bold hover:border-gold-400 hover:bg-ink-700 transition-colors flex items-center gap-1.5 btn-press">
          <ArrowLeft size={18} /> Atrás
        </button>
        <BookOpen size={22} className="text-gold-400" />
        <div><h1 className="font-display font-black text-gold-300 text-xl">Reglas</h1><p className="text-ink-400 text-xs">Reglamento oficial del juego</p></div>
      </header>

      <main className="flex-1 overflow-y-auto px-4 sm:px-6 py-5">
        <article className="max-w-4xl mx-auto bg-ink-800/70 border border-ink-600 rounded-2xl p-5 sm:p-7 shadow-2xl">
          <div className="font-sans text-ink-200 text-sm leading-6 whitespace-pre-wrap">{rulesText}</div>
        </article>
      </main>
    </div>
  );
}
