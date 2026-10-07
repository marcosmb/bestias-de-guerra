import { ArrowLeft, BookOpen } from 'lucide-react';

interface RulesScreenProps {
  onBack: () => void;
}

/**
 * Reglamento visual de Bestias de Guerra.
 *
 * La guía de Meta AI es un documento HTML completo, con su propio diseño.
 * Se muestra como documento HTML dentro de un marco de lectura en lugar de
 * convertirlo a texto/Markdown. Así se conservan estilos, tablas, bloques,
 * iconos y maquetación responsive del reglamento.
 */
const RULES_URL =
  'https://raw.githubusercontent.com/marcosmb/bestias-de-guerra/fix/online-stability/docs/reglas-meta/Bestias-De-Guerra-Guia.html';

export function RulesScreen({ onBack }: RulesScreenProps) {
  return (
    <div className="bg-ink-950 h-[100dvh] min-h-0 text-ink-100 flex flex-col">
      <header className="shrink-0 z-30 border-b border-gold-500/20 bg-ink-950/95 backdrop-blur-md shadow-lg">
        <div className="mx-auto flex w-full max-w-[1500px] items-center gap-3 px-3 py-3 sm:px-5 lg:px-7">
          <button
            type="button"
            onClick={onBack}
            className="shrink-0 rounded-lg border border-ink-600 bg-ink-800 px-3 py-2 font-display text-xs font-bold text-ink-200 transition-colors hover:border-gold-400 hover:bg-ink-700 hover:text-gold-300 flex items-center gap-1.5"
            aria-label="Volver al menú"
          >
            <ArrowLeft size={18} />
            <span className="hidden sm:inline">Atrás</span>
          </button>

          <div className="flex min-w-0 items-center gap-2">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-gold-500/25 bg-gold-400/10">
              <BookOpen size={19} className="text-gold-400" />
            </div>
            <div className="min-w-0">
              <h1 className="truncate font-display text-base font-black text-gold-300 sm:text-lg">
                Reglamento de Bestias de Guerra
              </h1>
              <p className="truncate text-[10px] text-ink-400 sm:text-xs">
                Guía completa · lectura visual
              </p>
            </div>
          </div>
        </div>
      </header>

      <main className="relative min-h-0 flex-1 overflow-hidden bg-[radial-gradient(circle_at_top,rgba(230,185,78,0.05),transparent_35%)]">
        <div className="h-full w-full p-2 sm:p-3 lg:p-4">
          <div className="h-full w-full overflow-hidden rounded-xl border border-ink-700 bg-ink-900 shadow-2xl">
            <iframe
              title="Reglamento oficial de Bestias de Guerra"
              src={RULES_URL}
              className="block h-full w-full border-0 bg-white"
              loading="eager"
            />
          </div>
        </div>
      </main>
    </div>
  );
}
