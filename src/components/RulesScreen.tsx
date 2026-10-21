import { ArrowLeft, BookOpen } from 'lucide-react';
import rulesHtml from '../../docs/reglas-meta/Bestias-De-Guerra-Guia.html?raw';

interface RulesScreenProps {
  onBack: () => void;
  appearanceMode: import('./ThemePicker').AppearanceMode;
}

/**
 * Reglamento visual de Bestias de Guerra.
 *
 * La guía de Meta AI es un documento HTML completo, con su propio diseño.
 * Se muestra como documento HTML dentro de un marco de lectura en lugar de
 * convertirlo a texto/Markdown. Así se conservan estilos, tablas, bloques,
 * iconos y maquetación responsive del reglamento.
 */
export function RulesScreen({ onBack, appearanceMode }: RulesScreenProps) {
  const tema2RulesCss = '<style>:root{color-scheme:dark}*{box-sizing:border-box}body{background:#080d18!important;color:#f8fafc!important;font-family:Inter,system-ui,sans-serif!important;line-height:1.7}header,nav,aside{background:linear-gradient(180deg,rgba(26,39,66,.96),rgba(10,16,30,.94))!important;border-color:rgba(255,255,255,.12)!important;box-shadow:0 12px 36px rgba(0,0,0,.35)}main,article,section,.card,.panel,.content,.rule{background:linear-gradient(145deg,rgba(26,39,66,.88),rgba(10,16,30,.9))!important;color:#f8fafc!important;border:1px solid rgba(255,255,255,.12)!important;border-radius:16px;box-shadow:0 12px 32px rgba(0,0,0,.25),inset 0 1px 0 rgba(255,255,255,.06)}h1,h2,h3,strong{color:#f4c45e!important}p,li,td,th,label{color:#e2e8f0!important}a,button{border-radius:10px!important}button{background:linear-gradient(135deg,#ffe29a,#c58a25)!important;color:#211707!important;border:1px solid rgba(255,226,154,.7)!important;padding:.65rem 1rem}table{border-collapse:collapse}td,th{border-color:rgba(255,255,255,.12)!important}img{max-width:100%;height:auto}</style>';
  const tema3RulesCss = '<style>:root{color-scheme:light}*{box-sizing:border-box}body{background:#F5F2E9!important;color:#202838!important;font-family:Inter,system-ui,sans-serif!important;line-height:1.75}header,nav,aside{background:#FFFEFA!important;border-color:#D5CDBD!important;box-shadow:0 12px 30px rgba(52,42,20,.07)}main,article,section,.card,.panel,.content,.rule{background:#FFFEFA!important;color:#202838!important;border:1px solid #D5CDBD!important;border-radius:16px;box-shadow:0 12px 32px rgba(52,42,20,.06)}h1,h2,h3{font-family:"Cinzel Decorative",Georgia,serif!important;color:#202838!important}h2,h3{border-left:4px solid #B8892E;padding-left:.7rem}strong{color:#202838!important}p,li,td,th,label{color:#354052!important}a{color:#8B651D!important}button{border-radius:10px!important;background:linear-gradient(135deg,#E8C66A,#B8892E)!important;color:#2B1D0A!important;border:1px solid #B8892E!important;padding:.65rem 1rem}table{border-collapse:collapse}td,th{border-color:#D5CDBD!important}img{max-width:100%;height:auto}</style>';
  const themedRulesHtml = rulesHtml.includes('</head>') ? rulesHtml.replace('</head>', (appearanceMode === 'tema2' ? tema2RulesCss : appearanceMode === 'tema3' ? tema3RulesCss : '') + '</head>') : rulesHtml;
  return (
    <div className={`bg-ink-950 h-[100dvh] min-h-0 text-ink-100 flex flex-col ${appearanceMode === "tema2" ? "theme-tema2-rules" : appearanceMode === "tema3" ? "theme-tema3-rules" : ""}`}>
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
              srcDoc={themedRulesHtml}
              className="block h-full w-full border-0 bg-white"
              loading="eager"
            />
          </div>
        </div>
      </main>
    </div>
  );
}
