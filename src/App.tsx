import { useState, useEffect } from 'react';
import type { Difficulty, GameMode } from '@/game/types';
import { Swords, ChevronRight, History, Wifi, Cpu, User, Link2, Copy, X, ArrowLeft, BookOpen, Layers3, Music, VolumeX } from 'lucide-react';
import { useGame } from '@/game/useGame';
import { useOnlineGame } from '@/hooks/useOnlineGame';
import { PassDeviceScreen } from '@/components/PassDeviceScreen';
import { GameBoard } from '@/components/GameBoard';
import { GameOverScreen } from '@/components/GameOverScreen';
import { HistoryScreen } from '@/components/HistoryScreen';
import { loadHistoryFrom, getDefaultStorage, type MatchHistory } from '@/game/history';
import { CardReferenceScreen } from '@/components/CardReferenceScreen';
import { RulesScreen } from '@/components/RulesScreen';
import { getMusicPreferences, initAudio, setMusicEnabled, setMusicTrack, setMusicVolume } from '@/game/audio';

type FlowPhase = 'menu' | 'pass' | 'play' | 'history' | 'online-setup' | 'cards' | 'rules';

function StartScreen({
  onStart,
  onOpenHistory,
  onOpenCards,
  onOpenRules,
  hasHistory,
  musicEnabled,
  onToggleMusic,
}: {
  onStart: (mode: GameMode, difficulty: Difficulty) => void;
  onOpenHistory: () => void;
  onOpenCards: () => void;
  onOpenRules: () => void;
  hasHistory: boolean;
  musicEnabled: boolean;
  onToggleMusic: () => void;
}) {
  const [mode, setMode] = useState<GameMode>('local');
  const [difficulty, setDifficulty] = useState<Difficulty>('normal');

  return (
    <div className="bg-ink-900 min-h-[100dvh] flex items-center justify-center px-3 sm:px-6 py-6">
      <div className="w-full max-w-md mx-auto">
        <div className="mb-6 w-full flex items-center justify-between gap-3">
          <div className="animate-pulse-glow w-[clamp(4rem,18vw,5rem)] h-[clamp(4rem,18vw,5rem)] shrink-0 rounded-2xl border-2 border-gold-500/40 flex items-center justify-center">
            <Swords size={36} className="text-gold-400" />
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            <button
              type="button"
              onClick={onOpenCards}
              aria-label="Ver cartas"
              className="group w-[clamp(4rem,18vw,5rem)] h-[clamp(4rem,18vw,5rem)] shrink-0 rounded-2xl border-2 border-gold-500/40 bg-ink-800/70 hover:border-azure-400/70 hover:bg-ink-800 transition-all flex flex-col items-center justify-center gap-1 text-gold-400 hover:text-gold-300 shadow-lg"
            >
              <Layers3 size={36} strokeWidth={1.8} className="group-hover:scale-110 transition-transform" />
              <span className="font-display font-bold uppercase text-[10px] leading-none tracking-wide">Cartas</span>
            </button>
            <button
              type="button"
              onClick={onOpenRules}
              aria-label="Ver reglas"
              className="group w-[clamp(4rem,18vw,5rem)] h-[clamp(4rem,18vw,5rem)] shrink-0 rounded-2xl border-2 border-gold-500/40 bg-ink-800/70 hover:border-gold-400/70 hover:bg-ink-800 transition-all flex flex-col items-center justify-center gap-1 text-gold-400 hover:text-gold-300 shadow-lg"
            >
              <BookOpen size={36} strokeWidth={1.8} className="group-hover:scale-110 transition-transform" />
              <span className="font-display font-bold uppercase text-[10px] leading-none tracking-wide">Reglas</span>
            </button>
          </div>
        </div>
      <h1 className="font-display text-3xl sm:text-4xl font-black text-gold-300 mb-2 text-center" style={{ fontSize: 'clamp(1.5rem, 5vw, 2.5rem)' }}>Bestias de Guerra</h1>
      <p className="text-sm text-ink-300 text-center mb-1">Juego de cartas con baraja española</p>
      <p className="text-xs text-ink-400 text-center mb-6 max-w-xs mx-auto">
        2 jugadores · 48 cartas cada uno · 100 PV · 6 espacios · máx. 9 cartas en mano
      </p>
      <div className="w-full max-w-md mx-auto mb-5">
        <p className="text-[10px] uppercase tracking-widest text-ink-400 mb-2">Modo de juego</p>
        <div className="grid grid-cols-3 gap-2">
          {([['local', '2 jugadores', User], ['cpu', 'Contra CPU', Cpu], ['online', '1v1 Online', Wifi]] as const).map(([value, label, Icon]) => (
            <button key={value} onClick={() => setMode(value as GameMode)} className={`rounded-lg border px-3 py-3 text-sm font-display font-bold transition-colors flex flex-col items-center gap-1 ${mode === value ? 'border-gold-400 bg-gold-400/15 text-gold-300' : 'border-ink-600 text-ink-300 hover:border-ink-400'}`}>
              <Icon size={16} className="mx-auto" />
              <span className="font-display font-bold">{label}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="w-full max-w-md mx-auto mb-5 flex justify-center">
        <button
          type="button"
          onClick={onToggleMusic}
          className={`rounded-lg border px-4 py-2 text-xs font-display font-bold transition-colors flex items-center justify-center gap-2 ${
            musicEnabled
              ? 'border-gold-400 bg-gold-400/15 text-gold-300'
              : 'border-ink-600 bg-ink-800 text-ink-400 hover:border-ink-400'
          }`}
          title={musicEnabled ? 'Desactivar música' : 'Activar música'}
          aria-label={musicEnabled ? 'Desactivar música' : 'Activar música'}
        >
          {musicEnabled ? <Music size={15} /> : <VolumeX size={15} />}
          {musicEnabled ? 'Música activada' : 'Música desactivada'}
        </button>
      </div>
      {mode === 'cpu' ? (
        <>
        <div className="w-full max-w-md mx-auto mb-3">
          <p className="text-[10px] uppercase tracking-widest text-ink-400 mb-2">Dificultad</p>
          <div className="grid grid-cols-4 gap-2">
            {(['easy', 'normal', 'hard', 'expert'] as Difficulty[]).map((d) => (
              <button
                key={d}
                onClick={() => setDifficulty(d)}
                className={`rounded-lg border px-3 py-2 text-xs font-display font-bold transition-colors ${
                  difficulty === d
                    ? 'border-azure-400 bg-azure-400/15 text-azure-300'
                    : 'border-ink-600 text-ink-300 hover:border-ink-400'
                }`}
              >
                {d === 'easy' && 'Fácil'}
                {d === 'normal' && 'Normal'}
                {d === 'hard' && 'Difícil'}
                {d === 'expert' && 'Experto'}
              </button>
            ))}
          </div>
        </div>
        <button
          onClick={() => onStart(mode, difficulty)}
          className="px-8 py-3 rounded-xl bg-gold-400 text-ink-900 font-display font-bold hover:bg-gold-300 shadow-glow active:scale-95 transition-all duration-200 flex items-center gap-2 w-full max-w-xs mx-auto"
        >
          Empezar partida
          <ChevronRight size={18} />
        </button>

        <button
          onClick={onOpenHistory}
          className="mt-3 px-4 py-2 rounded-lg bg-ink-800 border border-ink-600 text-ink-200 text-xs font-semibold hover:border-gold-400 hover:text-gold-300 transition-colors flex items-center gap-2 w-full max-w-xs mx-auto"
        >
          <History size={14} />
          Historial última partida
          {hasHistory && <span className="text-gold-400 text-[10px]">· disponible</span>}
        </button>
        </>
      ) : mode === 'local' ? (
        <>
        <button
          onClick={() => onStart(mode, difficulty)}
          className="px-8 py-3 rounded-xl bg-gold-400 text-ink-900 font-display font-bold hover:bg-gold-300 shadow-glow active:scale-95 transition-all duration-200 flex items-center gap-2 w-full max-w-xs mx-auto"
        >
          Empezar partida
          <ChevronRight size={18} />
        </button>

        <button
          onClick={onOpenHistory}
          className="mt-3 px-4 py-2 rounded-lg bg-ink-800 border border-ink-600 text-ink-200 text-xs font-semibold hover:border-gold-400 hover:text-gold-300 transition-colors flex items-center gap-2 w-full max-w-xs mx-auto"
        >
          <History size={14} />
          Historial última partida
          {hasHistory && <span className="text-gold-400 text-[10px]">· disponible</span>}
        </button>
        </>
      ) : mode === 'online' ? (
        <>
        <button
          onClick={() => onStart(mode, difficulty)}
          className="px-8 py-3 rounded-xl bg-gradient-to-r from-azure-500 to-azure-600 text-white font-display font-bold hover:from-azure-600 hover:to-azure-700 transition-colors flex items-center gap-2 w-full max-w-xs mx-auto"
        >
          <Link2 size={18} className="mr-2" />
          Jugar online
          <ChevronRight size={18} />
        </button>

        <button
          onClick={onOpenHistory}
          className="mt-3 px-4 py-2 rounded-lg bg-ink-800 border border-ink-600 text-ink-200 text-xs font-semibold hover:border-gold-400 hover:text-gold-300 transition-colors flex items-center gap-2 w-full max-w-xs mx-auto"
        >
          <History size={14} />
          Historial última partida
          {hasHistory && <span className="text-gold-400 text-[10px]">· disponible</span>}
        </button>
        </>
      ) : null}
      </div>
    </div>
  );
}

function WaitingOpponentModal({ roomCode, roomUrl, onCopyLink, onClose }: { roomCode: string; roomUrl: string; onCopyLink: () => void; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-4 pointer-events-auto">
      <div className="bg-ink-900 border-2 border-gold-500/50 rounded-2xl p-6 w-full max-w-md animate-slide-up shadow-2xl">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-display text-xl font-bold text-gold-300">Esperando al jugador 2</h2>
          <button onClick={onClose} className="text-ink-400 hover:text-ink-200 transition-colors p-1">
            <X size={24} />
          </button>
        </div>
        
        <div className="space-y-4">
          <div className="bg-ink-800 border border-gold-500/30 rounded-lg p-4">
            <p className="text-xs text-ink-400 mb-1">Código de sala</p>
            <p className="font-display text-4xl font-bold text-gold-300 tracking-widest text-center select-all">{roomCode}</p>
          </div>
          
          <div className="bg-ink-800 border border-ink-600 rounded-lg p-4">
            <p className="text-xs text-ink-400 mb-1">Enlace para compartir</p>
            <div className="flex gap-2">
              <input
                type="text"
                value={roomUrl}
                readOnly
                className="flex-1 px-3 py-2 bg-ink-900 border border-ink-600 rounded text-ink-100 text-xs font-mono truncate"
              />
              <button
                onClick={onCopyLink}
                className="px-3 py-2 bg-azure-500 hover:bg-azure-600 text-white text-xs font-bold rounded transition-colors flex items-center gap-1"
              >
                <Copy size={14} /> Copiar
              </button>
            </div>
          </div>
          
          <p className="text-center text-ink-300 text-sm animate-pulse font-medium">
            Comparte el código o el enlace con tu rival
          </p>
        </div>
      </div>
    </div>
  );
}

function App() {
  const { state, dispatch, liveHistory, readStoredHistory } = useGame();

  useEffect(() => {
    initAudio();
    const prefs = getMusicPreferences();
    setMusicEnabledState(prefs.enabled);
    setMusicVolume(prefs.volume);
  }, []);

  const { 
    gameState: onlineGameState, 
    mode: onlineMode, 
    roomId, 
    playerRole, 
    isHost, 
    opponentConnected, 
    createRoom, 
    joinRoom, 
    leaveRoom, 
    dispatchAction, 
    sendRematch, 
    isConnected, 
    error: onlineError,
    waitingForOpponent
  } = useOnlineGame();
  const [flow, setFlow] = useState<FlowPhase>('menu');
  const [onlineRoomId, setOnlineRoomId] = useState<string>('');
  const [onlinePlayerName, setOnlinePlayerName] = useState<string>('');
  const [storedHistory, setStoredHistory] = useState<MatchHistory | null>(null);
  const [copied, setCopied] = useState(false);
  const [musicEnabled, setMusicEnabledState] = useState(true);

  const toggleMusic = () => {
    setMusicEnabledState((current) => {
      const next = !current;
      setMusicEnabled(next);
      return next;
    });
  };

  useEffect(() => {
    const inGameFlow = flow === 'play' || flow === 'pass';
    const isGameOver = state.phase === 'game-over';
    setMusicTrack(inGameFlow && !isGameOver ? 'game' : 'menu');
  }, [flow, state.phase, musicEnabled]);
  const openHistory = () => {
    setStoredHistory(readStoredHistory());
    setFlow('history');
  };

  // Handle URL parameter for joining a room directly
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const roomParam = params.get('room');
    if (roomParam && flow === 'menu') {
      setOnlineRoomId(roomParam.toUpperCase());
      setFlow('online-setup');
    }
  }, [flow]);

  if (flow === 'history') {
    const shown = liveHistory ?? storedHistory ?? loadHistoryFrom(getDefaultStorage());
    return <HistoryScreen history={shown} onBack={() => setFlow('menu')} />;
  }

  if (state.phase === 'game-over') {
    if (state.isDraw || state.winner === null) {
      return (
        <GameOverScreen
          winnerName="Empate"
          loserName=""
          playerWon={false}
          isDraw
          onRestart={() => {
            dispatch({ type: 'RESTART' });
            setFlow('menu');
          }}
        />
      );
    }
    const winner = state.winner;
    const playerWon = state.mode === 'cpu' ? winner === 0 : true;
    return (
      <GameOverScreen
        winnerName={state.players[winner].name}
        loserName={state.players[winner === 0 ? 1 : 0].name}
        playerWon={playerWon}
        onRestart={() => {
          dispatch({ type: 'RESTART' });
          setFlow('menu');
        }}
      />
    );
  }

  if (flow === 'cards') {
    return <CardReferenceScreen onBack={() => setFlow('menu')} />;
  }

  if (flow === 'rules') {
    return <RulesScreen onBack={() => setFlow('menu')} />;
  }

  if (flow === 'menu') {
    return (
      <StartScreen
        hasHistory={Boolean(liveHistory ?? storedHistory)}
        onOpenHistory={openHistory}
        onOpenCards={() => setFlow('cards')}
        onOpenRules={() => setFlow('rules')}
        onStart={(mode, difficulty) => {
          if (mode === 'online') {
            setFlow('online-setup');
          } else {
            dispatch({ type: 'START_GAME', mode, difficulty });
            setFlow(mode === 'cpu' ? 'play' : 'pass');
          }
        }}
      />
    );
  }

  if (flow === 'online-setup') {
    const handleCreateRoom = () => {
      if (onlinePlayerName.trim()) {
        createRoom(onlinePlayerName.trim()).then(roomId => {
          if (roomId) {
            setOnlineRoomId(roomId);
            // Host immediately goes to play flow (GameBoard with waiting modal)
            setFlow('play');
          }
        });
      }
    };
    const handleJoinRoom = () => {
      if (onlineRoomId.trim()) {
        joinRoom(onlineRoomId.trim().toUpperCase(), onlinePlayerName.trim()).then(joined => {
          if (joined) setFlow('play');
        });
      }
    };
    const handleBack = () => {
      setOnlineRoomId('');
      setOnlinePlayerName('');
      setFlow('menu');
    };

    return (
      <div className="bg-ink-900 flex flex-col items-center justify-center px-6 py-8 min-h-[100dvh] relative">
        <div className="w-full max-w-md">
          <h2 className="font-display text-2xl font-bold text-gold-300 mb-6 text-center">Jugar Online</h2>
          <p className="text-ink-300 text-center mb-6">
            Escribe tu nombre y crea una partida o únete a una existente con un código.
          </p>
          <div className="space-y-4">
            <input
              type="text"
              placeholder="Tu nombre"
              value={onlinePlayerName}
              onChange={(e) => setOnlinePlayerName(e.target.value)}
              className="w-full px-4 py-3 rounded-lg bg-ink-800 border border-ink-600 text-ink-100 placeholder-ink-400 focus:border-azure-400 focus:outline-none"
              maxLength={16}
            />
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={handleCreateRoom}
                className="px-4 py-3 rounded-lg bg-gradient-to-r from-azure-500 to-azure-600 text-white font-display font-bold hover:from-azure-600 hover:to-azure-700 transition-colors"
              >
                <Link2 size={18} className="mr-2" /> Crear partida
              </button>
              <button
                onClick={handleJoinRoom}
                className="px-4 py-3 rounded-lg bg-ink-800 border border-ink-600 text-ink-300 font-display font-bold hover:border-ink-400 hover:bg-ink-700 transition-colors"
              >
                Unirse a partida
              </button>
            </div>
            <input
              type="text"
              placeholder="Código de partida (ej: A1B2C3)"
              value={onlineRoomId}
              onChange={(e) => setOnlineRoomId(e.target.value.toUpperCase())}
              className="w-full px-4 py-3 rounded-lg bg-ink-800 border border-ink-600 text-ink-100 placeholder-ink-400 focus:border-azure-400 focus:outline-none text-center text-lg tracking-widest"
              maxLength={6}
            />
          <button
            type="button"
            onClick={handleBack}
            className="absolute top-4 left-4 px-3 py-2 rounded-lg bg-ink-800 border border-ink-600 text-ink-200 font-display font-bold hover:border-ink-400 hover:bg-ink-700 transition-colors flex items-center gap-1.5 z-10"
          >
            <ArrowLeft size={18} />
            Atrás
          </button>
          </div>
        </div>
      </div>
    );
  }

  if (state.mode === 'local' && (flow === 'pass' || state.phase === 'pass')) {
    const targetName = state.players[state.passTarget].name;
    return (
      <PassDeviceScreen
        playerName={targetName}
        message={`Pasa el dispositivo a ${targetName}. Es su turno.`}
        onBack={() => {
          dispatch({ type: 'RESTART' });
          setFlow('menu');
        }}
        onConfirm={() => {
          dispatch({ type: 'CONFIRM_PASS' });
          setFlow('play');
        }}
      />
    );
  }

  if (onlineMode === 'online') {
    const onlineState = onlineGameState || state;
    const roomUrl = `${window.location.origin}${window.location.pathname}?room=${roomId}`;
    
    return (
      <>
        <GameBoard
          state={onlineState}
          dispatch={dispatchAction || dispatch}
          onExit={() => {
            leaveRoom();
            setFlow('menu');
          }}
          localPlayerIndex={playerRole === 'player1' ? 0 : 1}
        />
        {waitingForOpponent && isHost && roomId && playerRole === 'player1' && (
          <WaitingOpponentModal
            roomCode={roomId}
            roomUrl={roomUrl}
            onCopyLink={() => {
              navigator.clipboard.writeText(roomUrl);
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            }}
            onClose={() => {
              leaveRoom();
              setFlow('menu');
            }}
          />
        )}
      </>
    );
  }

  return (
    <GameBoard
      state={state}
      dispatch={dispatch}
      onExit={() => {
        dispatch({ type: 'RESTART' });
        setFlow('menu');
      }}
    />
  );
}

export default App;