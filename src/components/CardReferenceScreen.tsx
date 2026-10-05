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

export function CardReferenceScreen({ onBack }: CardReferenceScreenProps) {
  const monsters = allCards.filter((card) => card.type === 'monster');
  const traps = allCards.filter((card) => card.type === 'trap');
  const magics = allCards.filter((card) => card.type === 'magic');

  return (
    <div className="bg-ink-900 min-h-[100dvh] text-ink-100 flex flex-col">
      <header className="shrink-0 flex items-center gap-3 px-4 sm:px-6 py-3 border-b border-ink-700 bg-ink-900/95">
        <button type="button" onClick={onBack} className="px-3 py-2 rounded-lg bg-ink-800 border border-ink-600 text-ink-200 font-display font-bold hover:border-gold-400 hover:bg-ink-700 transition-colors flex items-center gap-1.5 btn-press">
          <ArrowLeft size={18} /> Atrás
        </button>
        <div><h1 className="font-display font-black text-gold-300 text-xl">Cartas</h1><p className="text-ink-400 text-xs">Todas las cartas y sus efectos</p></div>
      </header>

      <main className="flex-1 overflow-y-auto px-4 sm:px-6 py-5">
        <section className="max-w-7xl mx-auto space-y-7">
          <div>
            <h2 className="font-display font-bold text-azure-300 text-lg mb-3">Espadas y Bastos · Monstruos</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3 sm:gap-4">{monsters.map((card) => <CardReferenceItem key={card.id} card={card} />)}</div>
          </div>
          <div>
            <h2 className="font-display font-bold text-crimson-300 text-lg mb-3">Copas · Trampas</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3 sm:gap-4">{traps.map((card) => <CardReferenceItem key={card.id} card={card} />)}</div>
          </div>
          <div>
            <h2 className="font-display font-bold text-gold-300 text-lg mb-3">Oros · Mágicas</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3 sm:gap-4">{magics.map((card) => <CardReferenceItem key={card.id} card={card} />)}</div>
          </div>
        </section>
      </main>
    </div>
  );
}
