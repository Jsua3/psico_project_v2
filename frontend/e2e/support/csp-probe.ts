/**
 * Piezas puras de la sonda de CSP (plan 03, S2-3b y S2-4): normalizan y agrupan las violaciones que ve el navegador y
 * las que registra el servidor, y arman el texto con que la sonda falla. Sin Playwright ni disco: las prueba Vitest
 * (`csp-probe.spec.ts`); la parte que habla con el navegador está en `csp-probe-runtime.ts`.
 *
 * Qué se registra de cada violación (y nada más): la directiva efectiva, el recurso bloqueado SIN consulta ni fragmento
 * (esquema, host y ruta; o la palabra clave `inline`/`eval`/`data`/`blob`), la ruta de la página SIN consulta (con los
 * números y los uuid cambiados por `:id`, como en el servidor) y la disposición (`enforce` o `report`). Nunca la muestra
 * del script (`sample`): podría traer texto de la página.
 */

/**
 * Modos de la sonda: la política en vigor, la de reporte de producción, la en vigor como solo reporte (`report-strict`) o esa
 * misma sin `data:` ni `blob:` (`report-tight`: mide cuáles de esos permisos usa la aplicación de verdad).
 */
export type ProbeMode = 'enforce' | 'report' | 'report-strict' | 'report-tight';
export const PROBE_MODES: readonly ProbeMode[] = ['enforce', 'report', 'report-strict', 'report-tight'];

/** Por qué canal se vio una violación. */
export type ViolationSource = 'navegador' | 'consola' | 'servidor';

/** Lo que el navegador entrega en un evento `securitypolicyviolation` (los campos que la sonda lee). */
export interface RawBrowserViolation {
  effectiveDirective?: string;
  violatedDirective?: string;
  blockedURI?: string;
  documentURI?: string;
  sourceFile?: string;
  lineNumber?: number;
  columnNumber?: number;
  disposition?: string;
}

export interface Violation {
  source: ViolationSource;
  directive: string;
  blocked: string;
  page: string;
  disposition: 'enforce' | 'report' | '';
  /** Dónde nació (archivo:línea:columna, sin consulta); solo el navegador lo sabe. */
  at?: string;
}

export interface GroupedViolation {
  directive: string;
  blocked: string;
  page: string;
  disposition: 'enforce' | 'report' | '';
  count: number;
  at: string[];
}

