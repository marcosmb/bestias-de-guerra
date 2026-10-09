import { useState, useEffect, useMemo, useRef } from 'react';
import {
  Swords,
  Shield,
  Play,
  X,
  Eye,
  ChevronRight,
  Zap,
  AlertTriangle,
  Dices,
  RotateCw,
  LogOut,
  Sparkles,
  ZoomIn,
  Volume2,
  VolumeX,
  Copy,
  Check,
  Music,
} from 'lucide-react';
import type { Card, MonsterCard, TrapCard, MagicCard } from '@/game/cardData';
import type { Action, GameState, FieldMonster, PlayerState } from '@/game/types';
import { canActivateMagic, canAttack, hasOwnCopy, magicRequiredSide, cardInstanceKey, MAX_HAND_SIZE, MAX_CARDS_PER_TURN, getEffectiveAtk, getEffectiveDef } from '@/game/types';
import { legalActions, sameAction } from '@/game/legalActions';
import { CardView, CardBack } from './CardView';
import { playSound, vibrate, getAudioPreferences, setSoundEnabled, setVolume, initAudio } from '@/game/audio';
import { getTrap3CountingOrder } from '@/game/trapCounting';

interface GameBoardProps {
  state: GameState;
  dispatch: React.Dispatch<Action>;
  onExit: () => void;
  musicEnabled: boolean;
  onToggleMusic: () => void;
  // Para modo online: índice del jugador local (0 = host/player1, 1 = guest/player2)
  // En modo local/CPU no se usa (se determina por currentPlayer)
  localPlayerIndex?: 0 | 1;
}

// Mensaje temporal (toast)
interface ToastMessage {
  id: string;
  text: string;
  type: 'combat' | 'action' | 'info' | 'warning';
}

function ToastContainer({ messages }: { messages: ToastMessage[] }) {
  if (messages.length === 0) return null;

  const typeStyles = {
    combat: 'bg-crimson-900/90 border-crimson-500/50 text-crimson-200',
    action: 'bg-azure-900/90 border-azure-500/50 text-azure-200',
    info: 'bg-ink-800/90 border-ink-500/50 text-ink-200',
    warning: 'bg-gold-900/90 border-gold-500/50 text-gold-200',
  };

  return (
    <div className="fixed top-20 left-1/2 -translate-x-1/2 z-40 flex flex-col gap-1 pointer-events-none">
      {messages.map((msg) => (
        <div
          key={msg.id}
          className={`px-4 py-2 rounded-lg border shadow-lg animate-fade-in text-center ${typeStyles[msg.type]}`}
          style={{ fontSize: 'var(--ui-text-sm)' }}
        >
          {msg.text}
        </div>
      ))}
    </div>
  );
}

// Vista ampliada de carta
function CardZoomModal({ 
  card, 
  onClose,
  isOpponentCard = false,
  isHidden = false,
  fieldMonster = null
}: {
  card: Card | null;
  onClose: () => void;
  isOpponentCard?: boolean;
  isHidden?: boolean;
  fieldMonster?: FieldMonster | null;
}) {
  if (!card) return null;

  // Si la carta está oculta, mostrar reverso
  if (isHidden) {
    return (
      <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 px-4 animate-backdrop-fade" onClick={onClose}>
        <div className="bg-ink-700 rounded-2xl border-2 border-ink-500/50 p-6 max-w-xs w-full shadow-glow animate-scale-in text-center" onClick={(e) => e.stopPropagation()}>
          <div className="w-32 h-44 mx-auto mb-4 rounded-lg card-back border border-gold-700/40 shadow-card flex items-center justify-center">
            <div className="rounded-full border-2 border-gold-500/30 flex items-center justify-center" style={{ width: '30%', height: '30%' }}>
              <span className="text-gold-500/40 font-display text-2xl">B</span>
            </div>
          </div>
          <p className="text-ink-300 text-sm">Carta oculta</p>
          <p className="text-ink-400 text-xs mt-1">No puedes ver esta carta</p>
          <button
            onClick={onClose}
            className="mt-4 px-6 py-2 rounded-lg bg-ink-600 text-ink-200 font-display font-bold hover:bg-ink-500 btn-press"
          >
            Cerrar
          </button>
        </div>
      </div>
    );
  }

  const isMonster = card.type === 'monster';
  const isTrap = card.type === 'trap';
  const isMagic = card.type === 'magic';

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 px-4 animate-backdrop-fade" onClick={onClose}>
      <div className="bg-ink-700 rounded-2xl border-2 border-gold-500/50 p-4 max-w-sm w-full shadow-glow animate-scale-in" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-3">
          <h3 className="font-display font-bold text-gold-300">Vista ampliada</h3>
          <button onClick={onClose} className="text-ink-300 hover:text-white btn-press">
            <X size={20} />
          </button>
        </div>
        
        <div className="flex justify-center mb-4">
          <CardView
            card={card}
            size="lg"
            fieldMonster={fieldMonster ?? undefined}
            isField={Boolean(fieldMonster)}
            isOpponent={isOpponentCard}
            showTrap={Boolean(fieldMonster?.trap)}
            showMagic={Boolean(fieldMonster?.magic)}
          />
        </div>

        <div className="space-y-2 text-center">
          <p className="text-white font-display font-bold text-lg">{card.name}</p>
          <p className="text-ink-300 text-sm">
            {isMonster && (
              fieldMonster
                ? `Monstruo · ATQ ${getEffectiveAtk(fieldMonster)} / DEF ${getEffectiveDef(fieldMonster)}`
                : `Monstruo · ATQ ${(card as MonsterCard).atk} / DEF ${(card as MonsterCard).def}`
            )}
            {isTrap && `Trampa · ${(card as TrapCard).description}`}
            {isMagic && `Mágica · ${(card as MagicCard).description}`}
          </p>
          {fieldMonster?.magic && (
            <div className="mt-2 text-left rounded-lg border border-gold-500/20 bg-gold-900/10 px-3 py-2">
              <p className="text-gold-300 text-xs font-bold">Mágica asociada</p>
              <p className="text-white text-sm font-semibold mt-0.5">{fieldMonster.magic.name}</p>
              <p className="text-ink-300 text-xs mt-0.5">{fieldMonster.magic.description}</p>
            </div>
          )}
          {fieldMonster?.trap && (
            fieldMonster.trapRevealed || !isOpponentCard ? (
              <div className="mt-2 text-left rounded-lg border border-crimson-500/20 bg-crimson-900/10 px-3 py-2">
                <p className="text-crimson-300 text-xs font-bold">Trampa asociada</p>
                <p className="text-white text-sm font-semibold mt-0.5">{fieldMonster.trap.name}</p>
                <p className="text-ink-300 text-xs mt-0.5">{fieldMonster.trap.description}</p>
              </div>
            ) : (
              <div className="mt-2 text-left rounded-lg border border-ink-500/30 bg-ink-800/40 px-3 py-2">
                <p className="text-ink-300 text-xs font-bold">Trampa asociada</p>
                <p className="text-ink-400 text-xs mt-0.5">Trampa oculta · solo se revela al activarse o al ser descubierta por un ataque.</p>
              </div>
            )
          )}
          {isOpponentCard && (
            <p className="text-ink-400 text-xs mt-2">Carta del rival</p>
          )}
        </div>

        <button
          onClick={onClose}
          className="mt-4 w-full px-6 py-2 rounded-lg bg-gradient-to-r from-gold-500 to-gold-400 text-ink-900 font-display font-bold hover:from-gold-400 hover:to-gold-300 btn-press"
        >
          Cerrar
        </button>
      </div>
    </div>
  );
}

function LPBar({ player, isCurrent, animateDamage }: { player: PlayerState; isCurrent: boolean; animateDamage?: boolean }) {
  const pct = Math.max(0, Math.min(100, player.lp));
  const prevLp = useRef(player.lp);
  const [showDamage, setShowDamage] = useState(false);

  useEffect(() => {
    if (player.lp < prevLp.current) {
      setShowDamage(true);
      const timer = setTimeout(() => setShowDamage(false), 1000);
      prevLp.current = player.lp;
      return () => clearTimeout(timer);
    }
    prevLp.current = player.lp;
  }, [player.lp]);

  return (
    <div
      className={`flex items-center gap-2 ${isCurrent ? 'opacity-100' : 'opacity-60'} transition-opacity duration-300`}
      data-lp-player={player.index}
    >
      {isCurrent && (
        <div className="flex-shrink-0 w-3 h-3 rounded-full bg-gold-400 animate-pulse shadow-glow border-2 border-gold-300/50" />
      )}
      <span className="font-display font-bold whitespace-nowrap" style={{ fontSize: 'var(--ui-text-sm)' }}>
        <span className={isCurrent ? 'text-gold-300' : 'text-ink-300'}>{player.name}</span>
        {isCurrent && (
          <span className="ml-1 text-[10px] text-gold-400/80">(Tu turno)</span>
        )}
      </span>
      <div className="flex-1 rounded-full bg-ink-700 overflow-hidden border border-ink-500 relative" style={{ height: 'var(--lp-bar-h)' }}>
        <div
          className={`h-full rounded-full transition-all duration-700 ease-out ${
            pct > 50 ? 'bg-gradient-to-r from-emerald-600 to-emerald-400' : pct > 25 ? 'bg-gradient-to-r from-gold-600 to-gold-400' : 'bg-gradient-to-r from-crimson-600 to-crimson-400'
          } ${animateDamage ? 'animate-lp-damage' : ''}`}
          style={{ width: `${pct}%` }}
        />
        {showDamage && (
          <div className="absolute inset-0 bg-red-500/30 animate-pulse" />
        )}
      </div>
      <span className={`font-bold text-right tabular-nums transition-all duration-300 ${showDamage ? 'text-red-400 scale-110' : 'text-white'}`} style={{ fontSize: 'var(--ui-text-sm)', minWidth: '2.5em' }}>
        {player.lp}
      </span>
    </div>
  );
}

function FieldSlot({
  fm,
  isOpponent,
  onClick,
  selectable,
  showTrap,
  showMagic,
  animateSummon,
  onZoom,
  attackTarget = false,
  trapTargetSelected = false,
  trapCounting = false,
  fieldPlayer,
  slotIndex,
}: {
  fm: FieldMonster | null;
  isOpponent: boolean;
  onClick?: () => void;
  selectable?: boolean;
  showTrap?: boolean;
  showMagic?: boolean;
  animateSummon?: boolean;
  onZoom?: (card: Card, fieldMonster: FieldMonster, isOpponentCard: boolean, isHidden: boolean) => void;
  attackTarget?: boolean;
  trapTargetSelected?: boolean;
  trapCounting?: boolean;
  fieldPlayer: 0 | 1;
  slotIndex: number;
}) {
  if (!fm) {
    return (
      <div
        className="rounded-lg border-2 border-dashed flex items-center justify-center transition-all duration-300"
        style={{ width: 'var(--card-field-w)', height: 'var(--card-field-h)' }}
        data-field-slot={`p${fieldPlayer}-${slotIndex}`}
        onClick={onClick}
      >
        <span className={`text-gold-400/40 transition-all duration-300 ${selectable ? 'border-gold-400/60 bg-gold-400/5 animate-pulse scale-110' : 'border-ink-500/40'}`} style={{ fontSize: 'var(--ui-text-sm)' }}>
          {selectable ? '+' : ''}
        </span>
      </div>
    );
  }
  return (
    <div
      className={`relative z-20 hover:z-50 ${fm.position === 'defense' ? 'rotate-90 scale-[0.8]' : ''} transition-transform duration-300`}
      data-field-slot={`p${fieldPlayer}-${slotIndex}`}
      data-field-uid={fm.uid}
    >
      <CardView
        card={fm.card}
        size="sm"
        faceDown={isOpponent && fm.faceDown}
        isField
        fieldMonster={fm}
        isOpponent={isOpponent}
        showTrap={showTrap}
        showMagic={showMagic}
        onClick={onClick}
        animateSummon={animateSummon}
        className={
          attackTarget
            ? 'ring-4 ring-crimson-300 animate-pulse shadow-[0_0_24px_rgba(248,113,113,0.9)] scale-110'
            : trapCounting
              ? 'ring-4 ring-gold-200 shadow-[0_0_34px_rgba(250,204,21,1)] brightness-125 scale-110'
              : trapTargetSelected
                ? 'ring-4 ring-gold-300 shadow-[0_0_24px_rgba(250,204,21,0.8)] scale-105'
                : selectable
                ? 'ring-2 ring-gold-300 animate-pulse shadow-glow scale-105'
                : ''
        }
      />
      {/* Zoom button for field cards */}
      {onZoom && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onZoom(fm.card, fm, isOpponent, Boolean(isOpponent && fm.faceDown));
          }}
          className="absolute -top-1 -right-1 w-4 h-4 bg-ink-700/90 rounded-full hidden md:flex items-center justify-center text-ink-300 hover:text-white hover:bg-ink-600 z-30 border border-ink-500/50"
          title={isOpponent ? "Ver carta rival" : "Ampliar carta"}
        >
          <ZoomIn size={8} />
        </button>
      )}
    </div>
  );
}

function TurnBanner({ playerName, turnCount }: { playerName: string; turnCount: number }) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    setVisible(true);
    const timer = setTimeout(() => setVisible(false), 2000);
    return () => clearTimeout(timer);
  }, [turnCount, playerName]);

  if (!visible) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none">
      <div className="animate-turn-banner bg-ink-800/90 border-2 border-gold-500/50 rounded-2xl px-8 py-4 shadow-glow">
        <p className="font-display font-bold text-gold-300 text-xl text-center">
          {turnCount === 0 ? 'Empieza ' + playerName : 'Turno de ' + playerName}
        </p>
        <p className="text-ink-400 text-sm text-center mt-1">
          {turnCount === 0 ? 'Primer turno' : 'Turno ' + (turnCount + 1)}
        </p>
      </div>
    </div>
  );
}

