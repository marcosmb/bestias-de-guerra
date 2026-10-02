import { useEffect, useMemo, useState } from 'react';
import {
  History,
  ArrowLeft,
  Copy,
  Download,
  Check,
  ChevronDown,
  ChevronUp,
  Trophy,
  Skull,
  AlertTriangle,
  Ban,
} from 'lucide-react';
import {
  exportFileName,
  historyToText,
  serializeHistoryPretty,
  type MatchHistory,
} from '@/game/history';

interface HistoryScreenProps {
  history: MatchHistory | null;
  onBack: () => void;
}

const REASON_STYLE: Record<string, { icon: typeof Trophy; ring: string; badge: string }> = {
  'victoria-0-lp': { icon: Trophy, ring: 'border-gold-400/60', badge: 'text-gold-300' },
  'empate-0-0': { icon: Ban, ring: 'border-ink-400/60', badge: 'text-ink-200' },
  'victoria-stalemate': { icon: AlertTriangle, ring: 'border-crimson-400/60', badge: 'text-crimson-300' },
  'empate-stalemate': { icon: AlertTriangle, ring: 'border-ink-400/60', badge: 'text-ink-200' },
  otro: { icon: Skull, ring: 'border-ink-500/60', badge: 'text-ink-300' },
};

function EndBanner({ history }: { history: MatchHistory }) {
  const end = history.end;
  if (!end) {
    return (
      <div className="rounded-xl border border-azure-500/40 bg-azure-500/10 px-4 py-3 mb-4">
        <p className="font-display font-bold text-azure-300 text-sm">Partida EN CURSO</p>
        <p className="text-ink-300 text-xs mt-1">
          El historial se está guardando progresivamente. Se actualiza con cada movimiento.
        </p>
      </div>
    );
  }

  const style = REASON_STYLE[end.reason] ?? REASON_STYLE.otro;
  const Icon = style.icon;
  const trigger = history.entries[end.triggerIndex];

  return (
    <div className={`rounded-xl border-2 ${style.ring} bg-ink-800/80 px-4 py-4 mb-4`}>
      <div className="flex items-center gap-2 mb-2">
        <Icon size={22} className={style.badge} />
        <p className={`font-display text-xl font-black ${style.badge}`}>
          {end.isDraw ? '¡EMPATE!' : `¡VICTORIA DE ${end.playerNames[end.winner ?? 0]}!`}
        </p>
      </div>

      <dl className="text-xs space-y-1.5">
        <div className="flex gap-2">
          <dt className="text-ink-400 w-28 shrink-0">Motivo</dt>
          <dd className={`font-bold ${style.badge}`}>{end.reasonLabel}</dd>
        </div>
        <div className="flex gap-2">
          <dt className="text-ink-400 w-28 shrink-0">Regla</dt>
          <dd className="text-ink-200">{end.rule}</dd>
        </div>
        <div className="flex gap-2">
          <dt className="text-ink-400 w-28 shrink-0">Condición</dt>
          <dd className="text-ink-100">{end.condition}</dd>
        </div>
        <div className="flex gap-2">
          <dt className="text-ink-400 w-28 shrink-0">LP</dt>
          <dd className="text-ink-100">
            J1 ({end.playerNames[0]}) = {end.lp[0]} · J2 ({end.playerNames[1]}) = {end.lp[1]}
          </dd>
        </div>
        <div className="flex gap-2">
          <dt className="text-ink-400 w-28 shrink-0">winner / isDraw</dt>
          <dd className="text-ink-100 font-mono">
            winner={String(end.winner)} · isDraw={String(end.isDraw)}
          </dd>
        </div>
        <div className="flex gap-2">
          <dt className="text-ink-400 w-28 shrink-0">Turno</dt>
          <dd className="text-ink-100">
            {end.turn} · activo: {end.currentPlayerName} · phase={end.phase}
          </dd>
        </div>
        <div className="flex gap-2">
          <dt className="text-ink-400 w-28 shrink-0">Restantes</dt>
          <dd className="text-ink-100">
            mazo J1={end.decksLeft[0]} J2={end.decksLeft[1]} · mano J1={end.handsLeft[0]} J2={end.handsLeft[1]} ·
            campo J1={end.fieldsCount[0]} J2={end.fieldsCount[1]}
          </dd>
        </div>
        <div className="flex gap-2">
          <dt className="text-ink-400 w-28 shrink-0">Última acción</dt>
          <dd className="text-ink-100">
            {end.lastAction ? `${end.lastAction.actionLabel} [${end.lastAction.actionType}]` : '—'}
          </dd>
        </div>
        <div className="flex gap-2">
          <dt className="text-ink-400 w-28 shrink-0">Provocó el final</dt>
          <dd className="text-ink-100">
            #{end.triggerIndex} {end.triggerAction.actionLabel} [{end.triggerAction.actionType}]
          </dd>
        </div>
      </dl>

      {trigger && (
        <details className="mt-3 rounded-lg bg-ink-900/70 border border-ink-700 p-3">
          <summary className="cursor-pointer text-xs text-gold-300 font-semibold">
            Estado completo del movimiento #{trigger.index} (el que terminó la partida)
          </summary>
          <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-3 text-[11px] font-mono">
            <div>
              <p className="text-ink-400 mb-1 not-italic">ANTES</p>
              <p>LP: {trigger.before.players[0].lp} / {trigger.before.players[1].lp}</p>
              <p>Mano: {trigger.before.players[0].handCount} / {trigger.before.players[1].handCount}</p>
              <p>Mazo: {trigger.before.players[0].deckCount} / {trigger.before.players[1].deckCount}</p>
              <p>Cem: {trigger.before.players[0].graveyardCount} / {trigger.before.players[1].graveyardCount}</p>
              <p>Campo: {trigger.before.players[0].field.filter((f) => f.cardId).length} / {trigger.before.players[1].field.filter((f) => f.cardId).length}</p>
              <p>Cuota: {trigger.before.players[0].cardsPlayedThisTurn}/3 · {trigger.before.players[1].cardsPlayedThisTurn}/3</p>
              <p>phase={trigger.before.phase} activo={trigger.before.currentPlayerName}</p>
            </div>
            <div>
              <p className="text-ink-400 mb-1 not-italic">DESPUÉS</p>
              <p>LP: {trigger.after.players[0].lp} / {trigger.after.players[1].lp}</p>
              <p>Mano: {trigger.after.players[0].handCount} / {trigger.after.players[1].handCount}</p>
              <p>Mazo: {trigger.after.players[0].deckCount} / {trigger.after.players[1].deckCount}</p>
              <p>Cem: {trigger.after.players[0].graveyardCount} / {trigger.after.players[1].graveyardCount}</p>
              <p>Campo: {trigger.after.players[0].field.filter((f) => f.cardId).length} / {trigger.after.players[1].field.filter((f) => f.cardId).length}</p>
              <p>Cuota: {trigger.after.players[0].cardsPlayedThisTurn}/3 · {trigger.after.players[1].cardsPlayedThisTurn}/3</p>
              <p>phase={trigger.after.phase} winner={String(trigger.after.winner)} isDraw={String(trigger.after.isDraw)}</p>
            </div>
          </div>
          {trigger.events.length > 0 && (
            <div className="mt-3">
              <p className="text-ink-400 text-[11px] mb-1 not-italic">Sucesos</p>
              <ul className="text-[11px] text-ink-200 space-y-0.5">
                {trigger.events.map((ev, i) => (
                  <li key={i}>· [{ev.type}] {ev.detail}</li>
                ))}
              </ul>
            </div>
          )}
        </details>
      )}
    </div>
  );
}

