import { Sword, Shield, CheckCircle2, Sparkles } from 'lucide-react';
import type { Card, MonsterCard, TrapCard, MagicCard } from '@/game/cardData';
import { SUIT_COLORS } from '@/game/cardData';
import type { FieldMonster } from '@/game/types';
import { getEffectiveAtk, getEffectiveDef } from '@/game/types';

const SUIT_SYMBOL: Record<string, string> = {
  espadas: '⚔️',
  bastos: '🌿',
  copas: '🥂',
  oros: '🪙',
};

function suitColors(suit: string): { from: string; to: string; accent: string } {
  return SUIT_COLORS[suit as keyof typeof SUIT_COLORS] ?? SUIT_COLORS.espadas;
}

// Miniatura de carta asociada (Trampa o Mágica)
function AssociatedCardMiniature({ 
  card, 
  type, 
  hidden = false 
}: { 
  card: TrapCard | MagicCard; 
  type: 'trap' | 'magic';
  hidden?: boolean;
}) {
  const isTrap = type === 'trap';
  const bgGradient = isTrap 
    ? 'from-crimson-600 to-crimson-800' 
    : 'from-gold-500 to-gold-700';
  const borderColor = isTrap ? 'border-crimson-400/60' : 'border-gold-300/60';
  const textColor = isTrap ? 'text-white' : 'text-ink-900';
  
  return (
    <div 
      className={`absolute w-7 h-10 rounded-sm shadow-lg z-20 flex flex-col items-center justify-center border ${borderColor} bg-gradient-to-br ${bgGradient} ${hidden ? 'opacity-70' : ''}`}
      style={{ 
        top: '-4px',
        [isTrap ? 'right' : 'left']: '-4px',
      } as React.CSSProperties}
    >
      <span className={`text-[7px] font-bold ${textColor} leading-none`}>
        {isTrap ? 'T' : 'M'}
      </span>
      <span className={`text-[6px] ${textColor} leading-none mt-0.5`}>
        {hidden ? '?' : card.number}
      </span>
    </div>
  );
}

interface CardViewProps {
  card: Card;
  size?: 'sm' | 'md' | 'lg';
  onClick?: () => void;
  selected?: boolean;
  disabled?: boolean;
  faceDown?: boolean;
  isField?: boolean;
  fieldMonster?: FieldMonster;
  isOpponent?: boolean;
  showTrap?: boolean;
  showMagic?: boolean;
  className?: string;
  animateSummon?: boolean;
}

const sizeVars: Record<string, { w: string; h: string; text: string; num: string; emoji: string; bar: string }> = {
  sm: { w: 'var(--card-field-w)', h: 'var(--card-field-h)', text: 'var(--card-field-text)', num: 'var(--card-field-num)', emoji: 'var(--card-field-emoji)', bar: 'var(--card-field-bar)' },
  md: { w: 'var(--card-hand-w)', h: 'var(--card-hand-h)', text: 'var(--card-hand-text)', num: 'var(--card-hand-num)', emoji: 'var(--card-hand-emoji)', bar: 'var(--card-hand-bar)' },
  lg: { w: 'var(--card-detail-w)', h: 'var(--card-detail-h)', text: 'var(--card-detail-text)', num: 'var(--card-detail-num)', emoji: 'var(--card-detail-emoji)', bar: 'var(--card-detail-bar)' },
};

