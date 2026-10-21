import {
  blockedOrigin,
  directiveSources,
  formatViolationReport,
  fromBrowserEvent,
  fromConsoleMessage,
  fromServerLine,
  groupViolations,
  isCspConsoleMessage,
  isExecutionViolation,
  nonceOfDirective,
  normalizeBlocked,
  normalizePage,
  parseServerLog,
  stripQuery,
} from './csp-probe';
import type { Violation } from './csp-probe';

// Piezas puras de la sonda de CSP (plan 03, S2-3b/S2-4). Lo que la sonda dice de una violación no debe llevar nunca la
// consulta de una URL (puede traer tokens o identificadores): se comprueba aquí con varias formas.

describe('stripQuery y normalizeBlocked', () => {
  it('quita la consulta y el fragmento', () => {
    expect(stripQuery('/a/b?x=1#f')).toBe('/a/b');
    expect(stripQuery('/a/b#f')).toBe('/a/b');
    expect(stripQuery('/a/b')).toBe('/a/b');
  });

  it('deja las palabras clave y reduce data: y blob: a su esquema', () => {
    expect(normalizeBlocked('inline')).toBe('inline');
    expect(normalizeBlocked('eval')).toBe('eval');
    expect(normalizeBlocked('data:image/png;base64,AAAA')).toBe('data');
    expect(normalizeBlocked('blob:http://127.0.0.1:8193/5f3c-uuid')).toBe('blob');
    expect(normalizeBlocked('')).toBe('inline');
    expect(normalizeBlocked(undefined)).toBe('inline');
  });

  it('de una URL deja esquema, host y ruta, sin consulta ni fragmento', () => {
    expect(normalizeBlocked('https://cdn.example.org/lib/x.js?token=secreto#parte')).toBe('https://cdn.example.org/lib/x.js');
    expect(normalizeBlocked('http://127.0.0.1:8193/assets/a.png?v=2')).toBe('http://127.0.0.1:8193/assets/a.png');
    expect(normalizeBlocked('chrome-extension://abc/x.js')).toBe('chrome-extension');
  });

  it('control negativo: ninguna forma deja pasar una consulta', () => {
    for (const raw of ['https://x.org/a?k=v', 'http://localhost:1/a?k=v#f', '/ruta?k=v', 'https://x.org/a#t?k=v']) {
      expect(normalizeBlocked(raw)).not.toMatch(/[?#]/);
      expect(normalizePage(raw)).not.toMatch(/[?#]/);
    }
  });

  it('blockedOrigin deja el origen (lo único que guarda el servidor) o la palabra clave', () => {
    expect(blockedOrigin('https://cdn.example.org/lib/x.js')).toBe('https://cdn.example.org');
    expect(blockedOrigin('inline')).toBe('inline');
  });
});

describe('normalizePage', () => {
  it('queda la ruta, sin consulta, y los números y uuid cambian por :id', () => {
    expect(normalizePage('http://127.0.0.1:8193/portal/casos/45/editor?tab=mundo')).toBe('/portal/casos/:id/editor');
    expect(normalizePage('http://x/portal/reportes/estudiante/7?grupo=3')).toBe('/portal/reportes/estudiante/:id');
    expect(normalizePage('http://x/a/123e4567-e89b-12d3-a456-426614174000/b')).toBe('/a/:id/b');
    expect(normalizePage('http://x')).toBe('/');
    expect(normalizePage('')).toBe('');
    expect(normalizePage('/portal/jugar?x=1')).toBe('/portal/jugar');
  });
});

describe('fromBrowserEvent', () => {
  it('toma la directiva efectiva y normaliza recurso, página y origen', () => {
    const item = fromBrowserEvent({
      effectiveDirective: 'img-src', violatedDirective: 'img-src', blockedURI: 'https://x.org/p.png?s=1',
      documentURI: 'http://127.0.0.1:8193/portal/jugar?caso=4', sourceFile: 'http://127.0.0.1:8193/chunk-AB12.js?v=3',
      lineNumber: 12, columnNumber: 34, disposition: 'enforce',
    });

    expect(item).toEqual({
      source: 'navegador', directive: 'img-src', blocked: 'https://x.org/p.png', page: '/portal/jugar',
      disposition: 'enforce', at: '/chunk-AB12.js:12:34',
    });
  });

  it('sin directiva efectiva usa la violada (solo su nombre) y sin nada, «desconocida»', () => {
    expect(fromBrowserEvent({ violatedDirective: "style-src-elem 'self'" }).directive).toBe('style-src-elem');
    expect(fromBrowserEvent({}).directive).toBe('desconocida');
    expect(fromBrowserEvent({ disposition: 'otra' }).disposition).toBe('');
  });
});

describe('mensajes de consola de Chrome', () => {
  const imagen = 'Refused to load the image \'https://cdn.example.org/x.png?sig=abc\' because it violates the following Content Security Policy directive: "img-src \'self\' data: blob:".';
  const estilo = '[Report Only] Refused to apply inline style because it violates the following Content Security Policy directive: "style-src \'self\' \'nonce-xyz\'". Either the \'unsafe-inline\' keyword, a hash, or a nonce is required.';

  it('reconoce los mensajes de CSP y descarta el resto', () => {
    expect(isCspConsoleMessage(imagen)).toBe(true);
    expect(isCspConsoleMessage(estilo)).toBe(true);
    expect(isCspConsoleMessage('Failed to load resource: net::ERR_FAILED')).toBe(false);
    expect(fromConsoleMessage('algo cualquiera', 'http://x/')).toBeNull();
  });

  it('saca la directiva, el recurso sin consulta y la disposición', () => {
    expect(fromConsoleMessage(imagen, 'http://127.0.0.1:8193/portal/jugar?x=1')).toEqual({
      source: 'consola', directive: 'img-src', blocked: 'https://cdn.example.org/x.png', page: '/portal/jugar', disposition: 'enforce',
    });
    expect(fromConsoleMessage(estilo, 'http://127.0.0.1:8193/login')).toEqual({
      source: 'consola', directive: 'style-src', blocked: 'inline', page: '/login', disposition: 'report',
    });
  });

  it('entiende scripts en línea, manejadores, eval, conexiones y fuentes', () => {
    const casos: Array<[string, string, string]> = [
      ['Refused to execute inline script because it violates the following Content Security Policy directive: "script-src \'self\'".', 'script-src', 'inline'],
      ['Refused to execute inline event handler because it violates the following Content Security Policy directive: "script-src-attr \'none\'".', 'script-src-attr', 'inline'],
      ['Refused to evaluate a string as JavaScript because \'unsafe-eval\' is not an allowed source of script in the following Content Security Policy directive: "script-src \'self\'".', 'script-src', 'eval'],
      ['Refused to connect to \'https://api.example.org/v1?k=1\' because it violates the following Content Security Policy directive: "connect-src \'self\'".', 'connect-src', 'https://api.example.org/v1'],
      ['Refused to load the font \'https://fonts.example.org/f.woff2\' because it violates the following Content Security Policy directive: "font-src \'self\'".', 'font-src', 'https://fonts.example.org/f.woff2'],
      ['Refused to load media from \'https://m.example.org/a.mp3\' because it violates the following Content Security Policy directive: "media-src \'self\'".', 'media-src', 'https://m.example.org/a.mp3'],
    ];
    for (const [text, directive, blocked] of casos) {
      const item = fromConsoleMessage(text, 'http://x/y');
      expect(item?.directive, text).toBe(directive);
      expect(item?.blocked, text).toBe(blocked);
    }
  });
});

describe('registro del servidor', () => {
  const linea = (campos: Record<string, unknown>) => JSON.stringify({ ts: '2026-10-18T00:00:00Z', level: 'INFO', logger: 'siep.security', ...campos });

  it('lee las líneas csp_violation y se salta el resto', () => {
    const texto = [
      linea({ event: 'csp_violation', directive: 'style-src-elem', blocked: 'inline', document_path: '/portal/jugar', disposition: 'enforce' }),
      linea({ event: 'rate_limited' }),
      '{esto no es json',
      'una línea de texto',
      linea({ event: 'csp_violation', directive: 'img-src', blocked: 'https://x.org', document_path: '/login', disposition: 'report' }),
    ].join('\n');

    expect(parseServerLog(texto)).toEqual([
      { source: 'servidor', directive: 'style-src-elem', blocked: 'inline', page: '/portal/jugar', disposition: 'enforce' },
      { source: 'servidor', directive: 'img-src', blocked: 'https://x.org', page: '/login', disposition: 'report' },
    ]);
    expect(fromServerLine('')).toBeNull();
  });
});

describe('agrupar y mostrar', () => {
  const una = (cambios: Partial<Violation> = {}): Violation => ({
    source: 'navegador', directive: 'img-src', blocked: 'https://x.org/a.png', page: '/portal/jugar', disposition: 'enforce', ...cambios,
  });

  it('junta las repetidas, cuenta y ordena por directiva, recurso y página', () => {
    const grupos = groupViolations([
      una(), una({ at: '/a.js:1:1' }), una({ at: '/b.js:2:2' }), una({ directive: 'font-src', blocked: 'https://y.org/f.woff2' }),
      una({ page: '/login' }),
    ]);

    expect(grupos.map(item => [item.directive, item.page, item.count])).toEqual([
      ['font-src', '/portal/jugar', 1], ['img-src', '/login', 1], ['img-src', '/portal/jugar', 3],
    ]);
    expect(grupos[2].at).toEqual(['/a.js:1:1', '/b.js:2:2']);
  });

  it('distingue la misma violación en modo reporte y en vigor', () => {
    expect(groupViolations([una(), una({ disposition: 'report' })])).toHaveLength(2);
  });

  it('el texto del fallo lleva directiva, recurso y página, y nunca una consulta', () => {
    const texto = formatViolationReport('portal del estudiante', 'enforce', groupViolations([una({ at: '/c.js:3:4' })]), ['servidor: 1 línea csp_violation']);

    expect(texto).toContain('«portal del estudiante» (modo enforce): 1 violación(es) distinta(s), 1 en total.');
    expect(texto).toContain('img-src');
    expect(texto).toContain('https://x.org/a.png');
    expect(texto).toContain('/portal/jugar');
    expect(texto).toContain('en /c.js:3:4');
    expect(texto).toContain('servidor: 1 línea csp_violation');
    expect(texto).not.toMatch(/\?/);
  });

  it('una violación de scripts o un eval es de ejecución; una de imágenes o fuentes, no', () => {
    expect(isExecutionViolation({ directive: 'script-src-elem', blocked: 'inline' })).toBe(true);
    expect(isExecutionViolation({ directive: 'script-src-attr', blocked: 'inline' })).toBe(true);
    expect(isExecutionViolation({ directive: 'style-src', blocked: 'eval' })).toBe(true);
    expect(isExecutionViolation({ directive: 'style-src-elem', blocked: 'inline' })).toBe(false);
    expect(isExecutionViolation({ directive: 'img-src', blocked: 'https://x.org/a.png' })).toBe(false);
  });
});

describe('leer una política', () => {
  const politica = "default-src 'self'; script-src 'self' 'nonce-AbC_-123' https://accounts.google.com/gsi/client; style-src 'self'; report-uri /api/security/csp-report";

  it('saca el nonce de una directiva, o null si no lo lleva', () => {
    expect(nonceOfDirective(politica, 'script-src')).toBe('AbC_-123');
    expect(nonceOfDirective(politica, 'style-src')).toBeNull();
    expect(nonceOfDirective(politica, 'img-src')).toBeNull();
  });

  it('saca las fuentes de una directiva, o null si no existe', () => {
    expect(directiveSources(politica, 'style-src')).toEqual(["'self'"]);
    expect(directiveSources(politica, 'script-src')).toContain('https://accounts.google.com/gsi/client');
    expect(directiveSources(politica, 'img-src')).toBeNull();
  });
});
