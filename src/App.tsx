import { useState } from 'react';
import type { Difficulty, GameMode } from '@/game/types';
import { Swords, ChevronRight } from 'lucide-react';
import { useGame } from '@/game/useGame';
import { PassDeviceScreen } from '@/components/PassDeviceScreen';
import { GameBoard } from '@/components/GameBoard';
import { GameOverScreen } from '@/components/GameOverScreen';

type FlowPhase = 'menu' | 'pass' | 'play';

function StartScreen({ onStart }: { onStart: (mode: GameMode, difficulty: Difficulty) => void }) {
  const [mode, setMode] = useState<GameMode>('local');
  const [difficulty, setDifficulty] = useState<Difficulty>('normal');

  return (
    <div className="bg-ink-900 flex flex-col items-center justify-center px-6 py-8" style={{ minHeight: '100dvh' }}>
      <div className="animate-pulse-glow w-20 h-20 rounded-2xl border-2 border-gold-500/40 flex items-center justify-center mb-6">
        <Swords size={36} className="text-gold-400" />
      </div>
      <h1 className="font-display text-3xl sm:text-4xl font-black text-gold-300 mb-2 text-center" style={{ fontSize: 'clamp(1.5rem, 5vw, 2.5rem)' }}>Bestias de Guerra</h1>
      <p className="text-sm text-ink-300 text-center mb-1">Juego de cartas con baraja española</p>
      <p className="text-xs text-ink-400 text-center mb-6 max-w-xs">
        2 jugadores · 48 cartas cada uno · 100 PV · 6 espacios · máx. 9 cartas en mano
      </p>
      <div className="w-full max-w-xs mb-5">
        <p className="text-[10px] uppercase tracking-widest text-ink-400 mb-2">Modo de juego</p>
        <div className="grid grid-cols-2 gap-2">
          {([['local', '2 jugadores'], ['cpu', 'Contra CPU']] as const).map(([value, label]) => (
            <button key={value} onClick={() => setMode(value)} className={`rounded-lg border px-3 py-3 text-sm font-display font-bold transition-colors ${mode === value ? 'border-gold-400 bg-gold-400/15 text-gold-300' : 'border-ink-600 text-ink-300 hover:border-ink-400'}`}>
              {label}
            </button>
          ))}
        </div>
      </div>
      {mode === 'cpu' && (
        <div className="w-full max-w-xs mb-6">
          <p className="text-[10px] uppercase tracking-widest text-ink-400 mb-2">Dificultad</p>
          <div className="grid grid-cols-3 gap-2">
            {([['easy', 'Fácil'], ['normal', 'Normal'], ['hard', 'Difícil']] as const).map(([value, label]) => (
              <button key={value} onClick={() => setDifficulty(value)} className={`rounded-lg border px-2 py-3 text-sm font-display font-bold transition-colors ${difficulty === value ? 'border-azure-400 bg-azure-400/15 text-azure-300' : 'border-ink-600 text-ink-300 hover:border-ink-400'}`}>
                {label}
              </button>
            ))}
          </div>
        </div>
      )}
      <button
        onClick={() => onStart(mode, difficulty)}
        className="px-8 py-3 rounded-xl bg-gold-400 text-ink-900 font-display font-bold hover:bg-gold-300 shadow-glow active:scale-95 transition-all duration-200 flex items-center gap-2"
      >
        Empezar partida
        <ChevronRight size={18} />
      </button>
    </div>
  );
}

function App() {
  const { state, dispatch } = useGame();
  const [flow, setFlow] = useState<FlowPhase>('menu');

  if (state.phase === 'game-over') {
    const winner = state.winner!;
    // En modo CPU el jugador es siempre el índice 0.
    // En modo local siempre hay un ganador humano, así que se trata como victoria.
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

  if (flow === 'menu') {
    return (
      <StartScreen
        onStart={(mode, difficulty) => {
          dispatch({ type: 'START_GAME', mode, difficulty });
          setFlow(mode === 'cpu' ? 'play' : 'pass');
        }}
      />
    );
  }

  if (state.mode === 'local' && (flow === 'pass' || state.phase === 'pass')) {
    const targetName = state.players[state.passTarget].name;
    return (
      <PassDeviceScreen
        playerName={targetName}
        message={`Pasa el dispositivo a ${targetName}. Es su turno.`}
        onConfirm={() => {
          dispatch({ type: 'CONFIRM_PASS' });
          setFlow('play');
        }}
      />
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
