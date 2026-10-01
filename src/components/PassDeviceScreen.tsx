import { Smartphone, ChevronRight, Users, Shield } from 'lucide-react';

interface PassDeviceProps {
  playerName: string;
  onConfirm: () => void;
  message?: string;
}

export function PassDeviceScreen({ playerName, onConfirm, message }: PassDeviceProps) {
  return (
    <div className="bg-ink-900 flex flex-col items-center justify-center px-6 animate-fade-in" style={{ minHeight: '100dvh' }}>
      {/* Icon with glow */}
      <div className="animate-pulse-glow w-24 h-24 rounded-2xl border-2 border-gold-500/40 flex items-center justify-center mb-6 bg-gold-500/5">
        <Smartphone size={44} className="text-gold-400" />
      </div>

      {/* Title */}
      <h2 className="font-display text-2xl font-bold text-gold-300 mb-3 text-center">
        Pasa el dispositivo
      </h2>

      {/* Message */}
      <p className="text-base text-ink-200 text-center mb-2 font-medium">
        {message ?? `Entrega el dispositivo a ${playerName}`}
      </p>

      {/* Privacy warning */}
      <div className="flex items-center gap-2 text-xs text-ink-400 text-center mb-8 max-w-xs bg-ink-800/50 rounded-lg px-4 py-2">
        <Shield size={14} className="text-azure-400 flex-shrink-0" />
        <span>Asegúrate de que el otro jugador no pueda ver tus cartas antes de continuar.</span>
      </div>

      {/* Player indicator */}
      <div className="flex items-center gap-2 mb-6 bg-ink-800/50 rounded-full px-4 py-2">
        <Users size={16} className="text-gold-400" />
        <span className="text-gold-300 font-display font-bold">{playerName}</span>
      </div>

      {/* Confirm button */}
      <button
        onClick={onConfirm}
        className="px-8 py-3 rounded-xl bg-gradient-to-r from-gold-500 to-gold-400 text-ink-900 font-display font-bold hover:from-gold-400 hover:to-gold-300 shadow-glow btn-press flex items-center gap-2"
      >
        Estoy listo
        <ChevronRight size={18} />
      </button>
    </div>
  );
}
