import { useState } from 'react';
import { ArrowLeft, Shield, Sparkles, Sword } from 'lucide-react';
import type { Card } from '@/game/cardData';
import { buildDeck } from '@/game/cardData';
import { CardView } from './CardView';

interface CardReferenceScreenProps {
  onBack: () => void;
}

const allCards = buildDeck();

function CardReferenceItem({ card }: { card: Card }) {
  const title = card.type === 'monster' ? 'Monstruo' : card.type === 'trap' ? 'Trampa' : 'Mágica';
  const detail = card.type === 'monster' ? 'ATQ ' + card.atk + ' · DEF ' + card.def : card.description;
  const icon = card.type === 'monster' ? <Sword size={13} /> : card.type === 'trap' ? <Shield size={13} /> : <Sparkles size={13} />;

  return (
    <article className="bg-ink-800/80 border border-ink-600/80 rounded-xl p-3 flex flex-col items-center min-w-0 shadow-lg">
      <div className="mb-3"><CardView card={card} size="lg" /></div>
      <div className="w-full text-center">
        <div className="flex items-center justify-center gap-1 text-ink-400 text-[10px] uppercase tracking-wider">{icon}<span>{title}</span></div>
        <h3 className="mt-1 text-gold-300 font-display font-bold text-sm leading-tight">{card.name}</h3>
        <p className="mt-1 text-white/80 text-[11px] leading-snug">{detail}</p>
      </div>
    </article>
  );
}

type CardFilter = 'all' | 'espadas' | 'bastos' | 'magic' | 'trap';

export function CardReferenceScreen({ onBack }: CardReferenceScreenProps) {
  const [filter, setFilter] = useState<CardFilter>('all');

  const filteredCards = allCards.filter((card) => {
    if (filter === 'all') return true;
    if (filter === 'espadas') return card.type === 'monster' && card.suit === 'espadas';
    if (filter === 'bastos') return card.type === 'monster' && card.suit === 'bastos';
    if (filter === 'magic') return card.type === 'magic';
    return card.type === 'trap';
  });

  const tabs: Array<{ value: CardFilter; label: string }> = [
    { value: 'all', label: 'Todas' },
    { value: 'espadas', label: 'Monstruos Espada' },
    { value: 'bastos', label: 'Monstruos Bastos' },
    { value: 'magic', label: 'Mágicas' },
    { value: 'trap', label: 'Trampas' },
  ];

  return (
    <div className="bg-ink-900 h-[100dvh] min-h-0 text-ink-100 flex flex-col">
      <header className="shrink-0 flex items-center gap-3 px-4 sm:px-6 py-3 border-b border-ink-700 bg-ink-900/95">
        <button type="button" onClick={onBack} className="px-3 py-2 rounded-lg bg-ink-800 border border-ink-600 text-ink-200 font-display font-bold hover:border-gold-400 hover:bg-ink-700 transition-colors flex items-center gap-1.5 btn-press">
          <ArrowLeft size={18} /> Atrás
        </button>
        <div><h1 className="font-display font-black text-gold-300 text-xl">Cartas</h1><p className="text-ink-400 text-xs">Todas las cartas y sus efectos</p></div>
      </header>

      <div className="shrink-0 border-b border-ink-700 bg-ink-900/95 px-3 sm:px-6">
        <nav className="max-w-7xl mx-auto flex gap-2 overflow-x-auto py-2.5" aria-label="Filtrar cartas">
          {tabs.map((tab) => (
            <button
              key={tab.value}
              type="button"
              onClick={() => setFilter(tab.value)}
              className={
                'shrink-0 px-3.5 py-2 rounded-lg border font-display font-bold text-xs sm:text-sm transition-all btn-press ' +
                (filter === tab.value
                  ? 'border-gold-400 bg-gold-400/15 text-gold-300 shadow-glow'
                  : 'border-ink-600 bg-ink-800/70 text-ink-300 hover:border-ink-400 hover:text-ink-100')
              }
              aria-pressed={filter === tab.value}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      <main className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-4 sm:px-6 py-5">
        <section className="max-w-7xl mx-auto">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="font-display font-bold text-gold-300 text-lg">
              {tabs.find((tab) => tab.value === filter)?.label}
            </h2>
            <span className="text-ink-400 text-xs shrink-0">
              {filteredCards.length} {filteredCards.length === 1 ? 'carta' : 'cartas'}
            </span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3 sm:gap-4">
            {filteredCards.map((card) => <CardReferenceItem key={card.id} card={card} />)}
          </div>
        </section>
      </main>
    </div>
  );
}
