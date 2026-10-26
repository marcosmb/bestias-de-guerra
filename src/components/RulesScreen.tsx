import { ArrowLeft, BookOpen } from 'lucide-react';
import rulesHtml from '../../docs/reglas-meta/Bestias-De-Guerra-Guia.html?raw';

interface RulesScreenProps {
  onBack: () => void;
  appearanceMode: import('./ThemePicker').AppearanceMode;
  overlay?: boolean;
}

/**
 * Reglamento visual de Bestias de Guerra.
 *
 * La guía de Meta AI es un documento HTML completo, con su propio diseño.
 * Se muestra como documento HTML dentro de un marco de lectura en lugar de
 * convertirlo a texto/Markdown. Así se conservan estilos, tablas, bloques,
 * iconos y maquetación responsive del reglamento.
 */
export function RulesScreen({ onBack, appearanceMode, overlay = false }: RulesScreenProps) {
  const tema2RulesCss = '<style>:root{color-scheme:dark}*{box-sizing:border-box}body{background:#080d18!important;color:#f8fafc!important;font-family:Inter,system-ui,sans-serif!important;line-height:1.7}header,nav,aside{background:linear-gradient(180deg,rgba(26,39,66,.96),rgba(10,16,30,.94))!important;border-color:rgba(255,255,255,.12)!important;box-shadow:0 12px 36px rgba(0,0,0,.35)}article,section,.card,.panel,.content,.rule{background:linear-gradient(145deg,rgba(26,39,66,.88),rgba(10,16,30,.9))!important;color:#f8fafc!important;border:1px solid rgba(255,255,255,.12)!important;border-radius:16px;box-shadow:0 12px 32px rgba(0,0,0,.25),inset 0 1px 0 rgba(255,255,255,.06)}body,body *{color:#e2e8f0!important}.toc,.stat,.callout,.note,.tag,th{color:#111827!important}.toc *,.stat *,.callout *,.note *,.tag *,th *{color:#111827!important}.toc a{color:#111827!important}.tag{background:#efe6d3!important}.callout{background:#fbf7ee!important}.callout.ok{background:#eef6f0!important;color:#263b2d!important}.callout.ok *{color:#263b2d!important}.callout.warn{background:#fbf0ed!important}.note{background:#f7f3eb!important}.stat{background:#f8f5ee!important}th{background:#f5efe2!important}body :is(input,textarea,select){background:#fff!important;color:#111827!important}h1,h2,h3,strong{color:#f4c45e!important}.toc strong,.stat strong,.callout strong,.note strong,.tag strong,th strong{color:#111827!important}a,button{border-radius:10px!important}button{background:linear-gradient(135deg,#ffe29a,#c58a25)!important;color:#211707!important;border:1px solid rgba(255,226,154,.7)!important;padding:.65rem 1rem}table{border-collapse:collapse}td,th{border-color:rgba(255,255,255,.12)!important}img{max-width:100%;height:auto}</style>';
  const tema4RulesCss = '<style>:root{color-scheme:light}*{box-sizing:border-box}html,body{background:transparent!important;color:#f8fafc!important;font-family:Inter,system-ui,sans-serif!important;line-height:1.7;scrollbar-color:rgba(148,163,184,.7) transparent;scrollbar-width:thin}*::-webkit-scrollbar{width:10px;height:10px}*::-webkit-scrollbar-track{background:transparent!important}*::-webkit-scrollbar-thumb{background:rgba(148,163,184,.65);border-radius:8px;border:2px solid transparent;background-clip:padding-box}header,nav:not(.toc),aside{background:linear-gradient(180deg,rgba(26,39,66,.96),rgba(10,16,30,.94))!important;border-color:rgba(255,255,255,.12)!important;box-shadow:0 12px 36px rgba(0,0,0,.35)}main,article,section,.card,.panel,.content,.rule{background:linear-gradient(145deg,rgba(26,39,66,.88),rgba(10,16,30,.9))!important;color:#f8fafc!important;border:1px solid rgba(255,255,255,.12)!important;border-radius:16px;box-shadow:0 12px 32px rgba(0,0,0,.25),inset 0 1px 0 rgba(255,255,255,.06)}body,body *{color:#e2e8f0!important}body .callout,body .callout *{color:#263b2d!important}body .callout.info,body .callout.info *{color:#263747!important}body .callout.warn,body .callout.warn *{color:#54312b!important}body .callout.ok,body .callout.ok *{color:#263b2d!important}body .toc,body .toc *,body .stat,body .stat *,body .note,body .note *,body .tag,body .tag *,body th,body th *{color:#111827!important}body .note{background:#f7f3eb!important}body .toc{display:flex!important;align-items:center;flex-wrap:wrap;gap:8px;margin:14px 0 20px!important;padding:12px 14px!important;position:sticky;top:10px;z-index:10;background:rgba(255,253,248,.98)!important;border:1px solid #d5cdbd!important;border-radius:16px!important;backdrop-filter:blur(8px);box-shadow:0 5px 18px rgba(56,42,20,.06)!important}body .toc strong{display:inline-block;color:#111827!important;margin:0 8px 0 0!important;font-size:12px!important;font-weight:800!important;text-transform:uppercase;letter-spacing:.08em}body .toc a{display:inline-block!important;padding:5px 7px!important;margin:0!important;border:1px solid transparent!important;border-radius:8px!important;background:transparent!important;color:#111827!important;font-size:12px!important;font-weight:700!important;line-height:1.5!important;text-decoration:none!important;box-shadow:none!important;transition:background .15s ease,color .15s ease!important}body .toc a:hover{background:#efe6d3!important;color:#705a2b!important}body .toc a:focus-visible{outline:2px solid #b8892e!important;outline-offset:2px!important}body .callout{background:#fbf7ee!important}body .callout.ok{background:#eef6f0!important}body .callout.info{background:#eef4f8!important}body .callout.warn{background:#fbf0ed!important}h1,h2,h3,strong{color:#f4c45e!important}body .callout strong{color:inherit!important}a,button{border-radius:10px!important}button{background:linear-gradient(135deg,#ffe29a,#c58a25)!important;color:#211707!important;border:1px solid rgba(255,226,154,.7)!important;padding:.65rem 1rem}table{border-collapse:collapse}td,th{border-color:rgba(255,255,255,.12)!important}img{max-width:100%;height:auto}</style>';
  const tema3RulesCss = '<style>:root{color-scheme:light}*{box-sizing:border-box}body{background:#F5F2E9!important;color:#202838!important;font-family:Inter,system-ui,sans-serif!important;line-height:1.75}header,nav,aside{background:#FFFEFA!important;border-color:#D5CDBD!important;box-shadow:0 12px 30px rgba(52,42,20,.07)}main,article,section,.card,.panel,.content,.rule{background:#FFFEFA!important;color:#202838!important;border:1px solid #D5CDBD!important;border-radius:16px;box-shadow:0 12px 32px rgba(52,42,20,.06)}h1,h2,h3{font-family:"Cinzel Decorative",Georgia,serif!important;color:#202838!important}h2,h3{border-left:4px solid #B8892E;padding-left:.7rem}strong{color:#202838!important}p,li,td,th,label{color:#354052!important}a{color:#8B651D!important}button{border-radius:10px!important;background:linear-gradient(135deg,#E8C66A,#B8892E)!important;color:#2B1D0A!important;border:1px solid #B8892E!important;padding:.65rem 1rem}table{border-collapse:collapse}td,th{border-color:#D5CDBD!important}img{max-width:100%;height:auto}</style>';
  const themedRulesHtml = rulesHtml.includes('</head>') ? rulesHtml.replace('</head>', (appearanceMode === 'tema4' ? tema4RulesCss : appearanceMode === 'tema2' ? tema2RulesCss : appearanceMode === 'tema3' ? tema3RulesCss : '') + '</head>') : rulesHtml;
  return (
    <div className={`${overlay ? "bg-transparent" : "bg-ink-950"} h-[100dvh] min-h-0 text-ink-100 flex flex-col ${(appearanceMode === "tema2" || appearanceMode === "tema4") ? "theme-tema2-rules" : appearanceMode === "tema3" ? "theme-tema3-rules" : ""} ${overlay ? "theme-tema4-rules-overlay fixed inset-0 z-[60]" : ""}`}>
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

      <main className={`relative min-h-0 flex-1 overflow-hidden ${overlay ? "bg-transparent" : "bg-[radial-gradient(circle_at_top,rgba(230,185,78,0.05),transparent_35%)]"}`}>
        <div className="h-full w-full p-2 sm:p-3 lg:p-4">
          <div className={`h-full w-full overflow-hidden rounded-xl border border-ink-700 ${overlay ? "bg-transparent" : "bg-ink-900"} shadow-2xl`}>
            <iframe
              title="Reglamento oficial de Bestias de Guerra"
              srcDoc={themedRulesHtml}
              className={`block h-full w-full border-0 ${overlay ? "bg-transparent" : "bg-white"}`}
              loading="eager"
            />
          </div>
        </div>
      </main>
    </div>
  );
}
