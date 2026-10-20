import { X, Palette, Check } from 'lucide-react';

export type BackgroundMode = 'fixed' | 'slideshow';

interface ThemePickerProps {
  open: boolean;
  onClose: () => void;
  menuIndex: number;
  setMenuIndex: (index: number) => void;
  menuMode: BackgroundMode;
  setMenuMode: (mode: BackgroundMode) => void;
  gameIndex: number;
  setGameIndex: (index: number) => void;
  gameMode: BackgroundMode;
  setGameMode: (mode: BackgroundMode) => void;
}

export function ThemePicker({
  open,
  onClose,
  menuIndex,
  setMenuIndex,
  menuMode,
  setMenuMode,
  gameIndex,
  setGameIndex,
  gameMode,
  setGameMode,
}: ThemePickerProps) {
  if (!open) return null;

  const renderOptions = (
    title: string,
    prefix: string,
    count: number,
    selectedIndex: number,
    setSelectedIndex: (index: number) => void,
    mode: BackgroundMode,
    setMode: (mode: BackgroundMode) => void,
    imagePath: (index: number) => string,
  ) => (
    <section className="mb-6">
      <h3 className="font-display font-bold text-gold-300 mb-3">{title}</h3>
      <div className="grid grid-cols-2 gap-2 mb-3">
        {([
          ['fixed', 'Fondo fijo'],
          ['slideshow', 'Rotación automática'],
        ] as const).map(([value, label]) => (
          <button
            key={value}
            type="button"
            onClick={() => setMode(value)}
            className={`rounded-lg border px-3 py-2 text-xs sm:text-sm font-display font-bold transition-colors ${
              mode === value
                ? 'border-gold-400 bg-gold-400/15 text-gold-300'
                : 'border-ink-600 bg-ink-800 text-ink-200 hover:border-gold-500/60'
            }`}
            aria-pressed={mode === value}
          >
            {label}
          </button>
        ))}
      </div>
      <p className="text-ink-300 text-xs mb-2">
        {mode === 'fixed'
          ? 'El fondo seleccionado permanecerá fijo.'
          : 'Se mostrarán todos los fondos uno a uno, como hasta ahora.'}
      </p>
      <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
        {Array.from({ length: count }, (_, index) => {
          const selected = selectedIndex === index;
          return (
            <button
              key={`${prefix}-${index}`}
              type="button"
              onClick={() => setSelectedIndex(index)}
              className={`relative overflow-hidden rounded-lg border-2 aspect-[4/3] bg-ink-800 transition-all ${
                selected ? 'border-gold-300 ring-2 ring-gold-400/50' : 'border-ink-600 hover:border-gold-500/70'
              }`}
              aria-label={`Seleccionar ${title.toLowerCase()} ${index + 1}`}
              aria-pressed={selected}
              title={`Fondo ${index + 1}`}
            >
              <img
                src={imagePath(index)}
                alt={`Vista previa del fondo ${index + 1}`}
                loading="lazy"
                className="absolute inset-0 w-full h-full object-cover"
              />
              <span className="absolute bottom-0 inset-x-0 bg-black/75 text-white text-[10px] font-bold py-1">
                {index + 1}
              </span>
              {selected && (
                <span className="absolute top-1 right-1 rounded-full bg-gold-300 text-ink-900 p-1">
                  <Check size={12} />
                </span>
              )}
            </button>
          );
        })}
      </div>
    </section>
  );

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 p-3 sm:p-5"
      role="dialog"
      aria-modal="true"
      aria-labelledby="theme-picker-title"
      onClick={onClose}
    >
      <div
        className="bg-ink-900 border-2 border-gold-500/50 rounded-2xl p-4 sm:p-6 w-full max-w-2xl max-h-[92dvh] overflow-y-auto shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 mb-5">
          <div className="flex items-center gap-2">
            <Palette className="text-gold-300" size={22} />
            <h2 id="theme-picker-title" className="font-display text-xl font-bold text-gold-300">Temas y fondos</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-ink-200 hover:bg-ink-800 hover:text-white"
            aria-label="Cerrar temas"
          >
            <X size={22} />
          </button>
        </div>
        {renderOptions(
          'Fondo del menú',
          'menu',
          14,
          menuIndex,
          setMenuIndex,
          menuMode,
          setMenuMode,
          (index) => `/fondos-menu/fondo_menu_${index + 1}.jpg`,
        )}
        <div className="border-t border-ink-700 pt-5">
          {renderOptions(
            'Fondo del tablero',
            'board',
            8,
            gameIndex,
            setGameIndex,
            gameMode,
            setGameMode,
            (index) => `/fondos-juego-tablero/fondos-tablero-juego_${index + 1}.jpg`,
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="w-full rounded-xl bg-gold-400 text-ink-900 font-display font-bold py-3 hover:bg-gold-300"
        >
          Guardar selección
        </button>
      </div>
    </div>
  );
}
