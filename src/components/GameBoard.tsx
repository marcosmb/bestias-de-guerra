import { useState, useEffect, useRef } from 'react';
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
} from 'lucide-react';
import type { Card, MonsterCard, TrapCard, MagicCard } from '@/game/cardData';
import type { Action, GameState, FieldMonster, PlayerState } from '@/game/types';
import { canAttack, MAX_HAND_SIZE } from '@/game/types';
import { CardView, CardBack } from './CardView';
import { playSound, vibrate, getAudioPreferences, setSoundEnabled, setVolume, initAudio } from '@/game/audio';

interface GameBoardProps {
  state: GameState;
  dispatch: React.Dispatch<Action>;
  onExit: () => void;
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
  isHidden = false
}: { 
  card: Card | null;
  onClose: () => void;
  isOpponentCard?: boolean;
  isHidden?: boolean;
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
          <CardView card={card} size="lg" />
        </div>

        <div className="space-y-2 text-center">
          <p className="text-white font-display font-bold text-lg">{card.name}</p>
          <p className="text-ink-300 text-sm">
            {isMonster && `Monstruo · ATQ ${(card as MonsterCard).atk} / DEF ${(card as MonsterCard).def}`}
            {isTrap && `Trampa · ${(card as TrapCard).description}`}
            {isMagic && `Mágica · ${(card as MagicCard).description}`}
          </p>
          {isOpponentCard && (
            <p className="text-ink-400 text-xs">Carta del rival</p>
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
    <div className={`flex items-center gap-2 ${isCurrent ? 'opacity-100' : 'opacity-60'} transition-opacity duration-300`}>
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
}: {
  fm: FieldMonster | null;
  isOpponent: boolean;
  onClick?: () => void;
  selectable?: boolean;
  showTrap?: boolean;
  showMagic?: boolean;
  animateSummon?: boolean;
  onZoom?: (card: Card) => void;
}) {
  if (!fm) {
    return (
      <div
        className="rounded-lg border-2 border-dashed flex items-center justify-center transition-all duration-300"
        style={{ width: 'var(--card-field-w)', height: 'var(--card-field-h)' }}
        onClick={onClick}
      >
        <span className={`text-gold-400/40 transition-all duration-300 ${selectable ? 'border-gold-400/60 bg-gold-400/5 animate-pulse scale-110' : 'border-ink-500/40'}`} style={{ fontSize: 'var(--ui-text-sm)' }}>
          {selectable ? '+' : ''}
        </span>
      </div>
    );
  }
  return (
    <div className={`relative z-20 hover:z-50 ${fm.position === 'defense' ? 'rotate-90 scale-[0.8]' : ''} transition-transform duration-300`}>
      <CardView
        card={fm.card}
        size="sm"
        faceDown={isOpponent && fm.faceDown}
        isField
        fieldMonster={fm}
        showTrap={showTrap}
        showMagic={showMagic}
        onClick={onClick}
        animateSummon={animateSummon}
        className={selectable ? 'ring-2 ring-gold-300 animate-pulse shadow-glow scale-105' : ''}
      />
      {/* Zoom button for own field cards */}
      {!isOpponent && onZoom && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onZoom(fm.card);
          }}
          className="absolute -top-1 -right-1 w-4 h-4 bg-ink-700/90 rounded-full hidden md:flex items-center justify-center text-ink-300 hover:text-white hover:bg-ink-600 z-30 border border-ink-500/50"
          title="Ampliar carta"
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
          Turno de {playerName}
        </p>
        <p className="text-ink-400 text-sm text-center mt-1">Turno {turnCount + 1}</p>
      </div>
    </div>
  );
}

