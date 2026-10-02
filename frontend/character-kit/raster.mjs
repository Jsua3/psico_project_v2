/**
 * Utilidades para AUTORAR datos de píxel con geometría (formas grandes del
 * retrato). Producen grillas de texto: el generador solo consume grillas.
 */

/** Grilla de texto w×h: `fn(x, y)` devuelve un carácter ('.' = vacío). */
export function gridFrom(width, height, fn) {
  const rows = [];
  for (let y = 0; y < height; y++) {
    let row = '';
    for (let x = 0; x < width; x++) row += fn(x, y) ?? '.';
    rows.push(row);
  }
  return rows.join('\n');
}

/** Superpone celdas sueltas ([x, y, ch]) sobre una grilla de texto. */
export function stamp(grid, cells) {
  const rows = grid.split('\n').map(r => [...r]);
  for (const [x, y, ch] of cells) {
    if (rows[y] && x >= 0 && x < rows[y].length) rows[y][x] = ch;
  }
  return rows.map(r => r.join('')).join('\n');
}

/** Línea de píxeles (Bresenham) entre dos puntos, como celdas [x, y]. */
export function line(x0, y0, x1, y1) {
  const cells = [];
  let dx = Math.abs(x1 - x0);
  let dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  for (;;) {
    cells.push([x0, y0]);
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x0 += sx; }
    if (e2 <= dx) { err += dx; y0 += sy; }
  }
  return cells;
}

/** Polilínea: une varios puntos con `line`. */
export function polyline(points) {
  const cells = [];
  for (let i = 0; i < points.length - 1; i++) {
    const seg = line(...points[i], ...points[i + 1]);
    cells.push(...(i === 0 ? seg : seg.slice(1)));
  }
  return cells;
}
