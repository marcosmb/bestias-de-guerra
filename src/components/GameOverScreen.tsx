import { useEffect, useRef } from 'react';
import { Trophy, RotateCcw, Skull, Crown, Sparkles } from 'lucide-react';
import { playSound, vibrate, initAudio } from '@/game/audio';

interface GameOverProps {
  winnerName: string;
  loserName: string;
  /** true si el jugador (no el rival/CPU) ha ganado */
  playerWon: boolean;
  isDraw?: boolean;
  onRestart: () => void;
}

export function GameOverScreen({ winnerName, loserName, playerWon, isDraw, onRestart }: GameOverProps) {
  // Sonido de victoria/derrota — se dispara una sola vez al montar la pantalla
  const playedRef = useRef(false);
  useEffect(() => {
    initAudio();
    if (playedRef.current) return;
    playedRef.current = true;
    if (isDraw) {
      playSound('defeat');
      vibrate([100, 100, 100]);
    } else if (playerWon) {
      playSound('victory');
      vibrate([100, 50, 100, 50, 200]);
    } else {
      playSound('defeat');
      vibrate([200, 100, 200]);
    }
  }, [playerWon, isDraw]);

  return (
    <div className="bg-ink-900 flex flex-col items-center justify-center px-6 animate-fade-in relative overflow-hidden" style={{ minHeight: '100dvh' }}>
      {/* Background particles */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {Array.from({ length: 20 }).map((_, i) => (
          <div
            key={i}
            className="absolute w-1 h-1 bg-gold-400/30 rounded-full"
            style={{
              left: `${Math.random() * 100}%`,
              top: `${Math.random() * 100}%`,
              animation: `floatDamage ${2 + Math.random() * 3}s ease-in-out infinite`,
              animationDelay: `${Math.random() * 2}s`,
            }}
          />
        ))}
      </div>

      {/* Trophy with glow */}
      <div className="animate-burst relative mb-6">
        <div className="w-28 h-28 rounded-full bg-gradient-to-br from-gold-400/20 to-gold-600/20 border-2 border-gold-400/50 flex items-center justify-center animate-pulse-glow">
          {isDraw ? <Sparkles size={56} className="text-gold-300" /> : <Trophy size={56} className="text-gold-300" />}
        </div>
        {!isDraw && (
          <div className="absolute -top-2 -right-2">
            <Sparkles size={24} className="text-gold-400 animate-pulse" />
          </div>
        )}
      </div>

      {/* Victory text */}
      <h1 className="font-display text-4xl font-black text-transparent bg-clip-text bg-gradient-to-r from-gold-300 via-gold-400 to-gold-300 mb-3 text-center animate-scale-in">
        {isDraw ? '¡Empate!' : '¡Victoria!'}
      </h1>

      {/* Winner name */}
      <div className="flex items-center gap-2 mb-2 animate-scale-in" style={{ animationDelay: '0.1s' }}>
        {isDraw ? <Sparkles size={20} className="text-gold-400" /> : <Crown size={20} className="text-gold-400" />}
        <p className="text-2xl text-white font-display font-bold">{winnerName}</p>
      </div>

      {/* Loser */}
      {!isDraw && (
        <div className="flex items-center gap-1.5 text-sm text-ink-300 mb-10 animate-scale-in" style={{ animationDelay: '0.2s' }}>
          <Skull size={14} className="text-crimson-400" />
          <span>{loserName} ha sido derrotado</span>
        </div>
      )}
      {isDraw && <div className="mb-10" />}

      {/* Restart button */}
      <button
        onClick={onRestart}
        className="px-8 py-3 rounded-xl bg-gradient-to-r from-gold-500 to-gold-400 text-ink-900 font-display font-bold hover:from-gold-400 hover:to-gold-300 shadow-glow btn-press flex items-center gap-2 animate-scale-in"
        style={{ animationDelay: '0.3s' }}
      >
        <RotateCcw size={18} />
        Nueva partida
      </button>
    </div>
  );
}
