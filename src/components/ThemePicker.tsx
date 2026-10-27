import { useState } from 'react';
import { menuBackgrounds, gameBackgrounds } from '@/generated/backgrounds';
import { X, Check, Shuffle, Moon, Sunrise, Palette } from 'lucide-react';

export type BackgroundMode = 'fixed' | 'slideshow';
export type AppearanceMode = 'dark' | 'tema3' | 'tema4';

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
  appearanceMode: AppearanceMode;
  setAppearanceMode: (mode: AppearanceMode) => void;
}

type ThemeTab = 'menu' | 'board';

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
  appearanceMode,
  setAppearanceMode,
}: ThemePickerProps) {
  const [activeTab, setActiveTab] = useState<ThemeTab>('menu');

  if (!open) return null;

  const isMenuTab = activeTab === 'menu';
  const title = isMenuTab ? 'Fondo del menú' : 'Fondo del tablero';
  const backgrounds = isMenuTab ? menuBackgrounds : gameBackgrounds;
  const count = backgrounds.length;
  const selectedIndex = isMenuTab ? menuIndex : gameIndex;
  const mode = isMenuTab ? menuMode : gameMode;
  const setSelectedIndex = isMenuTab ? setMenuIndex : setGameIndex;
  const setMode = isMenuTab ? setMenuMode : setGameMode;
  const imagePath = (index: number) => backgrounds[index] ?? backgrounds[0] ?? '';

  const chooseRotating = () => setMode('slideshow');
  const chooseFixed = (index: number) => {
    setSelectedIndex(index);
    setMode('fixed');
  };

  return (
    <div
      className={`theme-picker-overlay fixed inset-0 z-[200] flex items-center justify-center bg-black/80 p-3 sm:p-5 ${appearanceMode === "tema4" ? "theme-picker-tema4" : appearanceMode === "tema3" ? "theme-picker-tema3" : ""}`}
      role="dialog"
      aria-modal="true"
      aria-labelledby="theme-picker-title"
      onClick={onClose}
    >
      <div
        className="theme-picker-panel border-2 border-gold-500/50 rounded-2xl p-4 sm:p-6 w-full max-w-2xl max-h-[92dvh] overflow-y-auto shadow-none"
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

        <section className="mb-5 rounded-xl border border-gold-500/30 bg-ink-800/70 p-3">
          <h3 className="font-display font-bold text-gold-300 mb-1">Apariencia del juego</h3>
          <p className="text-ink-200 text-xs mb-3">Cambia el contraste de los paneles y del tablero sin modificar las ilustraciones de las cartas.</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {([
              ['dark', 'Tema original', Moon],
              ['tema3', 'Tema 3: Luz de Guerra', Sunrise],
              ['tema4', 'Tema 4: Copia del original', Moon],
            ] as const).map(([value, label, Icon]) => (
              <button
                key={value}
                type="button"
                onClick={() => setAppearanceMode(value)}
                aria-pressed={appearanceMode === value}
                className={`rounded-lg border px-2 py-3 flex flex-col items-center gap-1 text-xs sm:text-sm font-display font-bold transition-colors ${
                  appearanceMode === value
                    ? 'border-gold-300 bg-gold-300/20 text-gold-200'
                    : 'border-ink-600 bg-ink-900 text-ink-200 hover:border-gold-500/60'
                }`}
              >
                <Icon size={19} />
                {label}
              </button>
            ))}
          </div>
        </section>

        <div className="grid grid-cols-2 gap-2 mb-5" role="tablist" aria-label="Tipo de fondo">
          <button
            id="theme-tab-menu"
            type="button"
            role="tab"
            aria-selected={isMenuTab}
            aria-controls="theme-panel"
            onClick={() => setActiveTab('menu')}
            className={`rounded-xl border px-3 py-3 text-sm sm:text-base font-display font-bold transition-colors ${
              isMenuTab
                ? 'border-gold-400 bg-gold-400/15 text-gold-300'
                : 'border-ink-600 bg-ink-800 text-ink-200 hover:border-gold-500/60'
            }`}
          >
            Fondo del menú
          </button>
          <button
            id="theme-tab-board"
            type="button"
            role="tab"
            aria-selected={!isMenuTab}
            aria-controls="theme-panel"
            onClick={() => setActiveTab('board')}
            className={`rounded-xl border px-3 py-3 text-sm sm:text-base font-display font-bold transition-colors ${
              !isMenuTab
                ? 'border-gold-400 bg-gold-400/15 text-gold-300'
                : 'border-ink-600 bg-ink-800 text-ink-200 hover:border-gold-500/60'
            }`}
          >
            Fondo del tablero
          </button>
        </div>

        <section id="theme-panel" role="tabpanel" aria-labelledby={isMenuTab ? 'theme-tab-menu' : 'theme-tab-board'}>
          <h3 className="font-display font-bold text-gold-300 mb-3">{title}</h3>
          <p className={`${appearanceMode === 'dark' ? 'text-white' : 'text-ink-300'} text-xs mb-3`}>
            Elige una imagen para dejarla fija o selecciona «Fondo rotativo» para alternar automáticamente entre todos los fondos de esta pestaña.
          </p>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <button
              type="button"
              onClick={chooseRotating}
              className={`relative overflow-hidden rounded-xl border-2 aspect-[4/3] bg-ink-800 transition-all ${
                mode === 'slideshow' ? 'border-gold-300 ring-2 ring-gold-400/50' : 'border-ink-600 hover:border-gold-500/70'
              }`}
              aria-label={`Seleccionar fondo rotativo para ${title.toLowerCase()}`}
              aria-pressed={mode === 'slideshow'}
              title="Fondo rotativo"
            >
              <img
                src={imagePath(0)}
                alt=""
                loading="lazy"
                className="absolute inset-0 w-full h-full object-cover"
              />
              <div className="absolute inset-0 bg-black/50 flex flex-col items-center justify-center gap-2 p-2">
                <Shuffle size={28} className="text-gold-300 drop-shadow-lg" />
                <span className="text-white text-sm font-display font-bold text-center">Fondo rotativo</span>
                <span className="text-white/90 text-[10px] text-center">Todos los fondos</span>
              </div>
              {mode === 'slideshow' && (
                <span className="absolute top-2 right-2 rounded-full bg-gold-300 text-ink-900 p-1">
                  <Check size={13} />
                </span>
              )}
            </button>

            {Array.from({ length: count }, (_, index) => {
              const selected = mode === 'fixed' && selectedIndex === index;
              return (
                <button
                  key={`${activeTab}-${index}`}
                  type="button"
                  onClick={() => chooseFixed(index)}
                  className={`relative overflow-hidden rounded-xl border-2 aspect-[4/3] bg-ink-800 transition-all ${
                    selected ? 'border-gold-300 ring-2 ring-gold-400/50' : 'border-ink-600 hover:border-gold-500/70'
                  }`}
                  aria-label={`Seleccionar fondo ${index + 1} de ${title.toLowerCase()}`}
                  aria-pressed={selected}
                  title={`Fondo ${index + 1}`}
                >
                  <img
                    src={imagePath(index)}
                    alt={`Vista previa del fondo ${index + 1}`}
                    loading="lazy"
                    className="absolute inset-0 w-full h-full object-cover"
                  />
                  <span className="absolute bottom-0 inset-x-0 bg-black/75 text-white text-xs font-bold py-1.5">
                    Fondo {index + 1}
                  </span>
                  {selected && (
                    <span className="absolute top-2 right-2 rounded-full bg-gold-300 text-ink-900 p-1">
                      <Check size={13} />
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </section>

        <button
          type="button"
          onClick={onClose}
          className="w-full mt-5 rounded-xl bg-gold-400 text-ink-900 font-display font-bold py-3 hover:bg-gold-300"
        >
          Guardar selección
        </button>
      </div>
    </div>
  );
}