function DamageFloat({ damage, playerIdx }: { damage: number; playerIdx: 0 | 1 }) {
  if (damage <= 0) return null;
  return (
    <div className={`fixed z-50 pointer-events-none ${playerIdx === 0 ? 'bottom-[35%] left-1/2 -translate-x-1/2' : 'top-[15%] left-1/2 -translate-x-1/2'}`}>
      <div className="animate-float-damage font-display font-black text-red-400 text-4xl text-shadow-strong">
        -{damage} PV
      </div>
    </div>
  );
}

// Animación de combate
function CombatAnimation({
  combatState,
  onComplete
}: {
  combatState: {
    attackerUid: string;
    defenderUid: string;
    isDirectAttack: boolean;
    result: 'attacker-destroyed' | 'defender-destroyed' | 'both-destroyed' | 'none-destroyed';
    attackerPlayer?: 0 | 1;
    attackerSlot?: number;
    defenderPlayer?: 0 | 1;
    defenderSlot?: number;
  } | null;
  onComplete: () => void;
}) {
  const [phase, setPhase] = useState<'attack' | 'impact' | 'result'>('attack');
  const onCompleteRef = useRef(onComplete);

  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);
  const [visible, setVisible] = useState(true);
  const [anchors, setAnchors] = useState<{
    from: { x: number; y: number };
    to: { x: number; y: number };
  } | null>(null);

  useEffect(() => {
    if (!combatState) {
      setVisible(false);
      return;
    }

    // Cada combate es una nueva animación, incluso si el mismo Monstruo vuelve
    // a atacar en otro turno. El componente permanece montado entre combates,
    // por lo que hay que reiniciar explícitamente su estado visual.
    setPhase('attack');
    setVisible(true);
    setAnchors(null);

    const attackTimer = setTimeout(() => setPhase('impact'), 900);
    const impactTimer = setTimeout(() => setPhase('result'), 1350);
    const completeTimer = setTimeout(() => {
      setVisible(false);
      onCompleteRef.current();
    }, 3200);

    const getCenter = (selector: string, fallback: { x: number; y: number }) => {
      const element = document.querySelector(selector) as HTMLElement | null;
      if (!element) return fallback;
      const rect = element.getBoundingClientRect();
      return {
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2,
      };
    };

    const attackerPlayer = combatState.attackerPlayer ?? 0;
    const defenderPlayer = combatState.defenderPlayer ?? (attackerPlayer === 0 ? 1 : 0);

    const attackerFallback = {
      x: window.innerWidth / 2,
      y: attackerPlayer === 1 ? window.innerHeight * 0.72 : window.innerHeight * 0.28,
    };
    const defenderFallback = {
      x: window.innerWidth / 2,
      y: combatState.isDirectAttack
        ? (defenderPlayer === 1 ? window.innerHeight * 0.16 : window.innerHeight * 0.84)
        : (defenderPlayer === 1 ? window.innerHeight * 0.28 : window.innerHeight * 0.72),
    };

    const fromSelector = combatState.attackerSlot !== undefined
      ? `[data-field-slot="p${attackerPlayer}-${combatState.attackerSlot}"]`
      : `[data-field-uid="${combatState.attackerUid}"]`;

    const toSelector = combatState.isDirectAttack
      ? `[data-lp-player="${defenderPlayer}"]`
      : combatState.defenderSlot !== undefined
        ? `[data-field-slot="p${defenderPlayer}-${combatState.defenderSlot}"]`
        : `[data-field-uid="${combatState.defenderUid}"]`;

    setAnchors({
      from: getCenter(fromSelector, attackerFallback),
      to: getCenter(toSelector, defenderFallback),
    });

    return () => {
      clearTimeout(attackTimer);
      clearTimeout(impactTimer);
      clearTimeout(completeTimer);
    };
  }, [combatState]);

  if (!combatState || !visible) return null;

  const attackerPlayer = combatState.attackerPlayer ?? 0;
  const defenderPlayer = combatState.defenderPlayer ?? (attackerPlayer === 0 ? 1 : 0);
  const from = anchors?.from ?? {
    x: window.innerWidth / 2,
    y: attackerPlayer === 1 ? window.innerHeight * 0.72 : window.innerHeight * 0.28,
  };
  const to = anchors?.to ?? {
    x: window.innerWidth / 2,
    y: combatState.isDirectAttack
      ? (defenderPlayer === 1 ? window.innerHeight * 0.16 : window.innerHeight * 0.84)
      : (defenderPlayer === 1 ? window.innerHeight * 0.28 : window.innerHeight * 0.72),
  };

  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.max(24, Math.hypot(dx, dy));
  const angle = Math.atan2(dy, dx) * 180 / Math.PI - 90;

  return (
    <div className="fixed inset-0 z-30 pointer-events-none overflow-hidden">
      {phase === 'attack' && (
        <div
          className="absolute"
          style={{
            left: from.x,
            top: from.y,
            width: 12,
            height: length,
            transform: `translateX(-50%) rotate(${angle}deg)`,
            transformOrigin: '50% 0%',
          }}
        >
          <div className="combat-attack-trail" />
          <div className="combat-attack-core" />
        </div>
      )}

      {phase === 'impact' && (
        <div
          className="absolute combat-impact-burst"
          style={{ left: to.x, top: to.y }}
        >
          <div className="absolute -inset-8 rounded-full bg-crimson-400/30 blur-xl animate-ping" />
          <div className="relative w-28 h-28 rounded-full border-4 border-crimson-200/95 bg-crimson-400/30 shadow-[0_0_80px_rgba(248,113,113,0.95)]">
            <div className="absolute inset-3 rounded-full border-2 border-white/90" />
            <div className="absolute inset-7 rounded-full bg-white/80 blur-md animate-pulse" />
          </div>
          {combatState.isDirectAttack && (
            <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 whitespace-nowrap">
              <div className="font-display font-black text-3xl text-red-300 text-shadow-strong">
                ¡IMPACTO!
              </div>
            </div>
          )}
        </div>
      )}

      {phase === 'result' && (
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-40">
          <div className={
            'px-6 py-3 rounded-xl font-display font-black text-xl sm:text-2xl whitespace-nowrap animate-combat-result border-2 ' +
            (
              combatState.result === 'both-destroyed' ||
              combatState.result === 'attacker-destroyed' ||
              combatState.result === 'defender-destroyed'
                ? 'bg-crimson-950/95 text-crimson-100 border-crimson-400/70 shadow-[0_0_35px_rgba(248,113,113,0.55)]'
                : 'bg-ink-800/95 text-ink-100 border-ink-400/60 shadow-xl'
            )
          }>
            {combatState.result === 'both-destroyed' && '¡Ambos destruidos!'}
            {combatState.result === 'attacker-destroyed' && '¡Atacante destruido!'}
            {combatState.result === 'defender-destroyed' && '¡Defensor destruido!'}
            {combatState.result === 'none-destroyed' && '¡Sin destrucción!'}
          </div>
        </div>
      )}
    </div>
  );
}