const KEYWORDS = new Set(['inline', 'eval', 'data', 'blob', 'self', 'wasm-eval', 'trusted-types-policy']);
const NUMERIC_SEGMENT = /^[0-9]+$/;
const UUID_SEGMENT = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Quita la consulta y el fragmento de una URL o de una ruta. */
export function stripQuery(value: string): string {
  const cut = value.search(/[?#]/);
  return cut === -1 ? value : value.slice(0, cut);
}

function asUrl(value: string): URL | null {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

/** El recurso bloqueado: palabra clave, o `esquema://host/ruta` SIN consulta ni fragmento. */
export function normalizeBlocked(raw: string | undefined): string {
  const value = (raw ?? '').trim();
  if (value === '') return 'inline';
  if (KEYWORDS.has(value)) return value;
  if (/^data:/i.test(value)) return 'data';
  if (/^blob:/i.test(value)) return 'blob';
  const url = asUrl(value);
  if (!url) return stripQuery(value);
  if (url.protocol === 'http:' || url.protocol === 'https:') return `${url.origin}${url.pathname}`;
  return url.protocol.replace(':', '');
}

/** El origen (`esquema://host`) de un recurso bloqueado, o la palabra clave: lo único que registra el servidor. */
export function blockedOrigin(blocked: string): string {
  const url = asUrl(blocked);
  return url && (url.protocol === 'http:' || url.protocol === 'https:') ? url.origin : blocked;
}

/** La ruta de la página: sin esquema, host, consulta ni fragmento; los números y los uuid cambian por `:id`. */
export function normalizePage(raw: string | undefined): string {
  const value = (raw ?? '').trim();
  if (value === '') return '';
  const url = asUrl(value);
  const path = url ? url.pathname : stripQuery(value);
  return (path || '/')
    .split('/')
    .map(segment => (NUMERIC_SEGMENT.test(segment) || UUID_SEGMENT.test(segment) ? ':id' : segment))
    .join('/');
}

function normalizeDisposition(raw: string | undefined): 'enforce' | 'report' | '' {
  return raw === 'enforce' || raw === 'report' ? raw : '';
}

function normalizeSource(file: string | undefined, line?: number, column?: number): string | undefined {
  const value = (file ?? '').trim();
  if (value === '') return undefined;
  const url = asUrl(value);
  const path = url ? `${url.pathname}` : stripQuery(value);
  return line ? `${path}:${line}:${column ?? 0}` : path;
}

export function fromBrowserEvent(raw: RawBrowserViolation): Violation {
  const directive = (raw.effectiveDirective || raw.violatedDirective || '').split(/\s+/)[0] || 'desconocida';
  return {
    source: 'navegador',
    directive,
    blocked: normalizeBlocked(raw.blockedURI),
    page: normalizePage(raw.documentURI),
    disposition: normalizeDisposition(raw.disposition),
    at: normalizeSource(raw.sourceFile, raw.lineNumber, raw.columnNumber),
  };
}

/** ¿Es un mensaje de consola de una violación de CSP? (Chrome: «Refused to …» o «[Report Only] Refused to …».) */
export function isCspConsoleMessage(text: string): boolean {
  return /Content Security Policy/i.test(text) && /Refused to|violates the following/i.test(text);
}

/**
 * Lo que dice un mensaje de consola de CSP, normalizado: la directiva citada, el recurso (si lo nombra) sin consulta y la
 * disposición. Solo sirve de segundo canal: si el mensaje no se entiende, la directiva queda «desconocida» y el texto va a
 * la lista tal cual (sin consultas).
 */
export function fromConsoleMessage(text: string, pageUrl: string): Violation | null {
  if (!isCspConsoleMessage(text)) return null;
  const directive = /directive:\s*"([a-z-]+)/i.exec(text)?.[1]?.toLowerCase()
    ?? /in the following Content Security Policy directive:\s*"([a-z-]+)/i.exec(text)?.[1]?.toLowerCase()
    ?? 'desconocida';
  const resource = /Refused to (?:load|connect to|frame|create a worker from|apply style from|execute script from|navigate to|send)[^']*'([^']+)'/i.exec(text)?.[1];
  const inline = /Refused to (?:apply inline style|execute inline (?:script|event handler)|apply a stylesheet)/i.test(text);
  const evaluate = /Refused to evaluate a string/i.test(text);
  return {
    source: 'consola',
    directive,
    blocked: evaluate ? 'eval' : inline ? 'inline' : resource ? normalizeBlocked(resource) : 'desconocido',
    page: normalizePage(pageUrl),
    disposition: /^\[Report Only\]/i.test(text.trim()) ? 'report' : 'enforce',
  };
}

/** Una línea del registro del servidor (JSON) → su violación, si es `csp_violation` (solo lo que el servidor guarda). */
export function fromServerLine(line: string): Violation | null {
  const trimmed = line.trim();
  if (!trimmed.startsWith('{')) return null;
  let record: Record<string, unknown>;
  try {
    record = JSON.parse(trimmed) as Record<string, unknown>;
  } catch {
    return null;
  }
  if (record['event'] !== 'csp_violation') return null;
  const text = (key: string): string => (typeof record[key] === 'string' ? (record[key] as string) : '');
  return {
    source: 'servidor',
    directive: text('directive') || 'desconocida',
    blocked: text('blocked') || 'desconocido',
    page: text('document_path'),
    disposition: normalizeDisposition(text('disposition')),
  };
}

/** Todas las violaciones que un tramo del registro del servidor (varias líneas JSON) contiene. */
export function parseServerLog(text: string): Violation[] {
  return text.split(/\r?\n/).map(fromServerLine).filter((item): item is Violation => item !== null);
}

/** Agrupa las repetidas (misma directiva, recurso, página y disposición) y cuenta cuántas veces salió cada una. */
export function groupViolations(violations: readonly Violation[]): GroupedViolation[] {
  const groups = new Map<string, GroupedViolation>();
  for (const item of violations) {
    const key = [item.directive, item.blocked, item.page, item.disposition].join('\u0000');
    const group = groups.get(key) ?? {
      directive: item.directive, blocked: item.blocked, page: item.page, disposition: item.disposition, count: 0, at: [],
    };
    group.count += 1;
    if (item.at && !group.at.includes(item.at) && group.at.length < 3) group.at.push(item.at);
    groups.set(key, group);
  }
  return [...groups.values()].sort((a, b) => a.directive.localeCompare(b.directive) || a.blocked.localeCompare(b.blocked) || a.page.localeCompare(b.page));
}

/**
 * ¿La violación es de EJECUCIÓN de código? Una directiva de scripts (`script-src`, `-elem`, `-attr`) o un `eval`.
 * Es lo que un texto de caso con `<script>` provocaría si algo lo ejecutara.
 */
export function isExecutionViolation(item: { directive: string; blocked: string }): boolean {
  return item.directive.startsWith('script-src') || item.blocked === 'eval';
}

export function formatGroup(item: GroupedViolation): string {
  const mode = item.disposition === 'report' ? ' [solo reporte]' : '';
  const where = item.at.length ? `  en ${item.at.join(', ')}` : '';
  return `${item.directive.padEnd(16)} ${item.blocked.padEnd(44)} ${item.page || '(sin ruta)'}  ×${item.count}${mode}${where}`;
}

/** El texto con que una pantalla o un flujo falla: la lista de violaciones, una por línea. */
export function formatViolationReport(flow: string, mode: ProbeMode, groups: readonly GroupedViolation[], extra: readonly string[] = []): string {
  const total = groups.reduce((sum, item) => sum + item.count, 0);
  const lines = groups.map(item => `  · ${formatGroup(item)}`);
  return [
    `CSP · «${flow}» (modo ${mode}): ${groups.length} violación(es) distinta(s), ${total} en total.`,
    '  directiva        recurso bloqueado (sin consulta)             página',
    ...lines,
    ...extra.map(line => `  ${line}`),
  ].join('\n');
}

/** Una línea de `findings.jsonl` (la lee el orquestador para resumir y para comprobar los controles negativos). */
export interface Finding {
  flow: string;
  kind: 'violation' | 'canary-executed' | 'canary-not-reported' | 'no-policy' | 'wrong-policy' | 'nonce-mismatch';
  directive?: string;
  blocked?: string;
  page?: string;
  disposition?: string;
  count?: number;
  detail?: string;
}

export function findingFromGroup(flow: string, group: GroupedViolation): Finding {
  return {
    flow, kind: 'violation', directive: group.directive, blocked: group.blocked, page: group.page,
    disposition: group.disposition, count: group.count,
  };
}

/** El nonce de un valor de `Content-Security-Policy` para una directiva, o `null` si no lo lleva. */
export function nonceOfDirective(policy: string, directive: string): string | null {
  for (const chunk of policy.split(';')) {
    const parts = chunk.trim().split(/\s+/);
    if (parts[0] !== directive) continue;
    const token = parts.find(part => /^'nonce-[^']+'$/.test(part));
    return token ? token.slice("'nonce-".length, -1) : null;
  }
  return null;
}

/** Las fuentes de una directiva de una política (sin su nombre), o `null` si la política no la declara. */
export function directiveSources(policy: string, directive: string): string[] | null {
  for (const chunk of policy.split(';')) {
    const parts = chunk.trim().split(/\s+/);
    if (parts[0] === directive) return parts.slice(1);
  }
  return null;
}
