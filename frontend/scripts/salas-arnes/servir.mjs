// Sirve el arnés de las salas por piezas: `node scripts/salas-arnes/servir.mjs [puerto]` (por omisión 4381).
// Empaqueta `arnes.ts` con esbuild en memoria en cada pedido (los cambios se ven al recargar) y sirve:
//   /                              → index.html
//   /arnes.js                      → el arnés empaquetado
//   /assets/biblioteca/piezas/...  → biblioteca/piezas/... (el catálogo de P1, sin copiarlo)
//   /assets/...                    → frontend/src/assets/... (kit de personajes, fuentes)
import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { build } from 'esbuild';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const FRONTEND = path.resolve(AQUI, '..', '..');
const PIEZAS = path.resolve(FRONTEND, '..', 'biblioteca', 'piezas');
const ASSETS = path.join(FRONTEND, 'src', 'assets');
const TIPOS = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json',
  '.png': 'image/png', '.woff2': 'font/woff2' };

async function empaquetar() {
  const salida = await build({
    entryPoints: [path.join(AQUI, 'arnes.ts')], bundle: true, write: false, format: 'iife', target: 'es2022',
    sourcemap: 'inline', logLevel: 'silent', tsconfig: path.join(FRONTEND, 'tsconfig.json'),
  });
  return salida.outputFiles[0].contents;
}

/** Un archivo dentro de `raiz`, o null si la ruta se sale de ella o no existe. */
function dentro(raiz, relativa) {
  const destino = path.resolve(raiz, '.' + path.posix.normalize('/' + decodeURIComponent(relativa)));
  if (destino !== raiz && !destino.startsWith(raiz + path.sep)) return null;
  return existsSync(destino) && statSync(destino).isFile() ? destino : null;
}

export function servir(puerto = 4381) {
  const servidor = createServer(async (pedido, respuesta) => {
    const ruta = new URL(pedido.url ?? '/', 'http://localhost').pathname;
    try {
      if (ruta === '/arnes.js') {
        respuesta.writeHead(200, { 'content-type': TIPOS['.js'], 'cache-control': 'no-store' });
        respuesta.end(await empaquetar());
        return;
      }
      const archivo = ruta === '/' ? path.join(AQUI, 'index.html')
        : ruta.startsWith('/assets/biblioteca/piezas/') ? dentro(PIEZAS, ruta.slice('/assets/biblioteca/piezas/'.length))
          : ruta.startsWith('/assets/') ? dentro(ASSETS, ruta.slice('/assets/'.length)) : null;
      if (!archivo) {
        respuesta.writeHead(404).end();
        return;
      }
      respuesta.writeHead(200, { 'content-type': TIPOS[path.extname(archivo)] ?? 'application/octet-stream', 'cache-control': 'no-store' });
      createReadStream(archivo).pipe(respuesta);
    } catch (error) {
      respuesta.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' }).end(String(error));
    }
  });
  return new Promise(listo => servidor.listen(puerto, '127.0.0.1', () => listo(servidor)));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const puerto = Number(process.argv[2]) || 4381;
  await servir(puerto);
  console.log(`arnés de salas en http://127.0.0.1:${puerto}/?sala=pasillo&momento=noche`);
}