function DamageFloat({ damage, playerIdx }: { damage: number; playerIdx: 0 | 1 }) {
  if (damage <= 0) return null;
  return (
    <div className={`fixed z-50 pointer-events-none ${playerIdx === 0 ? 'bottom-[35%] left-1/2 -translate-x-1/2' : 'top-[15%] left-1/2 -translate-x-1/2'}`}>
      <div className="animate-float-damage font-display font-black text-red-400 text-4xl text-shadow-strong">
        -{damage}
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
  } | null;
  onComplete: () => void;
}) {
  const [phase, setPhase] = useState<'attack' | 'impact' | 'result'>('attack');
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    if (!combatState) return;
    
    const attackTimer = setTimeout(() => setPhase('impact'), 300);
    const impactTimer = setTimeout(() => setPhase('result'), 600);
    const completeTimer = setTimeout(() => {
      setVisible(false);
      onComplete();
    }, 1200);

    return () => {
      clearTimeout(attackTimer);
      clearTimeout(impactTimer);
      clearTimeout(completeTimer);
    };
  }, [combatState, onComplete]);

  if (!combatState || !visible) return null;

  const isAttackerTop = combatState.attackerUid.startsWith('top');
  const attackDirection = isAttackerTop ? 'down' : 'up';

  return (
    <div className="fixed inset-0 z-30 pointer-events-none">
      {/* Attack line */}
      {phase === 'attack' && (
        <div 
          className={`absolute left-1/2 -translate-x-1/2 w-1 bg-gradient-to-b from-crimson-500 to-transparent animate-pulse ${
            attackDirection === 'down' ? 'top-[20%] h-[30%]' : 'bottom-[20%] h-[30%]'
          }`}
          style={{ opacity: 0.6 }}
        />
      )}
      
      {/* Impact effect */}
      {phase === 'impact' && (
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
          <div className="w-16 h-16 rounded-full bg-crimson-500/30 animate-ping" />
        </div>
      )}

      {/* Result indicator */}
      {phase === 'result' && (
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
          <div className={`px-4 py-2 rounded-lg font-display font-bold text-lg ${
            combatState.result === 'both-destroyed' ? 'bg-crimson-900/90 text-crimson-200' :
            combatState.result === 'attacker-destroyed' ? 'bg-crimson-900/90 text-crimson-200' :
            combatState.result === 'defender-destroyed' ? 'bg-crimson-900/90 text-crimson-200' :
            'bg-ink-800/90 text-ink-200'
          }`}>
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

export function GameBoard({ state, dispatch, onExit }: GameBoardProps) {
  const [showLog, setShowLog] = useState(false);
  const [confirmExit, setConfirmExit] = useState(false);
  const [selectedHandCard, setSelectedHandCard] = useState<string | null>(null);
  const selectedCardPanelRef = useRef<HTMLDivElement>(null);
  const [selectedFieldUid, setSelectedFieldUid] = useState<string | null>(null);
  const [summonedUids, setSummonedUids] = useState<Set<string>>(new Set());
  const [lastCombat, setLastCombat] = useState<{ damage: number; player: 0 | 1 } | null>(null);
  const [zoomCard, setZoomCard] = useState<{ card: Card | null; isOpponentCard?: boolean; isHidden?: boolean } | null>(null);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [combatAnim, setCombatAnim] = useState<{
    attackerUid: string;
    defenderUid: string | null;
    phase: 'attacking' | 'defending' | 'damage' | 'result';
  } | null>(null);

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
  const [soundEnabled, setSoundEnabledState] = useState(true);
  const [volume, setVolumeState] = useState(0.5);
  const [showVolumeControl, setShowVolumeControl] = useState(false);

  // Inicializar audio
  useEffect(() => {
    initAudio();
    const prefs = getAudioPreferences();
    setSoundEnabledState(prefs.enabled);
    setVolumeState(prefs.volume);
  }, []);

  const cp = state.currentPlayer;
  const isCpuTurn = state.mode === 'cpu' && cp === 1;
  const viewer = state.mode === 'cpu' ? 0 : cp;
  const me = state.players[viewer];
  const opp = state.players[viewer === 0 ? 1 : 0];
  const sel = state.selection;

  const canPlayMore = me.cardsPlayedThisTurn < 3;
  const attackAllowed = canAttack(state);

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

  // Track combat for damage float, toast messages and combat animation
  useEffect(() => {
    if (state.lastCombat) {
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
      setCombatAnim({
        attackerUid: 'top',
        defenderUid: 'bottom',
        isDirectAttack: false,
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

      // Show toast for combat
      addToast(state.lastCombat.log, 'combat');
      
      // Show damage for the player who received it
      if (defenderDamage > 0) {
        // Defender received damage
        const defenderIsMe = (state.lastCombat?.log.includes('Pierdes') || state.lastCombat?.log.includes('rebota'));
        setLastCombat({ damage: defenderDamage, player: defenderIsMe ? viewer : (viewer === 0 ? 1 : 0) as 0 | 1 });
        setTimeout(() => setLastCombat(null), 1000);
      } else if (attackerDamage > 0) {
        // Attacker received damage
        const attackerIsMe = (state.lastCombat?.log.includes('Pierdes') || state.lastCombat?.log.includes('rebota'));
        setLastCombat({ damage: attackerDamage, player: attackerIsMe ? viewer : (viewer === 0 ? 1 : 0) as 0 | 1 });
        setTimeout(() => setLastCombat(null), 1000);
      }
    }
  }, [state.lastCombat]);

  const handleHandCardClick = (card: Card) => {
    setSelectedFieldUid(null);
    if (selectedHandCard === card.id) {
      setSelectedHandCard(null);
    } else {
      setSelectedHandCard(card.id);
    }
  };

  const handleCardZoom = (card: Card | null, isOpponentCard = false, isHidden = false) => {
    if (card) {
      setZoomCard({ card, isOpponentCard, isHidden });
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
    if (!canPlayMore) return;
    if (!me.field.some((f) => f === null)) return;
    playSound('play-card');
    vibrate(30);
    dispatch({ type: 'SUMMON_MONSTER', card, position });
    setSelectedHandCard(null);
  };

  const handlePlayTrap = (card: TrapCard) => {
    if (!canPlayMore) return;
    playSound('place-trap');
    vibrate(30);
    dispatch({ type: 'SELECT_TRAP_PLACE', card });
    setSelectedHandCard(null);
  };

  const handlePlayMagic = (card: MagicCard) => {
    if (!canPlayMore) return;
    playSound('activate-magic');
    vibrate(30);
    dispatch({ type: 'SELECT_MAGIC', card });
    setSelectedHandCard(null);
  };

  const handleOpponentFieldClick = (uid: string) => {
    if (sel.kind === 'attack' || sel.kind === 'attack-or-direct') {
      dispatch({ type: 'DECLARE_ATTACK', attackerUid: sel.attackerUid, defenderUid: uid });
    } else if (sel.kind === 'place-magic') {
      dispatch({ type: 'PLACE_MAGIC_ON_MONSTER', card: sel.card, side: 'enemy', fieldUid: uid });
    } else if (sel.kind === 'choose-destroy-target') {
      dispatch({ type: 'DESTROY_MONSTER', fieldUid: uid });
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

  const selectedCard = selectedHandCard ? me.hand.find((c) => c.id === selectedHandCard) : null;
  const selectedField = selectedFieldUid ? me.field.find((f) => f?.uid === selectedFieldUid) : null;

  const isOpponentSlotSelectable = (fm: FieldMonster | null): boolean => {
    if (!fm) return false;
    if (sel.kind === 'attack' || sel.kind === 'attack-or-direct') {
      const oppField = opp.field;
      const hasOppDefense = oppField.some((f) => f !== null && f.position === 'defense');
      if (hasOppDefense) {
        return fm.position === 'defense';
      }
      return true;
    }
    if (sel.kind === 'place-magic') return true;
    if (sel.kind === 'choose-destroy-target') return true;
    return false;
  };

  const isMySlotSelectable = (fm: FieldMonster | null): boolean => {
    if (!fm) return false;
    if (sel.kind === 'place-trap') {
      return !fm.trap;
    }
    if (sel.kind === 'place-magic') return true;
    if (sel.kind === 'direct-attack' || sel.kind === 'attack-or-direct') return true;
    return false;
  };

  const trapPrompt = state.phase === 'trap-response' && state.pendingTrap;
  const dicePrompt = state.phase === 'dice-roll' && state.pendingDice;

  const selectionPromptText = (): string => {
    switch (sel.kind) {
      case 'attack': return 'Elige un monstruo enemigo para atacar';
      case 'attack-or-direct': return 'Elige un monstruo enemigo para atacar, o tu monstruo para ataque directo';
      case 'place-trap': return 'Elige tu monstruo para colocar la trampa';
      case 'place-magic': return 'Elige un monstruo (tuyo o rival) para la mágica';
      case 'direct-attack': return 'Elige tu monstruo para atacar directamente';
      case 'choose-destroy-target': return 'Elige un monstruo del campo para destruir';
      case 'revive-choice': return 'Elige cómo recuperar el monstruo';
      default: return '';
    }
  };

  // Clic fuera: cancela selecciones temporales y paneles activos.
  // Solo se dispara cuando el clic llega al fondo del board (e.target === e.currentTarget),
  // los elementos interactivos hijos detienen la propagación con stopPropagation.
  const handleBoardClickOutside = () => {
    if (sel.kind !== 'none') {
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
      <TurnBanner playerName={me.name} turnCount={state.turnCount} />

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
          {Array.from({ length: opp.hand.length }).map((_, i) => (
            <CardBack key={i} size="xs" />
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
              isOpponent
              onClick={fm ? () => handleOpponentFieldClick(fm.uid) : undefined}
              selectable={isOpponentSlotSelectable(fm)}
              showTrap={false}
              showMagic={false}
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
              isOpponent={false}
              onClick={fm ? () => {
                if (sel.kind === 'place-trap' || sel.kind === 'place-magic' || sel.kind === 'direct-attack' || sel.kind === 'attack-or-direct') {
                  handleMyFieldClick(fm.uid);
                } else if (sel.kind === 'attack') {
                  // ignore, already attacking
                } else {
                  setSelectedHandCard(null);
                  setSelectedFieldUid(selectedFieldUid === fm.uid ? null : fm.uid);
                }
              } : undefined}
              selectable={isMySlotSelectable(fm)}
              showTrap={true}
              showMagic={true}
              animateSummon={summonedUids.has(fm?.uid ?? '')}
              onZoom={handleCardZoom}
            />
          ))}
        </div>
      </div>

      {/* Trap response modal */}
      {trapPrompt && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 px-4 animate-backdrop-fade" data-no-cancel>
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
            <div className="flex gap-2">
              <button
                onClick={() => {
                  playSound('activate-trap');
                  vibrate(40);
                  dispatch({ type: 'RESOLVE_TRAP', activate: true });
                }}
                className="flex-1 rounded-lg bg-gradient-to-r from-crimson-600 to-crimson-500 text-white font-display font-bold hover:from-crimson-500 hover:to-crimson-400 btn-press flex items-center justify-center gap-1.5"
                style={{ ...uiSm, padding: '0.7em 0' }}
              >
                <Zap size={16} /> Activar
              </button>
              <button
                onClick={() => dispatch({ type: 'RESOLVE_TRAP', activate: false })}
                className="flex-1 rounded-lg bg-ink-500 text-ink-200 font-display font-bold hover:bg-ink-400 btn-press flex items-center justify-center gap-1.5"
                style={{ ...uiSm, padding: '0.7em 0' }}
              >
                <X size={16} /> No activar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Dice roll modal */}
      {dicePrompt && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 px-4 animate-backdrop-fade" data-no-cancel>
          <div className="bg-ink-700 rounded-2xl border-2 border-gold-500/50 p-6 max-w-xs w-full text-center shadow-glow animate-scale-in">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-gold-500/20 flex items-center justify-center">
              <Dices size={32} className="text-gold-400" />
            </div>
            <h3 className="font-display font-bold text-gold-300 mb-1" style={uiBase}>Tira el dado</h3>
            <p className="text-ink-300 mb-4" style={uiXs}>{state.pendingDice!.reason}</p>
            {state.diceResult !== null ? (
              <div className="font-display font-black text-gold-300 mb-4 animate-burst" style={{ fontSize: 'clamp(3rem, 10vw, 4rem)' }}>
                {state.diceResult}
              </div>
            ) : (
              <button
                onClick={() => {
                  const roll = Math.floor(Math.random() * 6) + 1;
                  dispatch({ type: 'ROLL_DICE', roll });
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
                className="rounded-lg bg-gradient-to-r from-azure-600 to-azure-500 text-white font-display font-bold hover:from-azure-500 hover:to-azure-400 btn-press flex items-center justify-center gap-1.5"
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
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-gold-400 animate-pulse"></div>
            <span className="text-gold-200 font-medium" style={uiSm}>{selectionPromptText()}</span>
          </div>
          <button
            onClick={() => dispatch({ type: 'CANCEL_SELECTION' })}
            className="flex items-center gap-1 px-3 py-1 rounded-lg bg-ink-700/80 text-ink-300 hover:text-white hover:bg-ink-600 btn-press border border-ink-500/50"
            style={uiXs}
          >
            <X size={12} /> Cancelar
          </button>
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
        <div className="overflow-x-auto lg:overflow-visible overscroll-x-contain touch-pan-x snap-x py-0.5 relative">
          {/* Left fade indicator */}
          <div className="absolute left-0 top-0 bottom-0 w-4 bg-gradient-to-r from-ink-800/80 to-transparent pointer-events-none z-10"></div>
          {/* Right fade indicator */}
          <div className="absolute right-0 top-0 bottom-0 w-4 bg-gradient-to-l from-ink-800/80 to-transparent pointer-events-none z-10"></div>
          <div className="flex items-end w-max mx-auto px-3 py-0" style={{ gap: 'var(--field-gap)' }}>
            {me.hand.length === 0 && (
              <span className="text-ink-400" style={uiSm}>No tienes cartas en mano</span>
            )}
            {me.hand.map((card) => (
              <div key={card.id} className={`snap-center flex-none hand-card ${selectedHandCard === card.id ? 'selected' : ''}`}>
                <div className="relative">
                  <CardView
                    card={card}
                    size="md"
                    onClick={() => handleHandCardClick(card)}
                    selected={selectedHandCard === card.id}
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
            {selectedField.position === 'attack' && !selectedField.hasAttacked && attackAllowed && (
              <button
                onClick={() => {
                  dispatch({ type: 'START_ATTACK', attackerUid: selectedField.uid });
                  setSelectedFieldUid(null);
                }}
                className="flex-1 rounded-lg bg-gradient-to-r from-crimson-600 to-crimson-500 text-white font-display font-bold hover:from-crimson-500 hover:to-crimson-400 btn-press flex items-center justify-center gap-1.5"
                style={{ ...uiSm, padding: '0.7em 0' }}
              >
                <Swords size={16} /> Atacar
              </button>
            )}
            {!selectedField.hasChangedPosition && (
              <button
                onClick={() => {
                  dispatch({ type: 'CHANGE_POSITION', fieldUid: selectedField.uid });
                  setSelectedFieldUid(null);
                }}
                className="flex-1 rounded-lg bg-gradient-to-r from-azure-600 to-azure-500 text-white font-display font-bold hover:from-azure-500 hover:to-azure-400 btn-press flex items-center justify-center gap-1.5"
                style={{ ...uiSm, padding: '0.7em 0' }}
              >
                <RotateCw size={16} /> {selectedField.position === 'attack' ? 'A Defensa' : 'A Ataque'}
              </button>
            )}
            {selectedField.hasChangedPosition && (
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
                  onClick={() => handlePlayMonster(selectedCard, 'attack')}
                  disabled={!canPlayMore || !me.field.some((f) => f === null)}
                  className="flex-1 rounded-lg bg-gradient-to-r from-crimson-600 to-crimson-500 text-white font-display font-bold hover:from-crimson-500 hover:to-crimson-400 btn-press flex items-center justify-center gap-1.5 disabled:opacity-40"
                  style={{ ...uiSm, padding: '0.7em 0' }}
                >
                  <Swords size={16} /> Ataque
                </button>
                <button
                  onClick={() => handlePlayMonster(selectedCard, 'defense')}
                  disabled={!canPlayMore || !me.field.some((f) => f === null)}
                  className="flex-1 rounded-lg bg-gradient-to-r from-azure-600 to-azure-500 text-white font-display font-bold hover:from-azure-500 hover:to-azure-400 btn-press flex items-center justify-center gap-1.5 disabled:opacity-40"
                  style={{ ...uiSm, padding: '0.7em 0' }}
                >
                  <Shield size={16} /> Defensa
                </button>
              </>
            )}
            {selectedCard.type === 'trap' && (
              <button
                onClick={() => handlePlayTrap(selectedCard)}
                disabled={!canPlayMore || !me.field.some((f) => f !== null && !f.trap)}
                className="flex-1 rounded-lg bg-gradient-to-r from-crimson-500 to-crimson-400 text-white font-display font-bold hover:from-crimson-400 hover:to-crimson-300 btn-press flex items-center justify-center gap-1.5 disabled:opacity-40"
                style={{ ...uiSm, padding: '0.7em 0' }}
              >
                <Zap size={16} /> Colocar trampa
              </button>
            )}
            {selectedCard.type === 'magic' && (
              <button
                onClick={() => handlePlayMagic(selectedCard)}
                disabled={!canPlayMore}
                className="flex-1 rounded-lg bg-gradient-to-r from-gold-500 to-gold-400 text-ink-900 font-display font-bold hover:from-gold-400 hover:to-gold-300 btn-press flex items-center justify-center gap-1.5 disabled:opacity-40"
                style={{ ...uiSm, padding: '0.7em 0' }}
              >
                <Play size={16} /> Usar magica
              </button>
            )}
          </div>
          {!canPlayMore && (
            <p className="text-crimson-400 text-center mt-1.5" onClick={(e) => e.stopPropagation()} style={uiXs}>Ya has jugado 3 cartas este turno</p>
          )}
        </div>
      )}

      {/* Bottom action bar */}
      <div className="px-2 sm:px-3 pt-2 pb-1 bg-ink-800 border-t-2 border-ink-600 flex items-center gap-2 flex-none"
        style={{ paddingBottom: 'max(0.5rem, env(safe-area-inset-bottom))' }}
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
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-display font-bold text-gold-300" style={uiBase}>Registro de juego</h3>
              <button onClick={() => setShowLog(false)} className="text-ink-300 hover:text-white btn-press">
                <X size={18} />
              </button>
            </div>
            <div className="space-y-1">
              {state.log.slice().reverse().map((entry, i) => (
                <div key={i} className="text-ink-200 py-1 border-b border-ink-600/50" style={uiXs}>{entry}</div>
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