export function CardView({
  card,
  size = 'md',
  onClick,
  selected = false,
  disabled = false,
  faceDown = false,
  isField = false,
  fieldMonster,
  isOpponent = false,
  showTrap = false,
  showMagic = false,
  className = '',
  animateSummon = false,
}: CardViewProps) {
  const s = sizeVars[size];

  if (faceDown) {
    return (
      <div
        className="rounded-lg card-back border border-gold-700/40 shadow-card flex items-center justify-center transition-all duration-300 hover:scale-105"
        style={{ width: s.w, height: s.h }}
        onClick={onClick}
      >
        <div className="rounded-full border-2 border-gold-500/30 flex items-center justify-center"
          style={{ width: '30%', height: '30%' }}>
          <span className="text-gold-500/40 font-display" style={{ fontSize: '40%' }}>B</span>
        </div>
      </div>
    );
  }

  if (card.type === 'monster') {
    const mc = card as MonsterCard;
    const colors = suitColors(mc.suit);
    const accent = colors.accent;
    const atk = fieldMonster ? getEffectiveAtk(fieldMonster) : mc.atk;
    const def = fieldMonster ? getEffectiveDef(fieldMonster) : mc.def;
    const isDef = fieldMonster?.position === 'defense';
    const hasBuff = fieldMonster && (fieldMonster.tempAtkModifier !== 0 || fieldMonster.tempDefModifier !== 0);

    return (
      <div
        className={`rounded-lg border-2 shadow-card relative overflow-hidden cursor-pointer transition-all duration-300 ${
          selected ? 'ring-2 ring-gold-300 scale-105 shadow-glow z-10' : ''
        } ${disabled ? 'opacity-50' : 'hover:scale-105 hover:shadow-glow'} ${isDef ? 'rotate-0' : ''} ${animateSummon ? 'animate-card-summon' : ''} ${className}`}
        style={{
          width: s.w,
          height: s.h,
          borderColor: accent + '80',
          ['--card-bg-from' as string]: colors.from,
          ['--card-bg-to' as string]: colors.to,
          transform: isDef ? 'perspective(800px) rotateX(10deg)' : undefined,
        }}
        onClick={onClick}
      >
        <div className="card-face w-full h-full flex flex-col p-1 card-shine">
          <img src={card.image ?? `/cards/${card.suit}-${card.number}.webp`} alt="" aria-hidden="true" className="absolute inset-0 w-full h-full object-cover opacity-75" />
          <div className="flex justify-between items-start relative z-10">
            <span className="font-bold text-white text-shadow-strong leading-none" style={{ fontSize: s.num }}>{mc.number}</span>
            <span style={{ fontSize: s.text }}>{SUIT_SYMBOL[mc.suit]}</span>
            <span className="font-bold text-white text-shadow-strong leading-none" style={{ fontSize: s.num }}>{mc.number}</span>
          </div>
          <div className="flex-1 flex items-center justify-center relative z-10">
            <span style={{ fontSize: s.emoji }} className="drop-shadow-lg">{SUIT_SYMBOL[mc.suit]}</span>
          </div>
          <div className="text-center font-display font-semibold text-white/90 truncate px-0.5 relative z-10" style={{ fontSize: s.text }}>{mc.name}</div>
          <div className="flex justify-between items-start relative z-10">
            <span className="font-bold text-white text-shadow-strong leading-none" style={{ fontSize: s.num }}>{mc.number}</span>
            <span style={{ fontSize: s.text }}>{SUIT_SYMBOL[mc.suit]}</span>
            <span className="font-bold text-white text-shadow-strong leading-none" style={{ fontSize: s.num }}>{mc.number}</span>
          </div>
          <div className="flex justify-between items-center px-1 mt-0.5 relative z-10" style={{ height: s.bar }}>
            <div className="flex items-center gap-0.5">
              <Sword size={12} className="text-crimson-400" />
              <span className={`font-bold text-white ${hasBuff ? 'text-emerald-400' : ''}`} style={{ fontSize: s.text }}>{atk}</span>
            </div>
            <div className="flex items-center gap-0.5">
              <span className={`font-bold text-white ${hasBuff ? 'text-emerald-400' : ''}`} style={{ fontSize: s.text }}>{def}</span>
              <Shield size={12} className="text-azure-400" />
            </div>
          </div>
        </div>
        {/* Card type indicator */}
        <div className="card-type-indicator monster"></div>
        {/* Associated cards miniatures */}
        {showTrap && fieldMonster?.trap && (
          <AssociatedCardMiniature
            card={fieldMonster.trap}
            type="trap"
            hidden={!!(isOpponent && fieldMonster && !fieldMonster.trapRevealed)}
          />
        )}
        {showMagic && fieldMonster?.magic && (
          <AssociatedCardMiniature card={fieldMonster.magic} type="magic" />
        )}
        {isField && fieldMonster?.hasAttacked && (
          <div className="absolute top-1 left-1 z-20 flex items-center justify-center">
            <div className="bg-crimson-500 rounded-full p-0.5 shadow-lg ring-2 ring-crimson-300/50">
              <CheckCircle2 size={12} className="text-white" />
            </div>
          </div>
        )}
        {fieldMonster?.pendingEffect && (
          <div className="absolute bottom-0 left-0 px-1.5 py-0.5 bg-gradient-to-r from-violet-500/90 to-violet-600/90 rounded-tr-md shadow-lg z-20">
            <span className="text-[9px] text-white font-bold">{fieldMonster.pendingTurns}</span>
          </div>
        )}
        {hasBuff && (
          <div className="absolute top-1 right-1 z-20">
            <Sparkles size={10} className="text-emerald-400 animate-pulse" />
          </div>
        )}
      </div>
    );
  }

  if (card.type === 'trap') {
    const tc = card as TrapCard;
    const colors = suitColors('copas');
    return (
      <div
        className={`rounded-lg border-2 shadow-card relative overflow-hidden cursor-pointer transition-all duration-300 ${
          selected ? 'ring-2 ring-crimson-400 scale-105 shadow-glow-crimson' : ''
        } ${disabled ? 'opacity-50' : 'hover:scale-105 hover:shadow-glow-crimson'} ${className}`}
        style={{
          width: s.w,
          height: s.h,
          borderColor: colors.accent + '80',
          ['--card-bg-from' as string]: colors.from,
          ['--card-bg-to' as string]: colors.to,
        }}
        onClick={onClick}
      >
        <div className="card-face w-full h-full flex flex-col p-1 card-shine">
          <img src={card.image ?? `/cards/${card.suit}-${card.number}.webp`} alt="" aria-hidden="true" className="absolute inset-0 w-full h-full object-cover opacity-75" />
          <div className="flex justify-between items-start relative z-10">
            <span className="font-bold text-white text-shadow-strong leading-none" style={{ fontSize: s.num }}>{tc.number}</span>
            <span style={{ fontSize: s.text }}>🥂</span>
            <span className="font-bold text-white text-shadow-strong leading-none" style={{ fontSize: s.num }}>{tc.number}</span>
          </div>
          <div className="flex-1 flex items-center justify-center relative z-10">
            <span style={{ fontSize: s.emoji }} className="drop-shadow-lg">🥂</span>
          </div>
          <div className="text-center font-display font-semibold text-white/90 leading-tight relative z-10" style={{ fontSize: s.text }}>{tc.name}</div>
          <div className="flex justify-between items-start relative z-10">
            <span className="font-bold text-white text-shadow-strong leading-none" style={{ fontSize: s.num }}>{tc.number}</span>
            <span style={{ fontSize: s.text }}>🥂</span>
            <span className="font-bold text-white text-shadow-strong leading-none" style={{ fontSize: s.num }}>{tc.number}</span>
          </div>
        </div>
        {/* Card type indicator */}
        <div className="card-type-indicator trap"></div>
      </div>
    );
  }

  const mg = card as MagicCard;
  const colors = suitColors('oros');
  return (
    <div
      className={`rounded-lg border-2 shadow-card relative overflow-hidden cursor-pointer transition-all duration-300 ${
        selected ? 'ring-2 ring-gold-400 scale-105 shadow-glow' : ''
      } ${disabled ? 'opacity-50' : 'hover:scale-105 hover:shadow-glow'} ${className}`}
      style={{
        width: s.w,
        height: s.h,
        borderColor: colors.accent + '80',
        ['--card-bg-from' as string]: colors.from,
        ['--card-bg-to' as string]: colors.to,
      }}
      onClick={onClick}
    >
      <div className="card-face w-full h-full flex flex-col p-1 card-shine">
        <img src={card.image ?? `/cards/${card.suit}-${card.number}.webp`} alt="" aria-hidden="true" className="absolute inset-0 w-full h-full object-cover opacity-75" />
        <div className="flex justify-between items-start relative z-10">
          <span className="font-bold text-white text-shadow-strong leading-none" style={{ fontSize: s.num }}>{mg.number}</span>
          <span style={{ fontSize: s.text }}>🪙</span>
          <span className="font-bold text-white text-shadow-strong leading-none" style={{ fontSize: s.num }}>{mg.number}</span>
        </div>
        <div className="flex-1 flex items-center justify-center relative z-10">
          <span style={{ fontSize: s.emoji }} className="drop-shadow-lg">🪙</span>
        </div>
        <div className="text-center font-display font-semibold text-white/90 leading-tight relative z-10" style={{ fontSize: s.text }}>{mg.name}</div>
        <div className="flex justify-between items-start relative z-10">
          <span className="font-bold text-white text-shadow-strong leading-none" style={{ fontSize: s.num }}>{mg.number}</span>
          <span style={{ fontSize: s.text }}>🪙</span>
          <span className="font-bold text-white text-shadow-strong leading-none" style={{ fontSize: s.num }}>{mg.number}</span>
        </div>
      </div>
      {/* Card type indicator */}
      <div className="card-type-indicator magic"></div>
    </div>
  );
}

export function CardBack({ size = 'md' }: { size?: 'xs' | 'sm' | 'md' | 'lg' }) {
  const dimMap: Record<string, { w: string; h: string }> = {
    xs: { w: 'var(--card-back-w)', h: 'var(--card-back-h)' },
    sm: { w: 'var(--card-field-w)', h: 'var(--card-field-h)' },
    md: { w: 'var(--card-hand-w)', h: 'var(--card-hand-h)' },
    lg: { w: 'var(--card-detail-w)', h: 'var(--card-detail-h)' },
  };
  const d = dimMap[size];
  if (size === 'xs') {
    return <div className="rounded card-back border border-gold-700/40 shadow-card transition-all duration-300 hover:scale-110" style={{ width: d.w, height: d.h }} />;
  }
  return (
    <div className="rounded-lg card-back border border-gold-700/40 shadow-card flex items-center justify-center transition-all duration-300 hover:scale-105" style={{ width: d.w, height: d.h }}>
      <div className="rounded-full border-2 border-gold-500/30 flex items-center justify-center" style={{ width: '30%', height: '30%' }}>
        <span className="text-gold-500/40 font-display" style={{ fontSize: '40%' }}>B</span>
      </div>
    </div>
  );
}