export function HistoryScreen({ history, onBack }: HistoryScreenProps) {
  const [copied, setCopied] = useState(false);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  const text = useMemo(() => historyToText(history), [history]);
  const empty = !history || history.entries.length === 0;

  useEffect(() => {
    setCopied(false);
  }, [history]);

  const toggle = (i: number) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  };

  const expandAll = () => {
    if (!history) return;
    setExpanded((prev) => (prev.size === history.entries.length ? new Set() : new Set(history.entries.map((e) => e.index))));
  };

  const handleCopy = async () => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        // Fallback para navegadores sin API de portapapeles o sin contexto seguro.
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2500);
    } catch {
      setCopied(false);
    }
  };

  const handleExport = () => {
    if (!history) return;
    const blob = new Blob([serializeHistoryPretty(history)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = exportFileName(history);
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    // `index.css` fija `html, body, #root { overflow: hidden }` porque el
    // tablero gestiona su propio scroll. Esta pantalla NO puede usar el scroll
    // del documento, así que es su propio contenedor desplazable: `h-full`
    // (no `min-h-dvh`, que desbordaría sin ser alcanzable) + `overflow-y-auto`.
    <div className="bg-ink-900 flex flex-col h-full overflow-hidden">
      {/* Cabecera fija */}
      <header className="shrink-0 z-20 bg-ink-900 border-b border-ink-700 px-3 py-2 flex items-center gap-2">
        <button
          onClick={onBack}
          className="px-2.5 py-1.5 rounded-lg bg-ink-800 border border-ink-600 text-ink-200 text-xs hover:border-ink-400 flex items-center gap-1 shrink-0"
        >
          <ArrowLeft size={14} />
          Menú
        </button>
        <div className="flex items-center gap-1.5 min-w-0">
          <History size={15} className="text-gold-400 shrink-0" />
          <h1 className="font-display font-bold text-gold-300 text-xs sm:text-sm truncate">
            Historial última partida
          </h1>
        </div>
        <div className="ml-auto flex items-center gap-1.5 shrink-0">
          <button
            onClick={handleCopy}
            disabled={empty}
            className={`px-2.5 py-1.5 rounded-lg text-xs flex items-center gap-1 font-semibold disabled:opacity-40 disabled:cursor-not-allowed ${
              copied
                ? 'bg-emerald-500/25 border border-emerald-400/60 text-emerald-300'
                : 'bg-gold-400 text-ink-900 border border-gold-400 hover:bg-gold-300'
            }`}
            title="Copiar el historial completo como texto para pegarlo en otro sitio"
          >
            {copied ? <Check size={13} /> : <Copy size={13} />}
            {copied ? 'Copiado' : 'Copiar'}
          </button>
          <button
            onClick={handleExport}
            disabled={empty}
            className="px-2.5 py-1.5 rounded-lg bg-ink-800 border border-ink-600 text-ink-200 text-xs hover:border-ink-400 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1 shrink-0"
            title="Descargar el historial completo como .json"
          >
            <Download size={13} />
            <span className="hidden sm:inline">Exportar</span>
          </button>
        </div>
      </header>

      {/* Contenido desplazable: al vivir dentro de `#root` (overflow:hidden)
          es el único contenedor que puede desplazarse. `min-h-0` es
          imprescindible para que `flex-1` respete el alto disponible. */}
      <main className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-3 py-3 max-w-4xl w-full mx-auto">
        {empty ? (
          <div className="text-center py-16">
            <History size={40} className="text-ink-600 mx-auto mb-3" />
            <p className="text-ink-300 text-sm">No hay ninguna partida registrada.</p>
            <p className="text-ink-500 text-xs mt-1">Juega una partida y vuelve aquí para verla.</p>
          </div>
        ) : (
          <>
            <div className="text-[11px] text-ink-400 mb-3">
              {history.entries.length} movimiento{history.entries.length === 1 ? '' : 's'} · modo{' '}
              {history.mode} · dificultad {history.difficulty} · guardado {new Date(history.savedAt).toLocaleString('es-ES')}
            </div>

            <EndBanner history={history} />

            {/* Acción principal de depuración: copiar el historial COMPLETO
                para pegarlo en una conversación y analizar el fallo. */}
            <div className="flex flex-wrap items-center gap-2 mb-3 p-3 rounded-xl border border-gold-500/30 bg-gold-500/5">
              <button
                onClick={handleCopy}
                className={`px-4 py-2.5 rounded-lg text-sm font-display font-bold flex items-center gap-2 transition-colors ${
                  copied
                    ? 'bg-emerald-500/25 border border-emerald-400/60 text-emerald-300'
                    : 'bg-gold-400 text-ink-900 border border-gold-400 hover:bg-gold-300'
                }`}
              >
                {copied ? <Check size={16} /> : <Copy size={16} />}
                {copied ? '¡Copiado al portapapeles!' : 'Copiar historial de la partida'}
              </button>
              <button
                onClick={handleExport}
                className="px-4 py-2.5 rounded-lg text-sm font-semibold bg-ink-800 border border-ink-600 text-ink-200 hover:border-gold-400 hover:text-gold-300 transition-colors flex items-center gap-2"
              >
                <Download size={16} />
                Exportar .json
              </button>
              <p className="text-[11px] text-ink-400 w-full sm:w-auto sm:flex-1 min-w-[12rem]">
                {history.entries.length} movimientos en texto plano: resultado, motivo, condición del
                final y el estado antes/después de cada acción.
              </p>
            </div>

            <div className="flex items-center justify-between mb-2">
              <p className="text-[10px] uppercase tracking-widest text-ink-400">
                Movimientos ({history.entries.length})
              </p>
              <button
                onClick={expandAll}
                className="text-[11px] text-ink-400 hover:text-gold-300 flex items-center gap-1"
              >
                {expanded.size === history.entries.length ? 'Contraer todo' : 'Desplegar todo'}
              </button>
            </div>

            <ol className="space-y-1.5">
              {history.entries.map((e) => {
                const isOpen = expanded.has(e.index);
                const isTrigger = history.end?.triggerIndex === e.index;
                return (
                  <li
                    key={e.index}
                    className={`rounded-lg border bg-ink-800/60 overflow-hidden ${
                      isTrigger ? 'border-gold-400/70' : 'border-ink-700'
                    }`}
                  >
                    <button
                      onClick={() => toggle(e.index)}
                      className="w-full text-left px-3 py-2 hover:bg-ink-700/40 flex items-start gap-2"
                    >
                      <span className="text-[10px] text-ink-500 font-mono pt-0.5 w-8 shrink-0">#{e.index}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-[11px] text-ink-400">
                          Turno {e.turn} · {e.actorName ?? '—'}
                        </span>
                        <span className="block text-xs text-ink-100 font-semibold">
                          {e.actionLabel}
                          {!e.accepted && (
                            <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded bg-crimson-500/25 text-crimson-300 border border-crimson-500/40">
                              RECHAZADA
                            </span>
                          )}
                          {isTrigger && (
                            <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded bg-gold-400/25 text-gold-300 border border-gold-400/40">
                              PROVOCÓ EL FINAL
                            </span>
                          )}
                        </span>
                      </span>
                      {isOpen ? (
                        <ChevronUp size={14} className="text-ink-500 shrink-0 mt-0.5" />
                      ) : (
                        <ChevronDown size={14} className="text-ink-500 shrink-0 mt-0.5" />
                      )}
                    </button>

                    {isOpen && (
                      <div className="px-3 pb-3 text-[11px] border-t border-ink-700/70 pt-2">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-0.5 font-mono">
                          <p>
                            <span className="text-ink-400">LP: </span>
                            J1 {e.before.players[0].lp} → {e.after.players[0].lp} | J2{' '}
                            {e.before.players[1].lp} → {e.after.players[1].lp}
                          </p>
                          <p>
                            <span className="text-ink-400">Mano: </span>
                            J1 {e.before.players[0].handCount} → {e.after.players[0].handCount} | J2{' '}
                            {e.before.players[1].handCount} → {e.after.players[1].handCount}
                          </p>
                          <p>
                            <span className="text-ink-400">Mazo: </span>
                            J1 {e.before.players[0].deckCount} → {e.after.players[0].deckCount} | J2{' '}
                            {e.before.players[1].deckCount} → {e.after.players[1].deckCount}
                          </p>
                          <p>
                            <span className="text-ink-400">Cem: </span>
                            J1 {e.before.players[0].graveyardCount} → {e.after.players[0].graveyardCount} | J2{' '}
                            {e.before.players[1].graveyardCount} → {e.after.players[1].graveyardCount}
                          </p>
                          <p>
                            <span className="text-ink-400">Campo: </span>
                            J1 {e.before.players[0].field.filter((f) => f.cardId).length} →{' '}
                            {e.after.players[0].field.filter((f) => f.cardId).length} | J2{' '}
                            {e.before.players[1].field.filter((f) => f.cardId).length} →{' '}
                            {e.after.players[1].field.filter((f) => f.cardId).length}
                          </p>
                          <p>
                            <span className="text-ink-400">Cuota: </span>
                            J1 {e.after.players[0].cardsPlayedThisTurn}/3 | J2{' '}
                            {e.after.players[1].cardsPlayedThisTurn}/3
                          </p>
                          <p className="sm:col-span-2">
                            <span className="text-ink-400">Fase: </span>
                            {e.before.phase} → {e.after.phase}
                            {' · '}
                            <span className="text-ink-400">Activo: </span>
                            {e.before.currentPlayerName} → {e.after.currentPlayerName}
                          </p>
                          {(e.after.winner !== null || e.after.isDraw) && (
                            <p className="sm:col-span-2 text-gold-300">
                              winner={String(e.after.winner)} isDraw={String(e.after.isDraw)}
                            </p>
                          )}
                        </div>

                        {e.cardName && (
                          <p className="mt-2">
                            <span className="text-ink-400">Carta: </span>
                            {e.cardName} <span className="text-ink-500 font-mono">({e.cardId})</span>
                          </p>
                        )}
                        {e.targetName && (
                          <p>
                            <span className="text-ink-400">Objetivo: </span>
                            {e.targetName} <span className="text-ink-500 font-mono">({e.targetId})</span>
                          </p>
                        )}
                        {e.dice !== null && (
                          <p>
                            <span className="text-ink-400">Dado: </span>
                            {e.dice}
                          </p>
                        )}

                        {e.logDelta.length > 0 && (
                          <div className="mt-2">
                            <p className="text-ink-400">Registro del juego:</p>
                            <ul className="text-ink-200">
                              {e.logDelta.map((l, i) => (
                                <li key={i}>· {l}</li>
                              ))}
                            </ul>
                          </div>
                        )}

                        {e.events.length > 0 && (
                          <div className="mt-2">
                            <p className="text-ink-400">Sucesos:</p>
                            <ul className="text-ink-200">
                              {e.events.map((ev, i) => (
                                <li key={i}>
                                  · <span className="text-gold-400/80">[{ev.type}]</span> {ev.detail}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}

                        <p className="mt-2 text-ink-100">
                          <span className="text-ink-400">Resultado: </span>
                          {e.result}
                        </p>

                        {e.after.players.some((p) => p.field.some((f) => f.cardId !== null)) && (
                          <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
                            {[0, 1].map((idx) => (
                              <div key={idx}>
                                <p className="text-ink-400">
                                  Campo J{idx + 1} (después)
                                </p>
                                {e.after.players[idx].field.map((f, i) => (
                                  <p key={i} className="text-ink-300 font-mono">
                                    {f.cardId === null
                                      ? `${i + 1}: —`
                                      : `${i + 1}: ${f.cardName} ${f.effAtk}/${f.effDef}${
                                          f.trapName ? ` · T:${f.trapName}` : ''
                                        }${f.magicName ? ` · M:${f.magicName}` : ''}${
                                          f.controlledBy !== null ? ' · ctrl rival' : ''
                                        }`}
                                  </p>
                                ))}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </li>
                );
              })}
            </ol>

            {/* Estado en blanco: el texto copiado sale de `text` */}
            <pre className="hidden" aria-hidden="true">
              {text}
            </pre>
          </>
        )}
      </main>
    </div>
  );
}