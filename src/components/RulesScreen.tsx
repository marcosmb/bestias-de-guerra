import { useMemo, type ReactNode } from 'react';
import {
  ArrowLeft,
  BookOpen,
  Heart,
  Layers3,
  RotateCcw,
  Shield,
  Sparkles,
  Swords,
  Target,
  Trophy,
  Zap,
} from 'lucide-react';
import rulesText from '../../REGLAS_JUEGO_DEFINITIVAS.md?raw';

interface RulesScreenProps {
  onBack: () => void;
}

type RuleBlock =
  | { kind: 'heading'; level: number; text: string; number: string }
  | { kind: 'paragraph'; text: string }
  | { kind: 'quote'; text: string }
  | { kind: 'unordered'; items: string[] }
  | { kind: 'ordered'; items: string[] }
  | { kind: 'table'; rows: string[][] };

function cleanInlineMarkdown(value: string) {
  return value
    .replace(/\\\\/g, '\\')
    .replace(/\\r/g, '')
    .trim();
}

function inlineMarkdown(value: string): ReactNode[] {
  const text = cleanInlineMarkdown(value);
  const nodes: ReactNode[] = [];
  const pattern = /(\\*\\*[^*]+\\*\\*|\\`[^\\`]+\\`)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index));
    }

    const token = match[0];
    if (token.startsWith('**')) {
      nodes.push(
        <strong key={`strong-${match.index}`} className="font-bold text-ink-100">
          {token.slice(2, -2)}
        </strong>,
      );
    } else {
      nodes.push(
        <code key={`code-${match.index}`} className="rounded bg-ink-950/80 px-1.5 py-0.5 text-[0.9em] text-gold-300">
          {token.slice(1, -1)}
        </code>,
      );
    }

    lastIndex = match.index + token.length;
  }

  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex));
  }

  return nodes;
}

function parseRules(markdown: string): RuleBlock[] {
  const lines = markdown.replace(/\\r/g, '').split('\\n');
  const blocks: RuleBlock[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i].trim();

    if (!line || /^---+$/.test(line)) {
      i += 1;
      continue;
    }

    const heading = line.match(/^(#{1,6})\\s+(.+)$/);
    if (heading) {
      const text = heading[2].trim();
      const number = (text.match(/^(\\d+)\\./) || [])[1] ?? '';
      blocks.push({ kind: 'heading', level: heading[1].length, text, number });
      i += 1;
      continue;
    }

    if (line.startsWith('>')) {
      const quote: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith('>')) {
        quote.push(lines[i].trim().replace(/^>\\s?/, ''));
        i += 1;
      }
      blocks.push({ kind: 'quote', text: quote.join(' ') });
      continue;
    }

    if (line.startsWith('|')) {
      const rows: string[][] = [];
      while (i < lines.length && lines[i].trim().startsWith('|')) {
        const cells = lines[i]
          .trim()
          .replace(/^\\|/, '')
          .replace(/\\|$/, '')
          .split('|')
          .map((cell) => cell.trim());
        if (!cells.every((cell) => /^:?-{3,}:?$/.test(cell))) {
          rows.push(cells);
        }
        i += 1;
      }
      if (rows.length) {
        blocks.push({ kind: 'table', rows });
      }
      continue;
    }

    if (/^[-*]\\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^[-*]\\s+/.test(lines[i].trim())) {
        items.push(lines[i].trim().replace(/^[-*]\\s+/, ''));
        i += 1;
      }
      blocks.push({ kind: 'unordered', items });
      continue;
    }

    if (/^\\d+[.)]\\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\\d+[.)]\\s+/.test(lines[i].trim())) {
        items.push(lines[i].trim().replace(/^\\d+[.)]\\s+/, ''));
        i += 1;
      }
      blocks.push({ kind: 'ordered', items });
      continue;
    }

    const paragraph: string[] = [line];
    i += 1;
    while (
      i < lines.length &&
      lines[i].trim() &&
      !/^#{1,6}\\s+/.test(lines[i].trim()) &&
      !/^>/.test(lines[i].trim()) &&
      !/^\\d+[.)]\\s+/.test(lines[i].trim()) &&
      !/^[-*]\\s+/.test(lines[i].trim()) &&
      !lines[i].trim().startsWith('|') &&
      !/^---+$/.test(lines[i].trim())
    ) {
      paragraph.push(lines[i].trim());
      i += 1;
    }
    blocks.push({ kind: 'paragraph', text: paragraph.join(' ') });
  }

  return blocks;
}

function getSectionId(text: string, index: number) {
  const match = text.match(/^(\\d+)[.]\\s+/);
  const base = match ? `seccion-${match[1]}` : `seccion-intro-${index}`;
  return base.replace(/[^a-z0-9-]/gi, '-').toLowerCase();
}

function getSectionTone(number: string) {
  const value = Number(number);
  if ([1, 8, 9, 10, 15, 16, 17].includes(value)) return 'gold';
  if ([21, 22, 23, 24, 25, 26].includes(value)) return 'azure';
  if ([4, 29].includes(value)) return 'rose';
  if ([5, 30].includes(value)) return 'amber';
  if ([27, 33, 34, 35].includes(value)) return 'emerald';
  return 'slate';
}

function toneClasses(tone: ReturnType<typeof getSectionTone>) {
  return {
    gold: {
      border: 'border-gold-500/35',
      badge: 'bg-gold-400/10 text-gold-300 border-gold-400/25',
      line: 'bg-gold-400',
    },
    azure: {
      border: 'border-azure-500/35',
      badge: 'bg-azure-400/10 text-azure-300 border-azure-400/25',
      line: 'bg-azure-400',
    },
    rose: {
      border: 'border-rose-500/30',
      badge: 'bg-rose-400/10 text-rose-300 border-rose-400/25',
      line: 'bg-rose-400',
    },
    amber: {
      border: 'border-amber-500/30',
      badge: 'bg-amber-400/10 text-amber-300 border-amber-400/25',
      line: 'bg-amber-400',
    },
    emerald: {
      border: 'border-emerald-500/30',
      badge: 'bg-emerald-400/10 text-emerald-300 border-emerald-400/25',
      line: 'bg-emerald-400',
    },
    slate: {
      border: 'border-ink-600',
      badge: 'bg-ink-700/80 text-ink-300 border-ink-600',
      line: 'bg-ink-400',
    },
  }[tone];
}

function SectionContent({ blocks }: { blocks: RuleBlock[] }) {
  return (
    <div className="space-y-4">
      {blocks.map((block, index) => {
        const key = `block-${index}`;

        if (block.kind === 'paragraph') {
          return (
            <p key={key} className="text-sm sm:text-[15px] leading-7 text-ink-200">
              {inlineMarkdown(block.text)}
            </p>
          );
        }

        if (block.kind === 'quote') {
          return (
            <div key={key} className="rounded-xl border border-gold-500/25 bg-gold-400/5 px-4 py-3.5">
              <div className="flex gap-3">
                <Sparkles size={17} className="mt-0.5 shrink-0 text-gold-400" />
                <p className="text-sm leading-6 text-gold-100/90">{inlineMarkdown(block.text)}</p>
              </div>
            </div>
          );
        }

        if (block.kind === 'unordered' || block.kind === 'ordered') {
          const ListTag = block.kind === 'ordered' ? 'ol' : 'ul';
          return (
            <ListTag
              key={key}
              className={
                block.kind === 'ordered'
                  ? 'list-decimal space-y-2 pl-6 text-sm sm:text-[15px] leading-6 text-ink-200 marker:text-gold-400'
                  : 'list-disc space-y-2 pl-5 text-sm sm:text-[15px] leading-6 text-ink-200 marker:text-ink-500'
              }
            >
              {block.items.map((item, itemIndex) => (
                <li key={`item-${itemIndex}`}>{inlineMarkdown(item)}</li>
              ))}
            </ListTag>
          );
        }

        if (block.kind === 'table') {
          const [header, ...body] = block.rows;
          return (
            <div key={key} className="overflow-x-auto rounded-xl border border-ink-600 bg-ink-950/35">
              <table className="min-w-full border-collapse text-left text-sm">
                <thead className="bg-ink-700/60 text-ink-100">
                  <tr>
                    {header.map((cell, cellIndex) => (
                      <th key={`head-${cellIndex}`} className="border-b border-ink-600 px-3 py-2.5 font-display font-bold">
                        {inlineMarkdown(cell)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {body.map((row, rowIndex) => (
                    <tr key={`row-${rowIndex}`} className="border-b border-ink-700/70 last:border-0">
                      {row.map((cell, cellIndex) => (
                        <td key={`cell-${rowIndex}-${cellIndex}`} className="px-3 py-2.5 text-ink-200">
                          {inlineMarkdown(cell)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        }

        return null;
      })}
    </div>
  );
}

const QUICK_RULES = [
  { icon: Heart, value: '100 LP', label: 'Vida inicial' },
  { icon: Layers3, value: '7 / 9', label: 'Mano inicial / máxima' },
  { icon: Zap, value: '3 cartas', label: 'Máximo por turno' },
  { icon: Target, value: '6 espacios', label: 'Monstruos por jugador' },
  { icon: Swords, value: '1 ataque', label: 'Máximo por Monstruo y turno' },
  { icon: Shield, value: '1 + 1', label: 'Trampa + Mágica por Monstruo' },
] as const;

const NAV_GROUPS = [
  { label: 'Inicio', start: 1, end: 14 },
  { label: 'Turno', start: 15, end: 20 },
  { label: 'Combate', start: 21, end: 28 },
  { label: 'Trampas', start: 29, end: 29 },
  { label: 'Mágicas', start: 30, end: 30 },
  { label: 'Final', start: 31, end: 35 },
] as const;

function scrollToSection(number: number) {
  const element = document.getElementById(`seccion-${number}`);
  element?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

export function RulesScreen({ onBack }: RulesScreenProps) {
  const blocks = useMemo(() => parseRules(rulesText), []);
  const version = useMemo(() => {
    const match = rulesText.match(/\\*\\*Versión:\\*\\*\\s*([^\\n]+)/);
    return match?.[1]?.replace(/[—-].*$/, '').trim() ?? '1.7';
  }, []);

  const sections = useMemo(() => {
    return blocks.reduce<{ section: RuleBlock & { kind: 'heading' }; content: RuleBlock[] }[]>((result, block) => {
      if (block.kind === 'heading' && (block.level === 1 || block.level === 2)) {
        if (block.level === 2 || result.length === 0) {
          result.push({ section: { ...block, kind: 'heading' }, content: [] });
        } else {
          result[0].content.push(block);
        }
        return result;
      }
      if (result.length === 0) {
        result.push({
          section: {
            kind: 'heading',
            level: 1,
            text: 'Reglamento',
            number: '',
          },
          content: [],
        });
      }
      result[result.length - 1].content.push(block);
      return result;
    }, []);
  }, [blocks]);

  return (
    <div className="bg-ink-950 h-[100dvh] min-h-0 text-ink-100 flex flex-col">
      <header className="shrink-0 border-b border-ink-700/80 bg-ink-950/95 backdrop-blur-md">
        <div className="flex items-center gap-3 px-3 sm:px-6 py-3">
          <button
            type="button"
            onClick={onBack}
            className="shrink-0 px-3 py-2 rounded-lg bg-ink-800 border border-ink-600 text-ink-200 font-display font-bold hover:border-gold-400 hover:bg-ink-700 transition-colors flex items-center gap-1.5 btn-press"
          >
            <ArrowLeft size={18} /> <span className="hidden xs:inline">Atrás</span><span className="xs:hidden">Salir</span>
          </button>
          <BookOpen size={22} className="text-gold-400 shrink-0" />
          <div className="min-w-0">
            <h1 className="font-display font-black text-gold-300 text-lg sm:text-xl truncate">Reglas</h1>
            <p className="text-ink-400 text-xs truncate">Reglamento oficial · Versión {version}</p>
          </div>
        </div>
      </header>

      <main className="flex-1 min-h-0 overflow-y-auto overscroll-contain">
        <div className="mx-auto w-full max-w-6xl px-3 sm:px-5 lg:px-8 py-4 sm:py-7">
          <section className="relative overflow-hidden rounded-2xl border border-gold-500/30 bg-[radial-gradient(circle_at_top_right,_rgba(245,158,11,0.16),_transparent_42%),linear-gradient(135deg,_rgba(28,31,48,0.98),_rgba(13,15,28,0.98))] p-5 sm:p-7 shadow-2xl">
            <div className="absolute -right-14 -top-14 h-40 w-40 rounded-full border border-gold-400/10" />
            <div className="absolute -right-6 -top-6 h-24 w-24 rounded-full border border-gold-400/10" />
            <div className="relative">
              <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-gold-400/25 bg-gold-400/10 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.18em] text-gold-300">
                <BookOpen size={13} /> Guía rápida de Bestias de Guerra
              </div>
              <h2 className="max-w-3xl font-display text-2xl sm:text-4xl font-black tracking-tight text-ink-50">
                Aprende a jugar sin perderte entre las reglas
              </h2>
              <p className="mt-3 max-w-3xl text-sm sm:text-[15px] leading-6 text-ink-300">
                La guía mantiene el reglamento oficial como fuente de verdad, pero lo presenta por bloques para que puedas consultar una duda durante la partida en pocos segundos.
              </p>

              <div className="mt-5 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
                {QUICK_RULES.map(({ icon: Icon, value, label }) => (
                  <div key={label} className="rounded-xl border border-ink-600/90 bg-ink-900/60 px-3 py-3">
                    <Icon size={16} className="mb-2 text-gold-400" />
                    <div className="font-display text-sm font-black text-ink-100">{value}</div>
                    <div className="mt-0.5 text-[10px] leading-4 text-ink-400">{label}</div>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <div className="sticky top-0 z-20 -mx-1 mt-3 overflow-x-auto rounded-xl border border-ink-700/80 bg-ink-950/90 p-1.5 backdrop-blur-md">
            <div className="flex min-w-max gap-1">
              {NAV_GROUPS.map((group) => (
                <button
                  key={group.label}
                  type="button"
                  onClick={() => scrollToSection(group.start)}
                  className="rounded-lg px-3 py-2 text-xs font-display font-bold text-ink-300 transition-colors hover:bg-ink-800 hover:text-gold-300"
                >
                  {group.label}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-4 space-y-4">
            {sections.map(({ section, content }, sectionIndex) => {
              const number = section.number;
              const tone = toneClasses(getSectionTone(number));
              const id = number ? `seccion-${number}` : `seccion-intro-${sectionIndex}`;
              const isLargeReference = number === '29' || number === '30';

              return (
                <section id={id} key={id} className="scroll-mt-20">
                  <article className={`overflow-hidden rounded-2xl border ${tone.border} bg-ink-900/75 shadow-xl`}>
                    <div className={`h-1 ${tone.line}`} />
                    <div className="px-4 sm:px-6 pt-4 sm:pt-5">
                      <div className="flex items-start gap-3">
                        {number && (
                          <span className={`inline-flex shrink-0 items-center rounded-lg border px-2.5 py-1 text-[10px] font-display font-black uppercase tracking-wider ${tone.badge}`}>
                            Regla {number}
                          </span>
                        )}
                        <h3 className="min-w-0 font-display text-lg sm:text-xl font-black text-ink-50">
                          {inlineMarkdown(section.text.replace(/^\\d+[.]\\s+/, ''))}
                        </h3>
                      </div>
                    </div>

                    {isLargeReference ? (
                      <details className="group px-4 sm:px-6 pb-5 sm:pb-6 pt-3">
                        <summary className="flex cursor-pointer list-none items-center justify-between rounded-xl border border-ink-700 bg-ink-800/60 px-3.5 py-3 text-xs font-bold text-ink-300 transition-colors hover:border-ink-500 hover:text-gold-300">
                          <span>{number === '29' ? 'Consultar las 12 Trampas' : 'Consultar las 12 Mágicas'}</span>
                          <span className="text-lg leading-none text-gold-400 transition-transform group-open:rotate-45">+</span>
                        </summary>
                        <div className="pt-4">
                          <SectionContent blocks={content} />
                        </div>
                      </details>
                    ) : (
                      <div className="px-4 sm:px-6 pb-5 sm:pb-6 pt-4">
                        <SectionContent blocks={content} />
                      </div>
                    )}
                  </article>
                </section>
              );
            })}
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-azure-500/25 bg-azure-400/5 p-4">
              <div className="flex items-center gap-2 text-azure-300">
                <RotateCcw size={16} />
                <span className="font-display text-xs font-bold uppercase tracking-wide">Turno</span>
              </div>
              <p className="mt-2 text-xs leading-5 text-ink-300">Roba, resuelve los efectos automáticos y utiliza tus acciones legales en el orden que prefieras.</p>
            </div>
            <div className="rounded-xl border border-gold-500/25 bg-gold-400/5 p-4">
              <div className="flex items-center gap-2 text-gold-300">
                <Swords size={16} />
                <span className="font-display text-xs font-bold uppercase tracking-wide">Combate</span>
              </div>
              <p className="mt-2 text-xs leading-5 text-ink-300">ATQ contra ATQ compara fuerza; ATQ contra DEF compara ataque frente a defensa.</p>
            </div>
            <div className="rounded-xl border border-emerald-500/25 bg-emerald-400/5 p-4">
              <div className="flex items-center gap-2 text-emerald-300">
                <Trophy size={16} />
                <span className="font-display text-xs font-bold uppercase tracking-wide">Victoria</span>
              </div>
              <p className="mt-2 text-xs leading-5 text-ink-300">Lleva los LP rivales a 0 o gana por mayor LP si nadie puede realizar una acción legal.</p>
            </div>
          </div>

          <p className="mt-5 text-center text-[11px] leading-5 text-ink-500">
            Reglamento oficial protegido por el proyecto. La presentación visual no modifica las reglas.
          </p>
        </div>
      </main>
    </div>
  );
}