export function GameBoard({ state, dispatch, onExit, musicEnabled, onToggleMusic, localPlayerIndex }: GameBoardProps) {
  const [showLog, setShowLog] = useState(false);
  const [logCopied, setLogCopied] = useState(false);
  const [confirmExit, setConfirmExit] = useState(false);
  /*
   * Carta seleccionada de la mano, identificada por su IDENTIDAD DE INSTANCIA.
   *
   * No puede usarse `card.id`: la Mágica 2 puede robar la copia del rival y dejar
   * en la mano dos cartas con el mismo `id` (p. ej. la Araña de cada jugador).
   * Con `id` las dos se seleccionarían a la vez y `find` devolvería siempre la
   * primera, sería imposible jugar la segunda y el resaltado sería ambiguo.
   */
  const [selectedHandCard, setSelectedHandCard] = useState<string | null>(null);
  const selectedCardPanelRef = useRef<HTMLDivElement>(null);
  const [selectedFieldUid, setSelectedFieldUid] = useState<string | null>(null);
  const [summonedUids, setSummonedUids] = useState<Set<string>>(new Set());
  const [lastCombat, setLastCombat] = useState<{ damage: number; player: 0 | 1 } | null>(null);
  const [zoomCard, setZoomCard] = useState<{
    card: Card | null;
    fieldMonster?: FieldMonster | null;
    isOpponentCard?: boolean;
    isHidden?: boolean;
  } | null>(null);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const passiveLpRef = useRef<[number, number]>([state.players[0].lp, state.players[1].lp]);
  const handScrollRef = useRef<HTMLDivElement>(null);
  const [liftDown, setLiftDown] = useState(false);
  const handSize = state.players[state.mode === 'cpu' ? 0 : state.currentPlayer].hand.length;

  /*
   * Dirección de elevación adaptativa para las cartas de la mano.
   *
   * Una carta en primer plano se amplía hacia arriba por defecto. Cuando el
   * borde superior del contenedor de la mano queda tan cerca del borde real de
   * la pantalla que la ampliación no cabe, se marca la carta con `lift-down`
   * para que la ampliación ocurra hacia abajo. El tamaño y la sombra no cambian:
   * sólo la dirección, de modo que la carta siempre se ve completa.
   *
   * Se recalcula al redimensionar la ventana y al cambiar la mano, porque las
   * cartas de la mano se centran y su posición depende del número de cartas.
   */
  useEffect(() => {
    const update = () => {
      const strip = handScrollRef.current;
      if (!strip) return;
      const stripRect = strip.getBoundingClientRect();
      // Un elemento por COPIA de carta: con dos cartas del mismo `id` en la mano
      // (Mágica 2) `data-card-id` se repite, así que se mide por instancia.
      const cards = strip.querySelectorAll<HTMLElement>('[data-card-instance]');
      let needsDown = false;
      cards.forEach((el) => {
        const r = el.getBoundingClientRect();
        const roomAbove = r.top - stripRect.top;
        const roomBelow = stripRect.bottom - r.bottom;
        // La ampliación necesita ~35 % del ancho de carta de espacio libre.
        const needed = r.width * 0.35;
        if (roomAbove < needed && roomBelow >= needed) needsDown = true;
      });
      setLiftDown(needsDown);
    };
    update();
    window.addEventListener('resize', update);
    window.addEventListener('orientationchange', update);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('orientationchange', update);
    };
  }, [handSize, selectedHandCard]);

  const [combatAnim, setCombatAnim] = useState<{
    attackerUid: string;
    defenderUid: string;
    isDirectAttack: boolean;
    result: 'attacker-destroyed' | 'defender-destroyed' | 'both-destroyed' | 'none-destroyed';
    attackerPlayer?: 0 | 1;
    attackerCard?: MonsterCard;
    defenderCard?: MonsterCard;
  } | null>(null);

  const [trapCountAnimation, setTrapCountAnimation] = useState<{
    roll: number;
    sequence: { uid: string; name: string }[];
    step: number;
  } | null>(null);

  // Conserva la última casilla conocida de cada Monstruo para las animaciones.
  const combatSlotByUidRef = useRef(new Map<string, { player: 0 | 1; slot: number }>());
  useEffect(() => {
    state.players.forEach((player) => {
      player.field.forEach((fm, slot) => {
        if (fm) combatSlotByUidRef.current.set(fm.uid, { player: player.index, slot });
      });
    });
  }, [state.players]);

  useEffect(() => {
    if (!selectedHandCard && !selectedFieldUid) return;

    const handleOutsidePointerDown = (event: PointerEvent) => {
      const panel = selectedCardPanelRef.current;
      if (panel && !panel.contains(event.target as Node)) {
        setSelectedHandCard(null);
        setSelectedFieldUid(null);
      }
    };

    document.addEventListener('pointerdown', handleOutsidePointerDown);
    return () => document.removeEventListener('pointerdown', handleOutsidePointerDown);
  }, [selectedHandCard, selectedFieldUid]);
  const copyGameLog = async () => {
    const text = state.log.join('\n');

    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.focus();
        textarea.select();
        document.execCommand('copy');
        textarea.remove();
      }

      setLogCopied(true);
      window.setTimeout(() => setLogCopied(false), 1600);
    } catch {
      setLogCopied(false);
      addToast('No se ha podido copiar el registro.', 'warning');
    }
  };

  const [soundEnabled, setSoundEnabledState] = useState(true);
  const [volume, setVolumeState] = useState(0.5);
  const [showVolumeControl, setShowVolumeControl] = useState(false);

  // En móviles, la UI del navegador (por ejemplo la barra inferior de Brave)
  // puede ocupar parte del viewport visual. Medimos la diferencia entre el
  // layout viewport y el visual viewport para reservar ese espacio en la barra
  // de acciones inferior, manteniendo sus controles por encima de esa UI.
  useEffect(() => {
    const viewport = window.visualViewport;
    const root = document.documentElement;

    const updateBrowserBottomInset = () => {
      if (!viewport) {
        root.style.setProperty('--browser-bottom-inset', '0px');
        return;
      }

      const bottomInset = Math.max(
        0,
        window.innerHeight - (viewport.offsetTop + viewport.height),
      );
      root.style.setProperty('--browser-bottom-inset', Math.ceil(bottomInset) + 'px');
    };

    updateBrowserBottomInset();
    window.addEventListener('resize', updateBrowserBottomInset);
    viewport?.addEventListener('resize', updateBrowserBottomInset);
    viewport?.addEventListener('scroll', updateBrowserBottomInset);

    return () => {
      window.removeEventListener('resize', updateBrowserBottomInset);
      viewport?.removeEventListener('resize', updateBrowserBottomInset);
      viewport?.removeEventListener('scroll', updateBrowserBottomInset);
      root.style.removeProperty('--browser-bottom-inset');
    };
  }, []);

  // Inicializar audio
  useEffect(() => {
    initAudio();
    const prefs = getAudioPreferences();
    setSoundEnabledState(prefs.enabled);
    setVolumeState(prefs.volume);
  }, []);

  const cp = state.currentPlayer;
  const isCpuTurn = state.mode === 'cpu' && cp === 1;
  // En modo online, el espectador es el jugador local (fijo), no el currentPlayer
  const viewer = state.mode === 'online' 
    ? (localPlayerIndex ?? 0) 
    : (state.mode === 'cpu' ? 0 : cp);
  const me = state.players[viewer];
  const opp = state.players[viewer === 0 ? 1 : 0];
  const sel = state.selection;

  const canPlayMore = me.cardsPlayedThisTurn < MAX_CARDS_PER_TURN;
  const attackAllowed = canAttack(state);

  // ==========================================================================
  // FUENTE ÚNICA DE LEGALIDAD (F1)
  // ==========================================================================
  //
  // Antes esta pantalla maintainía su propia copia de las reglas de legalidad
  // (`canPlayMore`, `me.field.some(f => f === null)`, `isMySlotSelectable`,
  // `isOpponentSlotSelectable`…), que era la TERCERA fuente de verdad después
  // del reducer y de los predicados de `types.ts`. Cada vez que cambiaba una
  // regla había que acordarse de los tres sitios.
  //
  // Ahora todo se consulta a `legalActions(state, cp)`, la misma función que
  // usan la CPU y que usará el servidor. Si aquí se ofrece una jugada, es que
  // el reducer la acepta; y si el reducer la rechaza, aquí no se ofrece.
  //
  // OJO: se consulta al JUGADOR EN TURNO (`cp`), no al que se está mirando
  // (`viewer`). En modo contra la CPU, durante el turno de la CPU la mano que
  // se ve es la del humano, pero las jugadas disponibles no son suyas.
  const legal = useMemo(() => legalActions(state, cp), [state, cp]);
  const isLegal = (action: Action): boolean => legal.some((candidate) => sameAction(candidate, action));

  /** ¿Hay alguna carta jugable ahora mismo? (Regla 16) */
  const canPlayCard = legal.some(
    (a) => a.type === 'SUMMON_MONSTER' || a.type === 'SELECT_TRAP_PLACE' || a.type === 'SELECT_MAGIC',
  );

  /** Motivo corto y entendible cuando una Trampa o Mágica está deshabilitada. */
  const getUnavailableCardReason = (card: Card): string | null => {
    if (state.currentPlayer !== viewer) return 'No es tu turno.';
    if (me.cardsPlayedThisTurn >= MAX_CARDS_PER_TURN) {
      return `Ya has jugado las ${MAX_CARDS_PER_TURN} cartas de este turno.`;
    }

    if (card.type === 'trap') {
      if (!me.field.some((fm) => fm !== null)) return 'No tienes Monstruos en tu campo.';
      return me.field.some((fm) => fm !== null && fm.trap === null)
        ? null
        : 'Todos tus Monstruos ya tienen una Trampa asociada.';
    }

    if (card.type !== 'magic') return null;
    if (canActivateMagic(me, state, card)) return null;

    switch (card.effect.kind) {
      case 'steal_hand_card':
        if (me.hand.length >= MAX_HAND_SIZE) return 'Tu mano está llena.';
        return 'El rival no tiene cartas en la mano.';
      case 'revive_monster': {
        const ownGraveMonsters = me.graveyard.filter((c) => c.type === 'monster');
        if (ownGraveMonsters.length === 0) return 'No tienes Monstruos en el cementerio.';
        const canGoToHand =
          me.hand.length < MAX_HAND_SIZE &&
          ownGraveMonsters.some((c) => !hasOwnCopy(me.hand, c));
        const canGoToField = me.field.some((fm) => fm === null);
        if (!canGoToHand && !canGoToField) return 'No tienes espacio en la mano ni en el campo.';
        return 'Ya tienes esas cartas en tu mano.';
      }
      case 'direct_attack':
      case 'atk_boost':
      case 'dice_protection':
        return 'Todos tus Monstruos tienen una Mágica asociada.';
      case 'def_reduce':
        return 'Los Monstruos rivales tienen una Mágica asociada.';
      default:
        return 'Ahora mismo no se puede utilizar esta Mágica.';
    }
  };

  // Track newly summoned monsters for animation
  useEffect(() => {
    const currentUids = new Set(me.field.filter(Boolean).map((f) => f!.uid));
    const newUids = new Set([...currentUids].filter((uid) => !summonedUids.has(uid)));
    if (newUids.size > 0) {
      setSummonedUids(currentUids);
    }
  }, [me.field]);

  // Sonido de inicio de turno — se dispara una sola vez por cambio de turno.
  // Se usa un ref para no depender de re-renders (evita sonidos duplicados).
  const lastTurnSoundRef = useRef(-1);
  useEffect(() => {
    if (state.phase !== 'playing') return;
    if (state.turnCount === lastTurnSoundRef.current) return;
    lastTurnSoundRef.current = state.turnCount;
    playSound('turn-start');
  }, [state.turnCount, state.phase, cp]);

  // Trampa 3: el conteo avanza lentamente por los Monstruos del campo.
  // El resultado se decide al pulsar "Tirar", pero la destrucción se aplica solo
  // cuando la animación termina.
  useEffect(() => {
    if (!trapCountAnimation) return;

    const timer = window.setTimeout(() => {
      setTrapCountAnimation((current) => {
        if (!current) return current;
        if (current.step >= current.sequence.length - 1) {
          dispatch({ type: 'ROLL_DICE', roll: current.roll });
          return null;
        }
        return { ...current, step: current.step + 1 };
      });
    }, 850);

    return () => window.clearTimeout(timer);
  }, [trapCountAnimation, dispatch]);

  // Avisos de efectos pasivos de las Trampas 1 (+5 PV) y 12 (-5 PV).
  //
  // La identidad de la Trampa NO se muestra aquí mientras permanezca oculta.
  // El objetivo es informar SIEMPRE de que los PV han cambiado sin revelar
  // qué carta está provocando el efecto ni sobre qué Monstruo está colocada.
  //
  // Se sigue la referencia del array de log y no su longitud: el log conserva
  // como máximo 50 entradas y, cuando llega a ese límite, su longitud deja de
  // aumentar. Comparar el array garantiza que un efecto pasivo posterior no
  // quede sin aviso.
  const passiveLogRef = useRef(state.log);
  useEffect(() => {
    if (state.log !== passiveLogRef.current) {
      const latestEntry = state.log[state.log.length - 1] ?? '';
      const passiveEffectHappened =
        latestEntry.includes('por su efecto continuo') ||
        latestEntry.includes('Una Trampa activa te hace recuperar') ||
        latestEntry.includes('Una Trampa activa hace perder') ||
        latestEntry.includes('Su efecto empieza inmediatamente: el rival pierde');

      if (passiveEffectHappened) {
        const viewerLp = state.players[viewer].lp;
        const rivalIndex = viewer === 0 ? 1 : 0;
        const rivalLp = state.players[rivalIndex].lp;
        const previousViewerLp = passiveLpRef.current[viewer];
        const previousRivalLp = passiveLpRef.current[rivalIndex];
        const viewerDelta = viewerLp - previousViewerLp;
        const rivalDelta = rivalLp - previousRivalLp;

        // Avisamos de cada cambio relevante desde la perspectiva del jugador,
        // sin revelar la identidad de la Trampa mientras siga oculta.
        if (viewerDelta > 0) {
          addToast(`Has ganado ${viewerDelta} PV por un efecto continuo.`, 'info');
        } else if (viewerDelta < 0) {
          addToast(`Pierdes ${Math.abs(viewerDelta)} PV por un efecto continuo.`, 'combat');
        }

        if (rivalDelta > 0) {
          addToast(`El rival gana ${rivalDelta} PV por un efecto continuo.`, 'info');
        } else if (rivalDelta < 0) {
          addToast(`El rival pierde ${Math.abs(rivalDelta)} PV por un efecto continuo.`, 'combat');
        }
      }
    }

    passiveLogRef.current = state.log;
    passiveLpRef.current = [state.players[0].lp, state.players[1].lp];
  }, [state.log, state.players[0].lp, state.players[1].lp, viewer]);

  // Deduplicar efectos visuales, sonidos y mensajes para cada ataque real.
  const processedCombatIdsRef = useRef<Set<string>>(new Set());

  // Track combat for damage float, toast messages and combat animation
  useEffect(() => {
    if (state.lastCombat) {
      const combatId = state.lastCombat.combatId ?? String(state.turnCount) + ':' + (state.lastCombat.attackerUid ?? 'attacker') + ':' + (state.lastCombat.defenderUid ?? 'defender') + ':' + state.lastCombat.log;
      if (processedCombatIdsRef.current.has(combatId)) return;
      processedCombatIdsRef.current.add(combatId);
      if (processedCombatIdsRef.current.size > 200) {
        const oldest = processedCombatIdsRef.current.values().next().value;
        if (oldest) processedCombatIdsRef.current.delete(oldest);
      }

      const { attackerDamage, defenderDamage, attackerDestroyed, defenderDestroyed } = state.lastCombat;
      
      // Determine combat result for animation
      let result: 'attacker-destroyed' | 'defender-destroyed' | 'both-destroyed' | 'none-destroyed';
      if (attackerDestroyed && defenderDestroyed) {
        result = 'both-destroyed';
      } else if (attackerDestroyed) {
        result = 'attacker-destroyed';
      } else if (defenderDestroyed) {
        result = 'defender-destroyed';
      } else {
        result = 'none-destroyed';
      }
      
      // Show combat animation
      const attackerUid = state.lastCombat.attackerUid ?? 'attacker';
      const defenderUid = state.lastCombat.defenderUid ?? 'defender';
      const attackerPlayer = state.lastCombat.attackerPlayer ?? state.currentPlayer;
      const attackerSlot = combatSlotByUidRef.current.get(attackerUid);
      const defenderSlot = combatSlotByUidRef.current.get(defenderUid);

      setCombatAnim({
        attackerUid,
        defenderUid,
        isDirectAttack: defenderUid.startsWith('lp-'),
        attackerPlayer,
        attackerSlot: attackerSlot?.slot,
        defenderPlayer: defenderSlot?.player,
        defenderSlot: defenderSlot?.slot,
        result,
      });

      // Sonido de ataque (sincronizado con el inicio de la animación)
      playSound('attack');
      vibrate(40);

      // Sonido de destrucción (coincide con el resultado real del reducer)
      if (attackerDestroyed || defenderDestroyed) {
        setTimeout(() => playSound('destroy'), 300);
        setTimeout(() => vibrate(60), 300);
      }

      // Sonido de daño (solo si el juego calcula daño real)
      const totalDamage = attackerDamage + defenderDamage;
      if (totalDamage > 0) {
        setTimeout(() => playSound('damage'), 600);
      }

      // Mensaje de combate contextualizado según quién controla cada Monstruo.
      // El jugador local se determina por el índice real del atacante, no por
      // palabras como "Pierdes" dentro del texto.
      const combatAttackerPlayer = state.lastCombat.attackerPlayer ?? state.currentPlayer;
      const attackerIsMe = combatAttackerPlayer === viewer;
      const defenderIsMe = !attackerIsMe;
      const attackerName = state.lastCombat.attackerCard?.name ?? 'Monstruo';
      const defenderName = state.lastCombat.defenderCard?.name ?? 'Monstruo';
      let contextualCombatLog = state.lastCombat.log;
      contextualCombatLog = contextualCombatLog.replace(
        attackerName,
        attackerIsMe ? `Tu ${attackerName}` : `El ${attackerName} rival`,
      );
      if (state.lastCombat.defenderCard?.name) {
        contextualCombatLog = contextualCombatLog.replace(
          defenderName,
          defenderIsMe ? `tu ${defenderName}` : `el ${defenderName} rival`,
        );
      }
      addToast(contextualCombatLog, 'combat');

      // Mensajes de daño usando los índices reales de atacante/defensor.
      if (defenderDamage > 0) {
        addToast(
          defenderIsMe ? `¡-${defenderDamage} PV! Has perdido vida` : `¡-${defenderDamage} PV al rival!`,
          'combat',
        );
      }
      if (attackerDamage > 0) {
        addToast(
          attackerIsMe ? `¡-${attackerDamage} PV! Has perdido vida` : `¡-${attackerDamage} PV al rival!`,
          'combat',
        );
      }
            // Show damage for the player who received it
      if (defenderDamage > 0) {
        // Defender received damage
        setLastCombat({ damage: defenderDamage, player: defenderIsMe ? viewer : (viewer === 0 ? 1 : 0) as 0 | 1 });
        setTimeout(() => setLastCombat(null), 1000);
      } else if (attackerDamage > 0) {
        // Attacker received damage
        setLastCombat({ damage: attackerDamage, player: attackerIsMe ? viewer : (viewer === 0 ? 1 : 0) as 0 | 1 });
        setTimeout(() => setLastCombat(null), 1000);
      }
    }
  }, [state.lastCombat, state.turnCount, viewer]);

  const handleHandCardClick = (card: Card) => {
    setSelectedFieldUid(null);
    // La selección apunta a UNA COPIA, no a un tipo de carta.
    const key = cardInstanceKey(card);
    if (selectedHandCard === key) {
      setSelectedHandCard(null);
    } else {
      setSelectedHandCard(key);
    }
  };

  const handleCardZoom = (
    card: Card | null,
    isOpponentCard = false,
    isHidden = false,
    fieldMonster: FieldMonster | null = null,
  ) => {
    if (card) {
      setZoomCard({ card, fieldMonster, isOpponentCard, isHidden });
    } else {
      setZoomCard(null);
    }
  };

  const addToast = (text: string, type: ToastMessage['type'] = 'info') => {
    const id = Math.random().toString(36).slice(2, 9);
    setToasts((prev) => [...prev.slice(-2), { id, text, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3000);
  };

  const toggleSound = () => {
    const newValue = !soundEnabled;
    setSoundEnabledState(newValue);
    setSoundEnabled(newValue);
  };

  const changeVolume = (newVolume: number) => {
    setVolumeState(newVolume);
    setVolume(newVolume);
  };

  const handlePlayMonster = (card: MonsterCard, position: 'attack' | 'defense') => {
    if (!isLegal({ type: 'SUMMON_MONSTER', card, position })) return;
    playSound('play-card');
    vibrate(30);
    dispatch({ type: 'SUMMON_MONSTER', card, position });
    setSelectedHandCard(null);
  };

  const handlePlayTrap = (card: TrapCard) => {
    if (!isLegal({ type: 'SELECT_TRAP_PLACE', card })) return;
    playSound('place-trap');
    vibrate(30);
    dispatch({ type: 'SELECT_TRAP_PLACE', card });
    setSelectedHandCard(null);
  };

  const handlePlayMagic = (card: MagicCard) => {
    if (!isLegal({ type: 'SELECT_MAGIC', card })) return;
    playSound('activate-magic');
    vibrate(30);
    dispatch({ type: 'SELECT_MAGIC', card });
    setSelectedHandCard(null);
  };

  const handleOpponentFieldClick = (uid: string) => {
    if (sel.kind === 'attack' || sel.kind === 'attack-or-direct') {
      const target = opp.field.find((fm) => fm?.uid === uid) ?? null;
      const attacker = me.field.find((fm) => fm?.uid === sel.attackerUid) ?? null;
      const attackAction = {
        type: 'DECLARE_ATTACK' as const,
        attackerUid: sel.attackerUid,
        defenderUid: uid,
      };

      if (!isLegal(attackAction)) {
        addToast('¡Jugada errónea! Ese Monstruo no puede ser objetivo de este ataque.', 'warning');
        return;
      }

      dispatch(attackAction);
    } else if (sel.kind === 'place-magic') {
      const action = { type: 'PLACE_MAGIC_ON_MONSTER' as const, card: sel.card, side: 'enemy' as const, fieldUid: uid };
      if (!isLegal(action)) {
        addToast('¡Jugada errónea! Ese Monstruo no puede recibir esta Mágica.', 'warning');
        return;
      }
      dispatch(action);
    } else if (sel.kind === 'choose-destroy-target') {
      const action = { type: 'DESTROY_MONSTER' as const, fieldUid: uid };
      if (!isLegal(action)) {
        addToast('¡Jugada errónea! Ese Monstruo no es un objetivo válido.', 'warning');
        return;
      }
      dispatch(action);
    } else if (sel.kind === 'choose-destroy-associated-card') {
      const target = opp.field.find((fm) => fm?.uid === uid) ?? me.field.find((fm) => fm?.uid === uid);
      if (!target) return;
      const cardType = target.trap ? 'trap' : target.magic ? 'magic' : null;
      if (!cardType) return;
      const action = { type: 'DESTROY_ASSOCIATED_CARD' as const, fieldUid: uid, cardType };
      if (!isLegal(action)) {
        addToast('Elige una Trampa o Mágica asociada válida.', 'warning');
        return;
      }
      dispatch(action);
    } else if (sel.kind === 'choose-trap-2-own') {
      const action = { type: 'TRAP_2_SELECT_OWN' as const, fieldUid: uid };
      if (!isLegal(action)) {
        addToast('¡Jugada errónea! Elige un Monstruo propio que todavía no hayas seleccionado para esta Trampa.', 'warning');
        return;
      }
      dispatch(action);
    } else {
      const target = opp.field.find((fm) => fm?.uid === uid) ?? null;
      if (target) {
        handleCardZoom(
          target.card,
          true,
          Boolean(target.faceDown),
          target,
        );
      }
    }
  };

  const handleMyFieldClick = (uid: string) => {
    if (sel.kind === 'place-trap') {
      dispatch({ type: 'PLACE_TRAP_ON_MONSTER', card: sel.card, fieldUid: uid });
    } else if (sel.kind === 'place-magic') {
      dispatch({ type: 'PLACE_MAGIC_ON_MONSTER', card: sel.card, side: 'self', fieldUid: uid });
    } else if (sel.kind === 'direct-attack' || sel.kind === 'attack-or-direct') {
      dispatch({ type: 'DIRECT_ATTACK', attackerUid: sel.attackerUid });
    } else if (sel.kind === 'choose-destroy-target') {
      dispatch({ type: 'DESTROY_MONSTER', fieldUid: uid });
    }
  };

  // `selectedHandCard` guarda la identidad de INSTANCIA, así que con dos
  // copias del mismo `id` en la mano (Mágica 2) se localiza la exacta.
  const selectedCard = selectedHandCard
    ? (me.hand.find((c) => cardInstanceKey(c) === selectedHandCard) ?? null)
    : null;
  const selectedField = selectedFieldUid ? me.field.find((f) => f?.uid === selectedFieldUid) : null;

  // Regla 5 — lado exigido por la Mágica de campo seleccionada.
  // `self` = solo Monstruos propios (Mágicas 4 y 9). `enemy` = solo rivales (Mágica 8).
  // `null` = la Mágica no usa objetivo (no debería ocurrir en 'place-magic').
  const magicSide: 'self' | 'enemy' | null = sel.kind === 'place-magic' ? magicRequiredSide(sel.card) : null;

  const isOpponentSlotSelectable = (fm: FieldMonster | null): boolean => {
    if (!fm) return false;
    if (fm.uid !== opponentUidOf(fm)) return false;
    // Reglas 22/5/19 y el paso de la Trampa 9: en vez de reimplementar aquí la
    // Regla 22 y la Regla 5, se pregunta a `legalActions` si existe una jugada
    // que apunte a ESTA casilla concreta.
    return legal.some(
      (a) =>
        (a.type === 'DECLARE_ATTACK' && a.defenderUid === fm.uid) ||
        ((a.type === 'PLACE_MAGIC_ON_MONSTER' || a.type === 'MAGIC_TARGET_MONSTER') && a.fieldUid === fm.uid),
    );
  };

  const isMySlotSelectable = (fm: FieldMonster | null): boolean => {
    if (!fm) return false;
    if (fm.uid !== myUidOf(fm)) return false;
    if (sel.kind === 'direct-attack' || sel.kind === 'attack-or-direct') {
      // Clic en un Monstruo propio para hacer el ataque directo.
      return legal.some((a) => a.type === 'DIRECT_ATTACK');
    }
    if (sel.kind === 'choose-trap-2-own') {
      return legal.some((a) => a.type === 'TRAP_2_SELECT_OWN' && a.fieldUid === fm.uid);
    }
    return legal.some(
      (a) =>
        (a.type === 'PLACE_TRAP_ON_MONSTER' && a.fieldUid === fm.uid) ||
        ((a.type === 'PLACE_MAGIC_ON_MONSTER' || a.type === 'MAGIC_TARGET_MONSTER') && a.fieldUid === fm.uid) ||
        (a.type === 'DESTROY_MONSTER' && a.fieldUid === fm.uid),
    );
  };

  /**
   * Un `FieldMonster` es el MISMO objeto en el estado y en la casilla que se
   * está pintando, así que basta con comprobar de qué campo viene para no
   * confundir un uid propio con uno rival (que son únicos, pero solo dentro del
   * conjunto de casillas que se están evaluando).
   */
  const myUidOf = (fm: FieldMonster): string | null =>
    me.field.some((f) => f?.uid === fm.uid) ? fm.uid : null;
  const opponentUidOf = (fm: FieldMonster): string | null =>
    opp.field.some((f) => f?.uid === fm.uid) ? fm.uid : null;

  const startTrap3CountAnimation = () => {
    if (!state.pendingTrap || !state.pendingDice || trapCountAnimation) return;

    const pt = state.pendingTrap;
    if (
      pt.trap.effect.kind !== 'dice_count_field' &&
      !state.pendingDice.reason.includes('Dado y conteo')
    ) return;

    const allMonsters = getTrap3CountingOrder(
      state.players,
      pt.defenderPlayer,
      pt.defenderUid,
    ).map(({ fm }) => ({ uid: fm.uid, name: fm.card.name }));

    if (allMonsters.length === 0) return;

    const roll = Math.floor(Math.random() * 6) + 1;
    const sequence = Array.from({ length: roll }, (_, offset) =>
      allMonsters[offset % allMonsters.length],
    );

    setTrapCountAnimation({ roll, sequence, step: 0 });
  };

  const trapPrompt = state.phase === 'trap-response' && state.pendingTrap;
  const dicePrompt = state.phase === 'dice-roll' && state.pendingDice;

  const selectionPromptText = (): string => {
    switch (sel.kind) {
      case 'attack': return 'Elige un monstruo enemigo para atacar';
      case 'attack-or-direct': return 'Elige un Monstruo enemigo para atacar o realiza un ataque directo a sus LP';
      case 'place-trap': return 'Elige tu monstruo para colocar la trampa';
      case 'place-magic':
        // Regla 5: la Mágica 8 es la única que va sobre un Monstruo rival.
        return magicSide === 'enemy'
          ? 'Elige un monstruo rival para colocar la mágica'
          : 'Elige uno de tus monstruos para colocar la mágica';
      case 'direct-attack': return 'Elige tu monstruo para atacar directamente';
      case 'choose-destroy-target': return 'Elige un monstruo del campo para destruir';
      case 'choose-destroy-associated-card': return 'Trampa 5: elige qué Trampa o Mágica asociada destruir';
      case 'choose-trap-2-own':
        return sel.selectedUids.length === 0
          ? 'Trampa: elige los 2 Monstruos propios que quieres destruir'
          : 'Trampa: elige 1 Monstruo propio más para completar la destrucción';
      case 'revive-choice': return 'Elige cómo recuperar el monstruo';
      default: return '';
    }
  };

  // Clic fuera: cancela selecciones temporales y paneles activos.
  // Solo se dispara cuando el clic llega al fondo del board (e.target === e.currentTarget),
  // los elementos interactivos hijos detienen la propagación con stopPropagation.
  const handleBoardClickOutside = () => {
    if (sel.kind !== 'none' && !state.turnStartSelectionActive) {
      dispatch({ type: 'CANCEL_SELECTION' });
    }
    if (selectedFieldUid !== null) {
      setSelectedFieldUid(null);
    }
    if (selectedHandCard !== null) {
      setSelectedHandCard(null);
    }
  };

  const uiXs = { fontSize: 'var(--ui-text-xs)' } as const;
  const uiSm = { fontSize: 'var(--ui-text-sm)' } as const;
  const uiBase = { fontSize: 'var(--ui-text-base)' } as const;

  return (
    <div
      className="board-bg flex flex-col w-full overflow-y-auto overflow-x-hidden lg:overflow-x-visible"
      style={{
        height: '100dvh',
        paddingTop: 'env(safe-area-inset-top)',
        paddingLeft: 'env(safe-area-inset-left)',
        paddingRight: 'env(safe-area-inset-right)',
        paddingBottom: 'env(safe-area-inset-bottom)',
      }}
      onClick={(e) => {
        const target = e.target as HTMLElement;
        if (target.closest('[data-no-cancel]')) return;
        handleBoardClickOutside();
      }}
    >
      {/* Turn banner */}
      <TurnBanner playerName={state.players[cp].name} turnCount={state.turnCount} />

      {/* Damage float */}
      {lastCombat && <DamageFloat damage={lastCombat.damage} playerIdx={lastCombat.player} />}

      {/* Opponent info */}
      <div className="px-2 sm:px-3 pt-1.5 pb-1 bg-ink-800/60 flex-none backdrop-blur-sm" data-no-cancel>
        <LPBar player={opp} isCurrent={false} />
        <div className="flex items-center justify-between gap-2 mt-1">
          <div className="flex items-center gap-3">
            {/* Deck */}
            <div className="flex items-center gap-1">
              <div className="w-4 h-5 rounded-sm bg-gradient-to-br from-ink-600 to-ink-800 border border-ink-500/50 flex items-center justify-center">
                <span className="text-[8px] text-ink-300 font-bold">{opp.deck.length}</span>
              </div>
              <span className="text-ink-400" style={uiXs}>Mazo</span>
            </div>
            {/* Hand */}
            <div className="flex items-center gap-1">
              <span className="text-ink-400" style={uiXs}>Mano {opp.hand.length}/{MAX_HAND_SIZE}</span>
            </div>
            {/* Graveyard */}
            <div className="flex items-center gap-1">
              <div className="w-4 h-5 rounded-sm bg-gradient-to-br from-ink-700 to-ink-900 border border-ink-600/50 flex items-center justify-center">
                <span className="text-[8px] text-ink-300 font-bold">{opp.graveyard.length}</span>
              </div>
              <span className="text-ink-400" style={uiXs}>Cem.</span>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-none">
            <span className="text-ink-400 whitespace-nowrap" style={uiXs}>T{state.turnCount + 1}</span>
            {confirmExit ? (
              <div className="flex items-center gap-1" role="group" aria-label="Confirmar finalizar partida">
                <span className="text-ink-300" style={uiXs}>¿Seguro?</span>
                <button
                  type="button"
                  onClick={onExit}
                  className="rounded font-bold bg-red-600 text-white hover:bg-red-500 btn-press"
                  style={{ ...uiXs, padding: '0.3em 0.7em' }}
                >
                  Sí
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmExit(false)}
                  className="rounded font-bold bg-ink-700 text-ink-200 hover:bg-ink-600 btn-press"
                  style={{ ...uiXs, padding: '0.3em 0.7em' }}
                >
                  No
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmExit(true)}
                className="flex items-center gap-1 rounded font-bold whitespace-nowrap border border-red-500/60 text-red-400 hover:bg-red-500/10 btn-press"
                style={{ ...uiXs, padding: '0.3em 0.6em' }}
              >
                <LogOut style={{ width: '1em', height: '1em' }} aria-hidden="true" />
                Finalizar
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Opponent hand */}
      <div className="flex justify-center py-1 bg-ink-800/30 flex-none" data-no-cancel aria-label={`El rival tiene ${opp.hand.length} cartas en mano`}>
        <div className="flex" style={{ gap: 'calc(var(--card-back-w) * -0.3)' }}>
          {/* La clave es la identidad de instancia de cada carta del rival, no
              el índice: así los dorsos no se reutilizan al reordenarse la mano
              (p. ej. tras la Mágica 2 o la Mágica 3). */}
          {opp.hand.map((card) => (
            <CardBack key={cardInstanceKey(card)} size="xs" />
          ))}
        </div>
      </div>

      {/* Opponent field */}
      <div className="px-1 sm:px-2 py-1 bg-red-950/20 border border-red-900/30 rounded-lg mx-1 flex-none field-zone" data-no-cancel>
        <div className="text-center mb-0.5">
          <span className="text-[9px] uppercase tracking-widest text-red-400/60 font-display font-bold">Campo Rival</span>
        </div>
        <div className="grid grid-cols-6 place-items-center w-full" style={{ gap: 'var(--field-gap)' }}>
          {opp.field.map((fm, i) => (
            <FieldSlot
              key={i}
              fm={fm}
              fieldPlayer={opp.index}
              slotIndex={i}
              isOpponent
              onClick={fm ? () => handleOpponentFieldClick(fm.uid) : undefined}
              selectable={isOpponentSlotSelectable(fm)}
              attackTarget={
                !!fm &&
                (sel.kind === 'attack' || sel.kind === 'attack-or-direct') &&
                isOpponentSlotSelectable(fm)
              }
              trapCounting={Boolean(trapCountAnimation && fm && trapCountAnimation.sequence[trapCountAnimation.step]?.uid === fm.uid)}
              showTrap={true}
              showMagic={true}
              onZoom={(card, fieldMonster, isOpponentCard, isHidden) =>
                handleCardZoom(card, isOpponentCard, isHidden, fieldMonster)
              }
            />
          ))}
        </div>
      </div>

      {/* Center status */}
      <div className="px-3 py-1 flex items-center justify-center min-h-[2rem] flex-none bg-ink-800/40 border-y border-ink-700/50" data-no-cancel>
        {state.lastCombat && !trapPrompt && !dicePrompt && (
          <div className="text-center animate-fade-in">
            <span className="text-gold-200 text-shadow-strong font-medium" style={uiSm}>{state.lastCombat.log}</span>
          </div>
        )}
        {trapPrompt && (
          <div className="text-center animate-burst">
            <div className="flex items-center gap-1.5 justify-center text-crimson-300 font-display font-bold" style={uiBase}>
              <AlertTriangle size={16} /> ¡Trampa activada!
            </div>
          </div>
        )}
        {dicePrompt && (
          <div className="text-center animate-burst">
            <div className="flex items-center gap-1.5 justify-center text-gold-300 font-display font-bold" style={uiBase}>
              <Dices size={16} /> ¡Tira el dado!
            </div>
          </div>
        )}
      </div>

      {/* Player field */}
      <div className="px-1 sm:px-2 py-1 bg-azure-950/20 border border-azure-900/30 rounded-lg mx-1 flex-none field-zone relative z-10" data-no-cancel>
        <div className="text-center mb-0.5">
          <span className="text-[9px] uppercase tracking-widest text-azure-400/60 font-display font-bold">Tu Campo</span>
        </div>
        <div className="grid grid-cols-6 place-items-center w-full" style={{ gap: 'var(--field-gap)' }}>
          {me.field.map((fm, i) => (
            <FieldSlot
              key={i}
              fm={fm}
              fieldPlayer={me.index}
              slotIndex={i}
              isOpponent={false}
              onClick={fm ? () => {
                if (
                  sel.kind === 'place-trap' ||
                  sel.kind === 'place-magic' ||
                  sel.kind === 'direct-attack' ||
                  sel.kind === 'attack-or-direct' ||
                  sel.kind === 'choose-trap-2-own'
                ) {
                  handleMyFieldClick(fm.uid);
                } else if (sel.kind === 'attack') {
                  // ignore, already attacking
                } else {
                  setSelectedHandCard(null);
                  setSelectedFieldUid(selectedFieldUid === fm.uid ? null : fm.uid);
                }
              } : undefined}
              selectable={isMySlotSelectable(fm)}
              trapTargetSelected={sel.kind === 'choose-trap-2-own' && sel.selectedUids.includes(fm?.uid ?? '')}
              trapCounting={Boolean(trapCountAnimation && fm && trapCountAnimation.sequence[trapCountAnimation.step]?.uid === fm.uid)}
              showTrap={true}
              showMagic={true}
              animateSummon={summonedUids.has(fm?.uid ?? '')}
              onZoom={(card, fieldMonster, isOpponentCard, isHidden) =>
                handleCardZoom(card, isOpponentCard, isHidden, fieldMonster)
              }
            />
          ))}
        </div>
      </div>

      {/* Trap response modal */}
      {trapPrompt && (
        <div className={`fixed inset-0 ${trapCountAnimation ? 'bg-black/35' : 'bg-black/70'} flex items-center justify-center z-50 px-4 animate-backdrop-fade`} data-no-cancel>
          <div className="bg-ink-700 rounded-2xl border-2 border-crimson-500/50 p-5 max-w-xs w-full shadow-glow-crimson animate-scale-in">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-10 h-10 rounded-full bg-crimson-500/20 flex items-center justify-center">
                <AlertTriangle size={20} className="text-crimson-400" />
              </div>
              <h3 className="font-display font-bold text-crimson-300" style={uiBase}>Trampa del rival</h3>
            </div>
            <p className="text-white mb-1 font-semibold" style={uiSm}>{state.pendingTrap!.trap.name}</p>
            <p className="text-ink-300 mb-4" style={uiXs}>{state.pendingTrap!.trap.description}</p>
            <p className="text-ink-400 mb-4" style={uiXs}>
              Tu {state.pendingTrap!.attackerCard.name} ataca a {state.pendingTrap!.defenderCard.name}.
            </p>
            <button
              onClick={() => {
                playSound('activate-trap');
                vibrate(40);
                dispatch({ type: 'RESOLVE_TRAP', activate: true });
              }}
              className="w-full rounded-lg bg-gradient-to-r from-gold-500 to-gold-400 text-white font-display font-bold hover:from-gold-400 hover:to-gold-300 btn-press flex items-center justify-center gap-1.5"
              style={{ ...uiSm, padding: '0.7em 0' }}
            >
              <Zap size={16} /> Aceptar
            </button>
          </div>
        </div>
      )}

      {/* Dice roll modal */}
      {dicePrompt && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 px-4 animate-backdrop-fade" data-no-cancel>
          <div className="relative bg-ink-700 rounded-2xl border-2 border-gold-500/50 p-6 max-w-xs w-full text-center shadow-glow animate-scale-in">
            <button
              type="button"
              aria-label="Cerrar resultado del dado"
              title="Cerrar"
              onClick={() => dispatch({ type: 'CLOSE_DICE_RESULT' })}
              disabled={state.diceResult === null}
              className="absolute right-3 top-3 w-9 h-9 rounded-full border border-gold-500/40 text-ink-300 hover:text-white hover:bg-ink-600 disabled:opacity-30 disabled:pointer-events-none flex items-center justify-center"
            >
              <X size={18} />
            </button>
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-gold-500/20 flex items-center justify-center">
              <Dices size={32} className="text-gold-400" />
            </div>
            <h3 className="font-display font-bold text-gold-300 mb-1" style={uiBase}>Tira el dado</h3>
            <p className="text-ink-300 mb-4" style={uiXs}>{state.pendingDice!.reason}</p>
            {state.diceResult !== null ? (
              <>
                <div className="font-display font-black text-gold-300 mb-4 animate-burst" style={{ fontSize: 'clamp(3rem, 10vw, 4rem)' }}>
                  {state.diceResult}
                </div>
                <button
                  type="button"
                  onClick={() => dispatch({ type: 'CLOSE_DICE_RESULT' })}
                  className="rounded-xl bg-gradient-to-r from-gold-500 to-gold-400 text-ink-900 font-display font-bold hover:from-gold-400 hover:to-gold-300 btn-press mx-auto"
                  style={{ ...uiSm, padding: '0.6em 1.5em' }}
                >
                  Continuar
                </button>
              </>
            ) : trapCountAnimation ? (
              <>
                <div className="font-display font-black text-gold-300 mb-2 animate-pulse" style={{ fontSize: 'clamp(2.2rem, 7vw, 3.4rem)' }}>
                  {trapCountAnimation.step + 1}
                </div>
                <p className="text-gold-200 font-display font-bold mb-1" style={uiSm}>Contando...</p>
                <p className="text-ink-300 mb-3 truncate" style={uiXs}>
                  {trapCountAnimation.sequence[trapCountAnimation.step]?.name}
                </p>
                <div className="text-ink-400" style={uiXs}>
                  Ruleta de la Trampa · {trapCountAnimation.step + 1} / {trapCountAnimation.roll}
                </div>
              </>
            ) : (
              <button
                onClick={() => {
                  const isTrap3 =
                    state.pendingTrap?.trap.effect.kind === 'dice_count_field' ||
                    state.pendingDice?.reason.includes('Dado y conteo') === true;

                  if (isTrap3) {
                    startTrap3CountAnimation();
                  } else {
                    const roll = Math.floor(Math.random() * 6) + 1;
                    dispatch({ type: 'ROLL_DICE', roll });
                  }
                }}
                className="rounded-xl bg-gradient-to-r from-gold-500 to-gold-400 text-ink-900 font-display font-bold hover:from-gold-400 hover:to-gold-300 shadow-glow btn-press flex items-center gap-2 mx-auto"
                style={{ ...uiSm, padding: '0.6em 1.5em' }}
              >
                <Dices size={20} /> Tirar
              </button>
            )}
          </div>
        </div>
      )}

      {/* Revive choice modal (Mágica 5) */}
      {sel.kind === 'revive-choice' && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 px-4 animate-backdrop-fade" data-no-cancel>
          <div className="bg-ink-700 rounded-2xl border-2 border-gold-500/50 p-5 max-w-xs w-full shadow-glow animate-scale-in">
            <h3 className="font-display font-bold text-gold-300 mb-1" style={uiBase}>Mágica 5: Recuperar Monstruo</h3>
            <p className="text-ink-300 mb-4" style={uiXs}>Elige dónde revivir el Monstruo más fuerte del cementerio:</p>
            <div className="flex flex-col gap-2">
              <button
                onClick={() => dispatch({ type: 'REVIVE_CHOICE', card: sel.card, choice: 'hand' })}
                className="rounded-lg bg-gradient-to-r from-gold-500 to-gold-400 text-white font-display font-bold hover:from-gold-400 hover:to-gold-300 btn-press flex items-center justify-center gap-1.5"
                style={{ ...uiSm, padding: '0.7em 0' }}
              >
                A la mano
              </button>
              <button
                onClick={() => dispatch({ type: 'REVIVE_CHOICE', card: sel.card, choice: 'field', position: 'attack' })}
                className="rounded-lg bg-gradient-to-r from-crimson-600 to-crimson-500 text-white font-display font-bold hover:from-crimson-500 hover:to-crimson-400 btn-press flex items-center justify-center gap-1.5"
                style={{ ...uiSm, padding: '0.7em 0' }}
              >
                Al campo (Ataque)
              </button>
              <button
                onClick={() => dispatch({ type: 'REVIVE_CHOICE', card: sel.card, choice: 'field', position: 'defense' })}
                className="rounded-lg bg-gradient-to-r from-azure-600 to-azure-500 text-white font-display font-bold hover:from-azure-500 hover:to-azure-400 btn-press flex items-center justify-center gap-1.5"
                style={{ ...uiSm, padding: '0.7em 0' }}
              >
                Al campo (Defensa)
              </button>
              <button
                onClick={() => dispatch({ type: 'CANCEL_SELECTION' })}
                className="rounded-lg bg-ink-500 text-ink-200 font-display font-bold hover:bg-ink-400 btn-press flex items-center justify-center gap-1.5"
                style={{ ...uiSm, padding: '0.7em 0' }}
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Selection prompt bar */}
      {sel.kind !== 'none' && !trapPrompt && !dicePrompt && sel.kind !== 'revive-choice' && sel.kind !== 'choose-destroy-target' && (
        <div className="px-3 py-2 bg-gold-500/15 border-t-2 border-gold-500/40 flex items-center justify-between flex-none animate-fade-in shadow-lg" data-no-cancel>
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-2 h-2 rounded-full bg-gold-400 animate-pulse flex-none"></div>
            <span className="text-gold-200 font-medium" style={uiSm}>{selectionPromptText()}</span>
          </div>
          <div className="flex items-center gap-1.5 flex-none">
            {sel.kind === 'attack-or-direct' &&
              isLegal({ type: 'DIRECT_ATTACK', attackerUid: sel.attackerUid }) && (
                <button
                  type="button"
                  onClick={() => dispatch({ type: 'DIRECT_ATTACK', attackerUid: sel.attackerUid })}
                  className="flex items-center gap-1 px-3 py-1 rounded-lg bg-gradient-to-r from-crimson-600 to-crimson-500 text-white hover:from-crimson-500 hover:to-crimson-400 btn-press border border-crimson-400/60 font-display font-bold"
                  style={uiXs}
                  title="Atacar directamente los puntos de vida del rival"
                  aria-label="Atacar directamente los puntos de vida del rival"
                >
                  <Swords size={12} /> Ataque directo
                </button>
              )}
            {!state.turnStartSelectionActive && (
            <button
              onClick={() => dispatch({ type: 'CANCEL_SELECTION' })}
              className="flex items-center gap-1 px-3 py-1 rounded-lg bg-ink-700/80 text-ink-300 hover:text-white hover:bg-ink-600 btn-press border border-ink-500/50"
              style={uiXs}
            >
              <X size={12} /> Cancelar
            </button>
            )}
          </div>
        </div>
      )}

      {/* Player info */}
      <div className="px-2 sm:px-3 py-1 bg-ink-800/60 border-t border-ink-600 flex-none backdrop-blur-sm" data-no-cancel>
        <LPBar player={me} isCurrent={true} />
        <div className="flex items-center justify-between gap-2 mt-1">
          <div className="flex items-center gap-3">
            {/* Deck */}
            <div className="flex items-center gap-1">
              <div className="w-5 h-6 rounded-sm bg-gradient-to-br from-ink-600 to-ink-800 border border-ink-500/50 flex items-center justify-center shadow-sm">
                <span className="text-[9px] text-ink-200 font-bold">{me.deck.length}</span>
              </div>
              <span className="text-ink-400" style={uiXs}>Mazo</span>
            </div>
            {/* Hand */}
            <div className="flex items-center gap-1">
              <span className={`text-ink-400 ${me.hand.length >= MAX_HAND_SIZE ? 'text-crimson-400 font-semibold' : ''}`} style={uiXs}>
                Mano {me.hand.length}/{MAX_HAND_SIZE}
              </span>
            </div>
            {/* Graveyard */}
            <div className="flex items-center gap-1">
              <div className="w-5 h-6 rounded-sm bg-gradient-to-br from-ink-700 to-ink-900 border border-ink-600/50 flex items-center justify-center shadow-sm">
                <span className="text-[9px] text-ink-200 font-bold">{me.graveyard.length}</span>
              </div>
              <span className="text-ink-400" style={uiXs}>Cem.</span>
            </div>
          </div>
          <span className="text-gold-400 font-semibold whitespace-nowrap" style={uiXs}>
            Cartas: {me.cardsPlayedThisTurn}/3
          </span>
        </div>
      </div>

      {/* Hand */}
      <div className="bg-ink-800/40 flex-none" data-no-cancel>
        {/* Hand header with counter */}
        <div className="flex items-center justify-between px-2 py-0.5 bg-ink-800/60 border-b border-ink-700/50">
          <div className="flex items-center gap-1">
            <span className="text-[9px] uppercase tracking-widest text-ink-400 font-display font-bold">Mano</span>
            <span className={`font-display font-bold ${me.hand.length >= MAX_HAND_SIZE ? 'text-crimson-400' : 'text-gold-300'}`} style={uiXs}>
              {me.hand.length} / {MAX_HAND_SIZE}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1">
              <div className="w-2 h-2 rounded-full bg-azure-400"></div>
              <span className="text-[8px] text-ink-400">Monstruos</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-2 h-2 rounded-full bg-crimson-400"></div>
              <span className="text-[8px] text-ink-400">Trampas</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-2 h-2 rounded-full bg-gold-400"></div>
              <span className="text-[8px] text-ink-400">Mágicas</span>
            </div>
          </div>
        </div>
        {/* Hand cards */}
        <div
          ref={handScrollRef}
          className="hand-scroll overflow-x-auto lg:overflow-visible overscroll-x-contain touch-pan-x snap-x py-0.5 relative"
        >
          {/* Left fade indicator */}
          <div className="absolute left-0 top-0 bottom-0 w-4 bg-gradient-to-r from-ink-800/80 to-transparent pointer-events-none z-10"></div>
          {/* Right fade indicator */}
          <div className="absolute right-0 top-0 bottom-0 w-4 bg-gradient-to-l from-ink-800/80 to-transparent pointer-events-none z-10"></div>
          <div className="flex items-end w-max mx-auto px-3 py-0" style={{ gap: 'var(--field-gap)' }}>
            {me.hand.length === 0 && (
              <span className="text-ink-400" style={uiSm}>No tienes cartas en mano</span>
            )}
            {me.hand.map((card) => (
              <div
                key={cardInstanceKey(card)}
                data-card-instance={cardInstanceKey(card)}
                data-card-id={card.id}
                className={`snap-center flex-none hand-card ${selectedHandCard === cardInstanceKey(card) ? 'selected' : ''} ${liftDown ? 'lift-down' : ''}`}
              >
                <div className="relative">
                  <CardView
                    card={card}
                    size="md"
                    onClick={() => handleHandCardClick(card)}
                    selected={selectedHandCard === cardInstanceKey(card)}
                  />
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleCardZoom(card);
                    }}
                    className="absolute -top-1 -right-1 w-5 h-5 bg-ink-700/90 rounded-full hidden md:flex items-center justify-center text-ink-300 hover:text-white hover:bg-ink-600 z-30 border border-ink-500/50"
                    title="Ampliar carta"
                  >
                    <ZoomIn size={10} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Selected field monster action panel */}
      {selectedField && !selectedCard && (
        <div ref={selectedCardPanelRef} className="fixed bottom-0 left-0 right-0 bg-ink-700 border-t-2 border-azure-500/40 rounded-t-2xl p-3 shadow-card-hover z-40 animate-slide-up"
          style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
          data-no-cancel
          onClick={() => setSelectedFieldUid(null)}
        >
          <div
            className="flex items-start gap-3 mb-2"
            onClick={(e) => e.stopPropagation()}
            style={{
              '--ui-text-xs': 'clamp(12px, 1.5vw, 16px)',
              '--ui-text-base': 'clamp(15px, 1.9vw, 20px)',
            } as React.CSSProperties}
          >
            <CardView card={selectedField.card} size="lg" fieldMonster={selectedField} isField />
            <div className="flex-1 min-w-0">
              <h3 className="font-display font-bold text-white" style={uiBase}>{selectedField.card.name}</h3>
              <p className="text-ink-300 mt-1" style={{ fontSize: '20px' }}>
                Monstruo · ATQ {selectedField.card.atk + selectedField.tempAtkModifier} / DEF {selectedField.card.def + selectedField.tempDefModifier}
              </p>
              <p className="text-ink-400 mt-0.5" style={uiXs}>
                Posicion: {selectedField.position === 'attack' ? 'Ataque' : 'Defensa'}
                {selectedField.hasChangedPosition && ' · Ya cambiada este turno'}
                {selectedField.hasAttacked && ' · Ya atacó'}
              </p>
              {selectedField.trap && (
                <p className="text-crimson-300 mt-0.5" style={uiXs}>Trampa: {selectedField.trap.name}</p>
              )}
              {selectedField.magic && (
                <p className="text-gold-300 mt-0.5" style={uiXs}>Magica: {selectedField.magic.name}</p>
              )}
            </div>
            <button onClick={() => setSelectedFieldUid(null)} className="text-ink-300 hover:text-white btn-press">
              <X size={20} />
            </button>
          </div>
          <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
            {isLegal({ type: 'CHANGE_POSITION', fieldUid: selectedField.uid }) && (
              <button
                onClick={() => {
                  dispatch({ type: 'CHANGE_POSITION', fieldUid: selectedField.uid });
                  setSelectedFieldUid(null);
                }}
                className="flex-1 rounded-lg bg-gray-600 text-white font-display font-bold hover:bg-gray-500 btn-press flex items-center justify-center gap-1.5"
                style={{ ...uiSm, padding: '0.7em 0' }}
              >
                <RotateCw size={16} /> {selectedField.position === 'attack' ? 'A Defensa' : 'A Ataque'}
              </button>
            )}
            {isLegal({ type: 'START_ATTACK', attackerUid: selectedField.uid }) && (
              <button
                onClick={() => {
                  dispatch({ type: 'START_ATTACK', attackerUid: selectedField.uid });
                  setSelectedFieldUid(null);
                }}
                className={`flex-1 rounded-lg text-white font-display font-bold btn-press flex items-center justify-center gap-1.5 ${
                  selectedField.card.suit === 'espadas'
                    ? 'bg-blue-600 hover:bg-blue-500'
                    : 'bg-green-600 hover:bg-green-500'
                }`}
                style={{ ...uiSm, padding: '0.7em 0' }}
              >
                <Swords size={16} /> Atacar
              </button>
            )}
            {!isLegal({ type: 'CHANGE_POSITION', fieldUid: selectedField.uid }) && (
              <p className="flex-1 text-ink-400 text-center" style={uiXs}>Ya has cambiado la posicion de este monstruo este turno</p>
            )}
          </div>
        </div>
      )}

      {/* Selected card action panel */}
      {selectedCard && (
        <div ref={selectedCardPanelRef} className="fixed bottom-0 left-0 right-0 bg-ink-700 border-t-2 border-gold-500/40 rounded-t-2xl p-3 shadow-card-hover z-40 animate-slide-up"
          style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
          data-no-cancel
          onClick={() => setSelectedHandCard(null)}
        >
          <div className="flex items-start gap-3 mb-2" onClick={(e) => e.stopPropagation()}>
            <CardView card={selectedCard} size="lg" />
            <div className="flex-1 min-w-0">
              <h3 className="font-display font-bold text-white" style={uiBase}>{selectedCard.name}</h3>
              <p className="text-ink-300 mt-1" style={{ fontSize: '20px' }}>
                {selectedCard.type === 'monster' && `Monstruo · ATQ ${selectedCard.atk} / DEF ${selectedCard.def}`}
                {selectedCard.type === 'trap' && `Trampa · ${selectedCard.description}`}
                {selectedCard.type === 'magic' && `Magica · ${selectedCard.description}`}
              </p>
            </div>
            <button onClick={() => setSelectedHandCard(null)} className="text-ink-300 hover:text-white btn-press">
              <X size={20} />
            </button>
          </div>
          <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
            {selectedCard.type === 'monster' && (
              <>
                <button
                  onClick={() => handlePlayMonster(selectedCard, 'defense')}
                  disabled={!isLegal({ type: 'SUMMON_MONSTER', card: selectedCard, position: 'defense' })}
                  className="flex-1 rounded-lg bg-gray-600 text-white font-display font-bold hover:bg-gray-500 btn-press flex items-center justify-center gap-1.5 disabled:opacity-40"
                  style={{ ...uiSm, padding: '0.7em 0' }}
                >
                  <Shield size={16} /> Defensa
                </button>
                <button
                  onClick={() => handlePlayMonster(selectedCard, 'attack')}
                  disabled={!isLegal({ type: 'SUMMON_MONSTER', card: selectedCard, position: 'attack' })}
                  className={`flex-1 rounded-lg text-white font-display font-bold btn-press flex items-center justify-center gap-1.5 disabled:opacity-40 ${
                    selectedCard.suit === 'espadas'
                      ? 'bg-blue-600 hover:bg-blue-500'
                      : 'bg-green-600 hover:bg-green-500'
                  }`}
                  style={{ ...uiSm, padding: '0.7em 0' }}
                >
                  <Swords size={16} /> Ataque
                </button>
              </>
            )}
            {selectedCard.type === 'trap' && (
              <div className="w-full">
                <button
                  onClick={() => handlePlayTrap(selectedCard)}
                  disabled={!isLegal({ type: 'SELECT_TRAP_PLACE', card: selectedCard })}
                  className="w-full rounded-lg bg-gradient-to-r from-crimson-500 to-crimson-400 text-white font-display font-bold hover:from-crimson-400 hover:to-crimson-300 btn-press flex items-center justify-center gap-1.5 disabled:opacity-40"
                  style={{ ...uiSm, padding: '0.7em 0' }}
                >
                  <Zap size={16} /> Colocar trampa
                </button>
                {!isLegal({ type: 'SELECT_TRAP_PLACE', card: selectedCard }) && getUnavailableCardReason(selectedCard) && (
                  <p className="text-crimson-300 text-center mt-1.5" onClick={(e) => e.stopPropagation()} style={uiXs}>
                    {getUnavailableCardReason(selectedCard)}
                  </p>
                )}
              </div>
            )}
            {selectedCard.type === 'magic' && (
              <div className="w-full">
                <button
                  onClick={() => handlePlayMagic(selectedCard)}
                  disabled={!isLegal({ type: 'SELECT_MAGIC', card: selectedCard })}
                  className="w-full rounded-lg bg-gradient-to-r from-gold-500 to-gold-400 text-ink-900 font-display font-bold hover:from-gold-400 hover:to-gold-300 btn-press flex items-center justify-center gap-1.5 disabled:opacity-40"
                  style={{ ...uiSm, padding: '0.7em 0' }}
                >
                  <Play size={16} /> Usar magica
                </button>
                {!isLegal({ type: 'SELECT_MAGIC', card: selectedCard }) && getUnavailableCardReason(selectedCard) && (
                  <p className="text-gold-300 text-center mt-1.5" onClick={(e) => e.stopPropagation()} style={uiXs}>
                    {getUnavailableCardReason(selectedCard)}
                  </p>
                )}
              </div>
            )}
          </div>
          {cp !== viewer && (
            <p className="text-ink-400 text-center mt-1.5" onClick={(e) => e.stopPropagation()} style={uiXs}>Ahora no es tu turno</p>
          )}
          {cp === viewer && !canPlayMore && (
            <p className="text-crimson-400 text-center mt-1.5" onClick={(e) => e.stopPropagation()} style={uiXs}>Ya has jugado {MAX_CARDS_PER_TURN} cartas este turno</p>
          )}
          {cp === viewer && canPlayMore && !canPlayCard && (
            <p className="text-ink-400 text-center mt-1.5" onClick={(e) => e.stopPropagation()} style={uiXs}>Ahora mismo no puedes jugar ninguna carta</p>
          )}
        </div>
      )}

      {/* Bottom action bar */}
      <div className="px-2 sm:px-3 pt-2 pb-1 bg-ink-800 border-t-2 border-ink-600 flex items-center gap-2 flex-none"
        style={{ paddingBottom: 'max(0.5rem, calc(env(safe-area-inset-bottom) + var(--browser-bottom-inset, 0px)))' }}
        data-no-cancel
      >
        <button
          onClick={() => setShowLog(true)}
          className="rounded-lg bg-ink-600 text-ink-200 font-semibold hover:bg-ink-500 btn-press flex items-center gap-1"
          style={{ ...uiXs, padding: '0.5em 0.8em' }}
        >
          <Eye size={14} /> Registro
        </button>
        <div className="flex-1 min-w-0 text-center">
          <div className="flex items-center justify-center gap-2">
            <span className="text-ink-300 leading-tight" style={uiXs}>
              {attackAllowed ? 'Puedes atacar' : 'Sin ataque este turno'}
            </span>
            <span className={`font-display font-bold ${me.cardsPlayedThisTurn >= 3 ? 'text-crimson-400' : 'text-gold-300'}`} style={uiXs}>
              Cartas: {me.cardsPlayedThisTurn}/3
            </span>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setShowVolumeControl((v) => !v)}
            className="rounded-lg bg-ink-600 text-ink-200 hover:bg-ink-500 btn-press flex items-center justify-center"
            style={{ ...uiXs, padding: '0.4em' }}
            title="Ajustar volumen"
            aria-expanded={showVolumeControl}
            aria-label="Ajustar volumen de sonido"
          >
            <Volume2 size={14} />
          </button>
          <button
            onClick={toggleSound}
            className={`rounded-lg btn-press flex items-center justify-center ${
              soundEnabled ? 'bg-ink-600 text-ink-200 hover:bg-ink-500' : 'bg-ink-700 text-ink-400 hover:bg-ink-600'
            }`}
            style={{ ...uiXs, padding: '0.4em' }}
            title={soundEnabled ? 'Desactivar sonido' : 'Activar sonido'}
            aria-label={soundEnabled ? 'Desactivar sonido' : 'Activar sonido'}
          >
            {soundEnabled ? <Volume2 size={14} /> : <VolumeX size={14} />}
          </button>
          <button
            onClick={onToggleMusic}
            className={`rounded-lg btn-press flex items-center justify-center ${
              musicEnabled ? 'bg-ink-600 text-ink-200 hover:bg-ink-500' : 'bg-ink-700 text-ink-400 hover:bg-ink-600'
            }`}
            style={{ ...uiXs, padding: '0.4em' }}
            title={musicEnabled ? 'Desactivar música' : 'Activar música'}
            aria-label={musicEnabled ? 'Desactivar música' : 'Activar música'}
          >
            {musicEnabled ? <Music size={14} /> : <VolumeX size={14} />}
          </button>
          <button
            onClick={() => {
              setSelectedHandCard(null);
              playSound('end-turn');
              vibrate(20);
              dispatch({ type: 'END_TURN' });
            }}
            className="whitespace-nowrap rounded-lg bg-gradient-to-r from-gold-500 to-gold-400 text-ink-900 font-display font-bold hover:from-gold-400 hover:to-gold-300 shadow-glow btn-press flex items-center gap-1 border-2 border-gold-300/50"
            style={{ ...uiXs, padding: '0.5em 1em' }}
          >
            Terminar turno
            <ChevronRight size={14} />
          </button>
        </div>
      </div>

      {/* Control de volumen */}
      {showVolumeControl && (
        <div className="flex items-center gap-2 px-3 py-1.5 bg-ink-800/95 border-t border-ink-600 flex-none animate-fade-in" data-no-cancel>
          <VolumeX size={13} className="text-ink-400 flex-none" aria-hidden="true" />
          <input
            type="range"
            min={0}
            max={100}
            value={Math.round(volume * 100)}
            onChange={(e) => changeVolume(Number(e.target.value) / 100)}
            className="flex-1 accent-gold-400"
            aria-label="Volumen"
            disabled={!soundEnabled}
          />
          <Volume2 size={13} className="text-ink-300 flex-none" aria-hidden="true" />
          <span className="text-ink-300 tabular-nums flex-none" style={uiXs}>
            {Math.round(volume * 100)}%
          </span>
        </div>
      )}

      {isCpuTurn && !trapPrompt && !dicePrompt && (
        <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/20 animate-backdrop-fade" aria-live="polite" style={{ paddingBottom: '15vh' }} data-no-cancel>
          <div className="rounded-full border border-azure-400/40 bg-ink-800/90 px-4 py-2 font-display font-bold text-azure-300 shadow-glow animate-pulse flex items-center gap-2" style={uiSm}>
            <Sparkles size={16} className="animate-spin" />
            Turno de la CPU...
          </div>
        </div>
      )}

      {/* Log modal */}
      {showLog && (
        <div className="fixed inset-0 bg-black/70 flex items-end justify-center z-50 animate-backdrop-fade" onClick={() => setShowLog(false)} data-no-cancel>
          <div className="bg-ink-700 rounded-t-2xl border-t-2 border-gold-500/40 p-4 w-full overscroll-contain overflow-y-auto log-scroll"
            style={{ maxWidth: '100%', maxHeight: '70dvh', paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-3 gap-2">
              <h3 className="font-display font-bold text-gold-300" style={uiBase}>Registro de juego</h3>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={copyGameLog}
                  disabled={state.log.length === 0}
                  className="px-2.5 py-1.5 rounded-lg border border-ink-500/70 bg-ink-800 text-ink-200 hover:text-white hover:border-gold-400/60 disabled:opacity-40 disabled:cursor-not-allowed btn-press flex items-center gap-1.5"
                  title="Copiar registro"
                  aria-label="Copiar registro"
                >
                  {logCopied ? <Check size={16} className="text-emerald-400" /> : <Copy size={16} />}
                  <span style={uiXs}>{logCopied ? 'Copiado' : 'Copiar'}</span>
                </button>
                <button onClick={() => setShowLog(false)} className="text-ink-300 hover:text-white btn-press">
                  <X size={18} />
                </button>
              </div>
            </div>
            <div className="space-y-1 select-text">
              {state.log.slice().reverse().map((entry, i) => (
                <div
                  key={i}
                  className="text-ink-200 py-1 border-b border-ink-600/50 select-text cursor-text whitespace-pre-wrap"
                  style={{ ...uiXs, userSelect: 'text', WebkitUserSelect: 'text' }}
                >
                  {entry}
                </div>
              ))}
              {state.log.length === 0 && <p className="text-ink-400" style={uiXs}>Sin eventos todavía</p>}
            </div>
          </div>
        </div>
      )}

      {/* Card zoom modal */}
      {zoomCard && (
        <div data-no-cancel>
        <CardZoomModal
          card={zoomCard.card}
          onClose={() => setZoomCard(null)}
          isOpponentCard={zoomCard.isOpponentCard}
          isHidden={zoomCard.isHidden}
          fieldMonster={zoomCard.fieldMonster}
        />
        </div>
      )}

      {/* Toast messages */}
      <ToastContainer messages={toasts} />

      {/* Combat animation */}
      <CombatAnimation 
        combatState={combatAnim} 
        onComplete={() => setCombatAnim(null)} 
      />

      </div>
  );
}

            )}   </button>
          </div>
        </div>
      )}

      {/* Player info */}
      <div className="px-2 sm:px-3 py-1 bg-ink-800/60 border-t border-ink-600 flex-none backdrop-blur-sm" data-no-cancel>
        <LPBar player={me} isCurrent={true} />
        <div className="flex items-center justify-between gap-2 mt-1">
          <div className="flex items-center gap-3">
            {/* Deck */}
            <div className="flex items-center gap-1">
              <div className="w-5 h-6 rounded-sm bg-gradient-to-br from-ink-600 to-ink-800 border border-ink-500/50 flex items-center justify-center shadow-sm">
                <span className="text-[9px] text-ink-200 font-bold">{me.deck.length}</span>
              </div>
              <span className="text-ink-400" style={uiXs}>Mazo</span>
            </div>
            {/* Hand */}
            <div className="flex items-center gap-1">
              <span className={`text-ink-400 ${me.hand.length >= MAX_HAND_SIZE ? 'text-crimson-400 font-semibold' : ''}`} style={uiXs}>
                Mano {me.hand.length}/{MAX_HAND_SIZE}
              </span>
            </div>
            {/* Graveyard */}
            <div className="flex items-center gap-1">
              <div className="w-5 h-6 rounded-sm bg-gradient-to-br from-ink-700 to-ink-900 border border-ink-600/50 flex items-center justify-center shadow-sm">
                <span className="text-[9px] text-ink-200 font-bold">{me.graveyard.length}</span>
              </div>
              <span className="text-ink-400" style={uiXs}>Cem.</span>
            </div>
          </div>
          <span className="text-gold-400 font-semibold whitespace-nowrap" style={uiXs}>
            Cartas: {me.cardsPlayedThisTurn}/3
          </span>
        </div>
      </div>

      {/* Hand */}
      <div className="bg-ink-800/40 flex-none" data-no-cancel>
        {/* Hand header with counter */}
        <div className="flex items-center justify-between px-2 py-0.5 bg-ink-800/60 border-b border-ink-700/50">
          <div className="flex items-center gap-1">
            <span className="text-[9px] uppercase tracking-widest text-ink-400 font-display font-bold">Mano</span>
            <span className={`font-display font-bold ${me.hand.length >= MAX_HAND_SIZE ? 'text-crimson-400' : 'text-gold-300'}`} style={uiXs}>
              {me.hand.length} / {MAX_HAND_SIZE}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1">
              <div className="w-2 h-2 rounded-full bg-azure-400"></div>
              <span className="text-[8px] text-ink-400">Monstruos</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-2 h-2 rounded-full bg-crimson-400"></div>
              <span className="text-[8px] text-ink-400">Trampas</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-2 h-2 rounded-full bg-gold-400"></div>
              <span className="text-[8px] text-ink-400">Mágicas</span>
            </div>
          </div>
        </div>
        {/* Hand cards */}
        <div
          ref={handScrollRef}
          className="hand-scroll overflow-x-auto lg:overflow-visible overscroll-x-contain touch-pan-x snap-x py-0.5 relative"
        >
          {/* Left fade indicator */}
          <div className="absolute left-0 top-0 bottom-0 w-4 bg-gradient-to-r from-ink-800/80 to-transparent pointer-events-none z-10"></div>
          {/* Right fade indicator */}
          <div className="absolute right-0 top-0 bottom-0 w-4 bg-gradient-to-l from-ink-800/80 to-transparent pointer-events-none z-10"></div>
          <div className="flex items-end w-max mx-auto px-3 py-0" style={{ gap: 'var(--field-gap)' }}>
            {me.hand.length === 0 && (
              <span className="text-ink-400" style={uiSm}>No tienes cartas en mano</span>
            )}
            {me.hand.map((card) => (
              <div
                key={cardInstanceKey(card)}
                data-card-instance={cardInstanceKey(card)}
                data-card-id={card.id}
                className={`snap-center flex-none hand-card ${selectedHandCard === cardInstanceKey(card) ? 'selected' : ''} ${liftDown ? 'lift-down' : ''}`}
              >
                <div className="relative">
                  <CardView
                    card={card}
                    size="md"
                    onClick={() => handleHandCardClick(card)}
                    selected={selectedHandCard === cardInstanceKey(card)}
                  />
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleCardZoom(card);
                    }}
                    className="absolute -top-1 -right-1 w-5 h-5 bg-ink-700/90 rounded-full hidden md:flex items-center justify-center text-ink-300 hover:text-white hover:bg-ink-600 z-30 border border-ink-500/50"
                    title="Ampliar carta"
                  >
                    <ZoomIn size={10} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Selected field monster action panel */}
      {selectedField && !selectedCard && (
        <div ref={selectedCardPanelRef} className="fixed bottom-0 left-0 right-0 bg-ink-700 border-t-2 border-azure-500/40 rounded-t-2xl p-3 shadow-card-hover z-40 animate-slide-up"
          style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
          data-no-cancel
          onClick={() => setSelectedFieldUid(null)}
        >
          <div
            className="flex items-start gap-3 mb-2"
            onClick={(e) => e.stopPropagation()}
            style={{
              '--ui-text-xs': 'clamp(12px, 1.5vw, 16px)',
              '--ui-text-base': 'clamp(15px, 1.9vw, 20px)',
            } as React.CSSProperties}
          >
            <CardView card={selectedField.card} size="lg" fieldMonster={selectedField} isField />
            <div className="flex-1 min-w-0">
              <h3 className="font-display font-bold text-white" style={uiBase}>{selectedField.card.name}</h3>
              <p className="text-ink-300 mt-1" style={{ fontSize: '20px' }}>
                Monstruo · ATQ {selectedField.card.atk + selectedField.tempAtkModifier} / DEF {selectedField.card.def + selectedField.tempDefModifier}
              </p>
              <p className="text-ink-400 mt-0.5" style={uiXs}>
                Posicion: {selectedField.position === 'attack' ? 'Ataque' : 'Defensa'}
                {selectedField.hasChangedPosition && ' · Ya cambiada este turno'}
                {selectedField.hasAttacked && ' · Ya atacó'}
              </p>
              {selectedField.trap && (
                <p className="text-crimson-300 mt-0.5" style={uiXs}>Trampa: {selectedField.trap.name}</p>
              )}
              {selectedField.magic && (
                <p className="text-gold-300 mt-0.5" style={uiXs}>Magica: {selectedField.magic.name}</p>
              )}
            </div>
            <button onClick={() => setSelectedFieldUid(null)} className="text-ink-300 hover:text-white btn-press">
              <X size={20} />
            </button>
          </div>
          <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
            {isLegal({ type: 'CHANGE_POSITION', fieldUid: selectedField.uid }) && (
              <button
                onClick={() => {
                  dispatch({ type: 'CHANGE_POSITION', fieldUid: selectedField.uid });
                  setSelectedFieldUid(null);
                }}
                className="flex-1 rounded-lg bg-gray-600 text-white font-display font-bold hover:bg-gray-500 btn-press flex items-center justify-center gap-1.5"
                style={{ ...uiSm, padding: '0.7em 0' }}
              >
                <RotateCw size={16} /> {selectedField.position === 'attack' ? 'A Defensa' : 'A Ataque'}
              </button>
            )}
            {isLegal({ type: 'START_ATTACK', attackerUid: selectedField.uid }) && (
              <button
                onClick={() => {
                  dispatch({ type: 'START_ATTACK', attackerUid: selectedField.uid });
                  setSelectedFieldUid(null);
                }}
                className={`flex-1 rounded-lg text-white font-display font-bold btn-press flex items-center justify-center gap-1.5 ${
                  selectedField.card.suit === 'espadas'
                    ? 'bg-blue-600 hover:bg-blue-500'
                    : 'bg-green-600 hover:bg-green-500'
                }`}
                style={{ ...uiSm, padding: '0.7em 0' }}
              >
                <Swords size={16} /> Atacar
              </button>
            )}
            {!isLegal({ type: 'CHANGE_POSITION', fieldUid: selectedField.uid }) && (
              <p className="flex-1 text-ink-400 text-center" style={uiXs}>Ya has cambiado la posicion de este monstruo este turno</p>
            )}
          </div>
        </div>
      )}

      {/* Selected card action panel */}
      {selectedCard && (
        <div ref={selectedCardPanelRef} className="fixed bottom-0 left-0 right-0 bg-ink-700 border-t-2 border-gold-500/40 rounded-t-2xl p-3 shadow-card-hover z-40 animate-slide-up"
          style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
          data-no-cancel
          onClick={() => setSelectedHandCard(null)}
        >
          <div className="flex items-start gap-3 mb-2" onClick={(e) => e.stopPropagation()}>
            <CardView card={selectedCard} size="lg" />
            <div className="flex-1 min-w-0">
              <h3 className="font-display font-bold text-white" style={uiBase}>{selectedCard.name}</h3>
              <p className="text-ink-300 mt-1" style={{ fontSize: '20px' }}>
                {selectedCard.type === 'monster' && `Monstruo · ATQ ${selectedCard.atk} / DEF ${selectedCard.def}`}
                {selectedCard.type === 'trap' && `Trampa · ${selectedCard.description}`}
                {selectedCard.type === 'magic' && `Magica · ${selectedCard.description}`}
              </p>
            </div>
            <button onClick={() => setSelectedHandCard(null)} className="text-ink-300 hover:text-white btn-press">
              <X size={20} />
            </button>
          </div>
          <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
            {selectedCard.type === 'monster' && (
              <>
                <button
                  onClick={() => handlePlayMonster(selectedCard, 'defense')}
                  disabled={!isLegal({ type: 'SUMMON_MONSTER', card: selectedCard, position: 'defense' })}
                  className="flex-1 rounded-lg bg-gray-600 text-white font-display font-bold hover:bg-gray-500 btn-press flex items-center justify-center gap-1.5 disabled:opacity-40"
                  style={{ ...uiSm, padding: '0.7em 0' }}
                >
                  <Shield size={16} /> Defensa
                </button>
                <button
                  onClick={() => handlePlayMonster(selectedCard, 'attack')}
                  disabled={!isLegal({ type: 'SUMMON_MONSTER', card: selectedCard, position: 'attack' })}
                  className={`flex-1 rounded-lg text-white font-display font-bold btn-press flex items-center justify-center gap-1.5 disabled:opacity-40 ${
                    selectedCard.suit === 'espadas'
                      ? 'bg-blue-600 hover:bg-blue-500'
                      : 'bg-green-600 hover:bg-green-500'
                  }`}
                  style={{ ...uiSm, padding: '0.7em 0' }}
                >
                  <Swords size={16} /> Ataque
                </button>
              </>
            )}
            {selectedCard.type === 'trap' && (
              <div className="w-full">
                <button
                  onClick={() => handlePlayTrap(selectedCard)}
                  disabled={!isLegal({ type: 'SELECT_TRAP_PLACE', card: selectedCard })}
                  className="w-full rounded-lg bg-gradient-to-r from-crimson-500 to-crimson-400 text-white font-display font-bold hover:from-crimson-400 hover:to-crimson-300 btn-press flex items-center justify-center gap-1.5 disabled:opacity-40"
                  style={{ ...uiSm, padding: '0.7em 0' }}
                >
                  <Zap size={16} /> Colocar trampa
                </button>
                {!isLegal({ type: 'SELECT_TRAP_PLACE', card: selectedCard }) && getUnavailableCardReason(selectedCard) && (
                  <p className="text-crimson-300 text-center mt-1.5" onClick={(e) => e.stopPropagation()} style={uiXs}>
                    {getUnavailableCardReason(selectedCard)}
                  </p>
                )}
              </div>
            )}
            {selectedCard.type === 'magic' && (
              <div className="w-full">
                <button
                  onClick={() => handlePlayMagic(selectedCard)}
                  disabled={!isLegal({ type: 'SELECT_MAGIC', card: selectedCard })}
                  className="w-full rounded-lg bg-gradient-to-r from-gold-500 to-gold-400 text-ink-900 font-display font-bold hover:from-gold-400 hover:to-gold-300 btn-press flex items-center justify-center gap-1.5 disabled:opacity-40"
                  style={{ ...uiSm, padding: '0.7em 0' }}
                >
                  <Play size={16} /> Usar magica
                </button>
                {!isLegal({ type: 'SELECT_MAGIC', card: selectedCard }) && getUnavailableCardReason(selectedCard) && (
                  <p className="text-gold-300 text-center mt-1.5" onClick={(e) => e.stopPropagation()} style={uiXs}>
                    {getUnavailableCardReason(selectedCard)}
                  </p>
                )}
              </div>
            )}
          </div>
          {cp !== viewer && (
            <p className="text-ink-400 text-center mt-1.5" onClick={(e) => e.stopPropagation()} style={uiXs}>Ahora no es tu turno</p>
          )}
          {cp === viewer && !canPlayMore && (
            <p className="text-crimson-400 text-center mt-1.5" onClick={(e) => e.stopPropagation()} style={uiXs}>Ya has jugado {MAX_CARDS_PER_TURN} cartas este turno</p>
          )}
          {cp === viewer && canPlayMore && !canPlayCard && (
            <p className="text-ink-400 text-center mt-1.5" onClick={(e) => e.stopPropagation()} style={uiXs}>Ahora mismo no puedes jugar ninguna carta</p>
          )}
        </div>
      )}

      {/* Bottom action bar */}
      <div className="px-2 sm:px-3 pt-2 pb-1 bg-ink-800 border-t-2 border-ink-600 flex items-center gap-2 flex-none"
        style={{ paddingBottom: 'max(0.5rem, calc(env(safe-area-inset-bottom) + var(--browser-bottom-inset, 0px)))' }}
        data-no-cancel
      >
        <button
          onClick={() => setShowLog(true)}
          className="rounded-lg bg-ink-600 text-ink-200 font-semibold hover:bg-ink-500 btn-press flex items-center gap-1"
          style={{ ...uiXs, padding: '0.5em 0.8em' }}
        >
          <Eye size={14} /> Registro
        </button>
        <div className="flex-1 min-w-0 text-center">
          <div className="flex items-center justify-center gap-2">
            <span className="text-ink-300 leading-tight" style={uiXs}>
              {attackAllowed ? 'Puedes atacar' : 'Sin ataque este turno'}
            </span>
            <span className={`font-display font-bold ${me.cardsPlayedThisTurn >= 3 ? 'text-crimson-400' : 'text-gold-300'}`} style={uiXs}>
              Cartas: {me.cardsPlayedThisTurn}/3
            </span>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setShowVolumeControl((v) => !v)}
            className="rounded-lg bg-ink-600 text-ink-200 hover:bg-ink-500 btn-press flex items-center justify-center"
            style={{ ...uiXs, padding: '0.4em' }}
            title="Ajustar volumen"
            aria-expanded={showVolumeControl}
            aria-label="Ajustar volumen de sonido"
          >
            <Volume2 size={14} />
          </button>
          <button
            onClick={toggleSound}
            className={`rounded-lg btn-press flex items-center justify-center ${
              soundEnabled ? 'bg-ink-600 text-ink-200 hover:bg-ink-500' : 'bg-ink-700 text-ink-400 hover:bg-ink-600'
            }`}
            style={{ ...uiXs, padding: '0.4em' }}
            title={soundEnabled ? 'Desactivar sonido' : 'Activar sonido'}
            aria-label={soundEnabled ? 'Desactivar sonido' : 'Activar sonido'}
          >
            {soundEnabled ? <Volume2 size={14} /> : <VolumeX size={14} />}
          </button>
          <button
            onClick={onToggleMusic}
            className={`rounded-lg btn-press flex items-center justify-center ${
              musicEnabled ? 'bg-ink-600 text-ink-200 hover:bg-ink-500' : 'bg-ink-700 text-ink-400 hover:bg-ink-600'
            }`}
            style={{ ...uiXs, padding: '0.4em' }}
            title={musicEnabled ? 'Desactivar música' : 'Activar música'}
            aria-label={musicEnabled ? 'Desactivar música' : 'Activar música'}
          >
            {musicEnabled ? <Music size={14} /> : <VolumeX size={14} />}
          </button>
          <button
            onClick={() => {
              setSelectedHandCard(null);
              playSound('end-turn');
              vibrate(20);
              dispatch({ type: 'END_TURN' });
            }}
            className="whitespace-nowrap rounded-lg bg-gradient-to-r from-gold-500 to-gold-400 text-ink-900 font-display font-bold hover:from-gold-400 hover:to-gold-300 shadow-glow btn-press flex items-center gap-1 border-2 border-gold-300/50"
            style={{ ...uiXs, padding: '0.5em 1em' }}
          >
            Terminar turno
            <ChevronRight size={14} />
          </button>
        </div>
      </div>

      {/* Control de volumen */}
      {showVolumeControl && (
        <div className="flex items-center gap-2 px-3 py-1.5 bg-ink-800/95 border-t border-ink-600 flex-none animate-fade-in" data-no-cancel>
          <VolumeX size={13} className="text-ink-400 flex-none" aria-hidden="true" />
          <input
            type="range"
            min={0}
            max={100}
            value={Math.round(volume * 100)}
            onChange={(e) => changeVolume(Number(e.target.value) / 100)}
            className="flex-1 accent-gold-400"
            aria-label="Volumen"
            disabled={!soundEnabled}
          />
          <Volume2 size={13} className="text-ink-300 flex-none" aria-hidden="true" />
          <span className="text-ink-300 tabular-nums flex-none" style={uiXs}>
            {Math.round(volume * 100)}%
          </span>
        </div>
      )}

      {isCpuTurn && !trapPrompt && !dicePrompt && (
        <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/20 animate-backdrop-fade" aria-live="polite" style={{ paddingBottom: '15vh' }} data-no-cancel>
          <div className="rounded-full border border-azure-400/40 bg-ink-800/90 px-4 py-2 font-display font-bold text-azure-300 shadow-glow animate-pulse flex items-center gap-2" style={uiSm}>
            <Sparkles size={16} className="animate-spin" />
            Turno de la CPU...
          </div>
        </div>
      )}

      {/* Log modal */}
      {showLog && (
        <div className="fixed inset-0 bg-black/70 flex items-end justify-center z-50 animate-backdrop-fade" onClick={() => setShowLog(false)} data-no-cancel>
          <div className="bg-ink-700 rounded-t-2xl border-t-2 border-gold-500/40 p-4 w-full overscroll-contain overflow-y-auto log-scroll"
            style={{ maxWidth: '100%', maxHeight: '70dvh', paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-3 gap-2">
              <h3 className="font-display font-bold text-gold-300" style={uiBase}>Registro de juego</h3>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={copyGameLog}
                  disabled={state.log.length === 0}
                  className="px-2.5 py-1.5 rounded-lg border border-ink-500/70 bg-ink-800 text-ink-200 hover:text-white hover:border-gold-400/60 disabled:opacity-40 disabled:cursor-not-allowed btn-press flex items-center gap-1.5"
                  title="Copiar registro"
                  aria-label="Copiar registro"
                >
                  {logCopied ? <Check size={16} className="text-emerald-400" /> : <Copy size={16} />}
                  <span style={uiXs}>{logCopied ? 'Copiado' : 'Copiar'}</span>
                </button>
                <button onClick={() => setShowLog(false)} className="text-ink-300 hover:text-white btn-press">
                  <X size={18} />
                </button>
              </div>
            </div>
            <div className="space-y-1 select-text">
              {state.log.slice().reverse().map((entry, i) => (
                <div
                  key={i}
                  className="text-ink-200 py-1 border-b border-ink-600/50 select-text cursor-text whitespace-pre-wrap"
                  style={{ ...uiXs, userSelect: 'text', WebkitUserSelect: 'text' }}
                >
                  {entry}
                </div>
              ))}
              {state.log.length === 0 && <p className="text-ink-400" style={uiXs}>Sin eventos todavía</p>}
            </div>
          </div>
        </div>
      )}

      {/* Card zoom modal */}
      {zoomCard && (
        <div data-no-cancel>
        <CardZoomModal
          card={zoomCard.card}
          onClose={() => setZoomCard(null)}
          isOpponentCard={zoomCard.isOpponentCard}
          isHidden={zoomCard.isHidden}
          fieldMonster={zoomCard.fieldMonster}
        />
        </div>
      )}

      {/* Toast messages */}
      <ToastContainer messages={toasts} />

      {/* Combat animation */}
      <CombatAnimation 
        combatState={combatAnim} 
        onComplete={() => setCombatAnim(null)} 
      />

      </div>
  );
}
