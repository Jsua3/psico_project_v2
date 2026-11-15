/**
 * Arnés de las salas por piezas: monta en Phaser 4, fuera de la escena del juego, una sala de la biblioteca con los módulos
 * reales de `src/app/features/simulator/sala/` (composición, luz con sombras, puertas) y una persona que camina.
 * Sirve para mirar y capturar el resultado mientras la escena del juego no está libre; el enganche en el juego usa el mismo
 * `EscenaDeSala`.
 *
 * Parámetros: ?lugar=hospital&sala=pasillo&momento=noche&x=800&y=400&puerta=a-escucha&bloqueadas=a-escucha&reducido=1&z=2
 * Teclas: flechas o WASD para caminar, E para cruzar, N para alternar día y noche.
 */
import Phaser from 'phaser';

import { DEPTH, actorDepth } from '../../src/app/features/simulator/depth-sort.util';
import { MANIFIESTO_DE_PIEZAS_URL, esManifiestoDePiezas, urlDePieza } from '../../src/app/features/simulator/sala/catalogo';
import type { ManifiestoDePiezas, SalaPorPiezas } from '../../src/app/features/simulator/sala/catalogo';
import { EscenaDeSala, PROFUNDIDAD } from '../../src/app/features/simulator/sala/escena-de-sala';
import type { Momento } from '../../src/app/features/simulator/sala/geometria';
import { cuerpo } from '../../src/app/features/simulator/sala/luz';
import type { Cuerpo } from '../../src/app/features/simulator/sala/luz';
import { avanzarCruce, cruceEnCurso, iniciarCruce, opacidadDeCruce, posicionAlCruzar } from '../../src/app/features/simulator/sala/puerta';
import type { Cruce } from '../../src/app/features/simulator/sala/puerta';

interface SalaDeLugar extends SalaPorPiezas {
  id: string;
  nombre: string;
  entrada?: [number, number] | { x: number; y: number };
  muebles?: { ref: string; x: number; y: number; espejo?: boolean }[];
  personajes?: { ref: string; x: number; y: number; mirando?: string }[];
}

/**
 * Configuración que puede dejar la página antes de cargar el arnés: el contenedor del juego y, para una página que no tiene
 * servidor (la vista previa publicada), los recursos incrustados (URL → `data:` de cada imagen, o el JSON como texto).
 */
const CONFIG = ((window as unknown as Record<string, unknown>)['__ARNES'] ?? {}) as { contenedor?: string; recursos?: Record<string, string>; momento?: Momento };
const RECURSOS = CONFIG.recursos;
const recurso = (url: string) => RECURSOS?.[url] ?? url;
async function traerJson(url: string): Promise<unknown> {
  if (RECURSOS?.[url] !== undefined) return JSON.parse(RECURSOS[url]);
  return fetch(url).then(r => r.json());
}

const params = new URLSearchParams(location.search);
const FILA: Record<string, number> = { abajo: 0, izquierda: 1, derecha: 2, arriba: 3, down: 0, left: 1, right: 2, up: 3 };
const VELOCIDAD = 110;
const KIT = '/assets/characters/kit';
const $ = (id: string) => document.getElementById(id)!;

/** Sombra de contacto: elipse del tono oscuro de la sala, con el borde tramado (nada de difuminado). */
function texturaDeSombra(escena: Phaser.Scene, rx: number, ry: number): string {
  const nombre = `arnes:sombra-${rx}-${ry}`;
  if (escena.textures.exists(nombre)) return nombre;
  const w = rx * 2 + 1, h = ry * 2 + 1;
  const lienzo = escena.textures.createCanvas(nombre, w, h)!;
  const ctx = lienzo.getContext();
  const datos = ctx.createImageData(w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx = (x - rx) / (rx + 0.5), dy = (y - ry) / (ry + 0.5), d = dx * dx + dy * dy;
      const dentro = d <= 0.55 || (d <= 1 && (x + y) % 2 === 0);
      if (dentro) datos.data.set([8, 6, 18, 92], (y * w + x) * 4);
    }
  }
  ctx.putImageData(datos, 0, 0);
  lienzo.refresh();
  return nombre;
}

type Plan = NonNullable<ReturnType<typeof EscenaDeSala.planear>>;

class ArnesDeSala extends Phaser.Scene {
  private sala: EscenaDeSala | null = null;
  private salaDatos: SalaDeLugar | null = null;
  private momento: Momento = (params.get('momento') as Momento) || CONFIG.momento || 'dia';
  private readonly reducido = params.get('reducido') === '1';
  private readonly bloqueadas = new Set((params.get('bloqueadas') ?? '').split(',').filter(Boolean));
  private readonly zoomPedido = Number(params.get('z')) || 0;
  private extras: Phaser.GameObjects.GameObject[] = [];
  private animados: { objeto: Phaser.GameObjects.Sprite; cuadros: number; fps: number; fila: number }[] = [];
  private choques: Cuerpo[] = [];
  private jugador!: Phaser.GameObjects.Sprite;
  private sombraJugador!: Phaser.GameObjects.Image;
  private pos = { x: 480, y: 400 };
  private vista = 0;
  private anda = false;
  private tiempo = 0;
  private teclas!: Record<string, Phaser.Input.Keyboard.Key>;
  private velo!: Phaser.GameObjects.Rectangle;
  private cruce: Cruce | null = null;
  private cruzando: { hacia: string; par?: string; umbral: [number, number]; ancla: [number, number]; lista: boolean } | null = null;
  private cargando = false;
  private listo = false;
  private meta: { x: number; y: number } | null = null;

  constructor(private readonly manifiesto: ManifiestoDePiezas, private readonly salas: SalaDeLugar[]) {
    super('arnes');
  }

  init(): void {
    if (!RECURSOS) return;
    // Sin servidor: cada URL que pide la escena (también las que pide `EscenaDeSala`) se cambia por su recurso incrustado.
    const cargador = this.load as unknown as Record<string, (clave: string, url: string, ...resto: unknown[]) => unknown>;
    for (const metodo of ['image', 'spritesheet']) {
      const original = cargador[metodo].bind(this.load);
      cargador[metodo] = (clave, url, ...resto) => original(clave, recurso(url), ...resto);
    }
  }

  preload(): void {
    this.load.spritesheet('kit:valentina:idle', `${KIT}/valentina/idle.png`, { frameWidth: 48, frameHeight: 72 });
    this.load.spritesheet('kit:valentina:walk', `${KIT}/valentina/walk.png`, { frameWidth: 48, frameHeight: 72 });
  }

  create(): void {
    this.cameras.main.setBackgroundColor('#0b0a12');
    this.teclas = this.input.keyboard!.addKeys('W,A,S,D,UP,DOWN,LEFT,RIGHT,E,N') as Record<string, Phaser.Input.Keyboard.Key>;
    this.input.keyboard!.on('keydown-E', () => this.intentarCruzar());
    this.input.keyboard!.on('keydown-N', () => this.ir(this.salaDatos!.id, this.momento === 'dia' ? 'noche' : 'dia', this.pos.x, this.pos.y));
    $('aviso').addEventListener('click', () => this.intentarCruzar());
    // Con el ratón o el dedo: tocar el piso lleva hasta ahí (en línea recta, hasta donde no choque).
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => { this.meta = { x: p.worldX, y: p.worldY }; });
    this.jugador = this.add.sprite(0, 0, 'kit:valentina:idle', 0).setOrigin(24 / 48, 68 / 72);
    this.sombraJugador = this.add.image(0, 0, texturaDeSombra(this, 11, 4)).setDepth(PROFUNDIDAD.sombras);
    this.velo = this.add.rectangle(0, 0, 4000, 4000, 0x0b0a12, 1).setOrigin(0, 0).setScrollFactor(0).setDepth(DEPTH.UI - 1).setAlpha(0);
    this.scale.on('resize', () => this.encuadrar());
    const x = Number(params.get('x')), y = Number(params.get('y'));
    this.ir(params.get('sala') ?? this.salas[0].id, this.momento, x || undefined, y || undefined, params.get('puerta') ?? undefined);
  }

  /** Entra en una sala: por una puerta (aparece en su umbral, con la puerta abierta detrás) o en un punto. */
  ir(id: string, momento: Momento, x?: number, y?: number, puerta?: string, alListo?: () => void): void {
    const datos = this.salas.find(s => s.id === id);
    if (!datos) throw new Error(`no hay sala ${id}`);
    this.momento = momento;
    const plan = EscenaDeSala.planear(datos, this.manifiesto, momento);
    if (!plan) throw new Error(`la sala ${id} no se puede armar`);
    this.listo = false;
    this.cargando = true;
    let pidio = EscenaDeSala.pedirTexturas(this, plan);
    for (const m of datos.muebles ?? []) {
      const ficha = this.manifiesto.muebles[`hospital/${m.ref}`];
      if (ficha && !this.textures.exists(`mueble:${m.ref}`)) {
        this.load.spritesheet(`mueble:${m.ref}`, urlDePieza(ficha.ruta), { frameWidth: ficha.ancho, frameHeight: ficha.alto });
        pidio = true;
      }
    }
    for (const p of datos.personajes ?? []) {
      if (!this.textures.exists(`kit:${p.ref}:idle`)) {
        this.load.spritesheet(`kit:${p.ref}:idle`, `${KIT}/${p.ref}/idle.png`, { frameWidth: 48, frameHeight: 72 });
        pidio = true;
      }
    }
    const armar = () => {
      this.armar(datos, plan, x, y, puerta);
      this.cargando = false;
      this.listo = true;
      alListo?.();
    };
    if (pidio) {
      this.load.once(Phaser.Loader.Events.COMPLETE, armar);
      this.load.start();
    } else {
      armar();
    }
  }

  private armar(datos: SalaDeLugar, plan: Plan, x?: number, y?: number, puerta?: string): void {
    this.sala?.destruir();
    for (const objeto of this.extras) objeto.destroy();
    this.extras = [];
    this.animados = [];
    this.choques = [];
    this.salaDatos = datos;

    const cuerpos: Cuerpo[] = [];
    for (const m of datos.muebles ?? []) {
      const ficha = this.manifiesto.muebles[`hospital/${m.ref}`];
      if (!ficha || !this.textures.exists(`mueble:${m.ref}`)) continue;
      const objeto = this.add.sprite(m.x - Math.floor(ficha.ancho / 2), m.y - ficha.alto, `mueble:${m.ref}`, 0)
        .setOrigin(0, 0).setFlipX(m.espejo === true).setDepth(actorDepth(m.y));
      const rx = Math.floor(ficha.ancho / 2) + 3, ry = Math.min(9, Math.max(3, Math.floor(ficha.ancho / 7)));
      const sombra = this.add.image(m.x + 1, m.y - 3, texturaDeSombra(this, rx, ry)).setDepth(PROFUNDIDAD.sombras);
      this.extras.push(objeto, sombra);
      if (ficha.cuadros > 1 && ficha.fps) this.animados.push({ objeto, cuadros: ficha.cuadros, fps: ficha.fps, fila: 0 });
      const c = cuerpo(m.x, m.y, ficha.ancho, ficha.alto);
      cuerpos.push(c);
      this.choques.push(c);
    }
    for (const p of datos.personajes ?? []) {
      if (!this.textures.exists(`kit:${p.ref}:idle`)) continue;
      const fila = FILA[p.mirando ?? 'abajo'] ?? 0;
      const objeto = this.add.sprite(p.x, p.y + 4, `kit:${p.ref}:idle`, fila * 4).setOrigin(24 / 48, 68 / 72).setDepth(actorDepth(p.y + 4));
      const sombra = this.add.image(p.x, p.y, texturaDeSombra(this, 11, 4)).setDepth(PROFUNDIDAD.sombras);
      this.extras.push(objeto, sombra);
      this.animados.push({ objeto, cuadros: 4, fps: 4, fila });
      const c = cuerpo(p.x, p.y + 4, 48, 72, true);
      cuerpos.push(c);
      this.choques.push(c);
    }

    this.sala = new EscenaDeSala(this, datos, plan, this.manifiesto, { momento: this.momento, reducido: this.reducido, cuerpos });
    const llegada = puerta ? this.sala.puertas().find(p => p.id === puerta) : undefined;
    if (llegada) {
      this.pos = { x: llegada.umbral[0], y: llegada.umbral[1] };
      this.sala.abrirYa(llegada.id);
      this.vista = { fondo: 0, camara: 3, izquierda: 2, derecha: 1 }[llegada.muro];
    } else {
      const entrada = Array.isArray(datos.entrada) ? { x: datos.entrada[0], y: datos.entrada[1] } : datos.entrada;
      this.pos = { x: x ?? entrada?.x ?? plan.ancho / 2, y: y ?? entrada?.y ?? 400 };
    }
    $('rotulo').textContent = `${datos.nombre} · ${plan.ancho} px · ${this.momento === 'dia' ? 'día' : 'noche'}`;
    this.encuadrar();
    this.pintarJugador();
  }

  private encuadrar(): void {
    if (!this.sala) return;
    const cam = this.cameras.main;
    const k = this.zoomPedido || Math.max(1, Math.floor(Math.min(cam.width / 960, cam.height / 528)));
    cam.setZoom(k);
    cam.removeBounds();
    this.seguir();
  }

  /**
   * Sigue a quien juega sin salirse de la sala; si la vista es más grande que la sala en un eje, la centra en ese eje.
   * (La cámara del juego es del bloque M1: esto es solo para mirar.)
   */
  private seguir(): void {
    if (!this.sala) return;
    const cam = this.cameras.main;
    const vw = cam.width / cam.zoom, vh = cam.height / cam.zoom;
    const eje = (centro: number, vista: number, largo: number) =>
      vista >= largo ? (largo - vista) / 2 : Math.min(Math.max(centro - vista / 2, 0), largo - vista);
    const x = eje(this.pos.x, vw, this.sala.plan.ancho), y = eje(this.pos.y - 34, vh, this.sala.plan.alto);
    cam.setScroll(Math.round(x + vw / 2 - cam.width / 2), Math.round(y + vh / 2 - cam.height / 2));
  }

  private libre(x: number, y: number): boolean {
    if (!this.sala) return false;
    const [zx, zy, zw, zh] = this.sala.plan.zona;
    if (x < zx + 8 || x > zx + zw - 8 || y < zy + 8 || y > zy + zh) return false;
    return !this.choques.some(c => x > c.x0 - 9 && x < c.x1 + 9 && y > c.y0 - 2 && y < c.y1 + 8);
  }

  private intentarCruzar(): void {
    if (!this.sala || this.cruce || this.cargando) return;
    const id = this.sala.puertaActiva();
    const puerta = id ? this.sala.puertas().find(p => p.id === id) : undefined;
    if (!puerta) return;
    if (this.bloqueadas.has(puerta.id)) {
      this.sala.sacudir(puerta.id);
      $('vivo').textContent = `${puerta.etiqueta}: antes de pasar, habla con la enfermera de turno.`;
      return;
    }
    if (!puerta.hacia || !this.salas.some(s => s.id === puerta.hacia)) return;
    this.cruce = iniciarCruce(this.reducido);
    this.cruzando = { hacia: puerta.hacia, par: puerta.par, umbral: puerta.umbral, ancla: puerta.ancla, lista: false };
  }

  update(_: number, delta: number): void {
    if (!this.sala) return;
    const dt = Math.min(delta, 50);
    this.tiempo += dt;

    if (this.cruce && this.cruzando) {
      const antes = this.cruce.fase;
      this.cruce = avanzarCruce(this.cruce, dt, this.cruzando.lista, this.reducido);
      if (this.cruce.fase === 'salida') {
        const [x, y] = posicionAlCruzar(this.cruzando.umbral, this.cruzando.ancla, this.cruce);
        this.pos = { x, y };
        this.anda = true;
      }
      if (this.cruce.fase === 'espera' && antes !== 'espera' && !this.cargando) {
        const destino = this.cruzando;
        this.ir(destino.hacia, this.momento, undefined, undefined, destino.par, () => { destino.lista = true; });
      }
      this.velo.setAlpha(opacidadDeCruce(this.cruce, this.reducido));
      if (!cruceEnCurso(this.cruce)) {
        this.cruce = null;
        this.cruzando = null;
      }
    } else {
      const t = this.teclas;
      let vx = (t['A'].isDown || t['LEFT'].isDown ? -1 : 0) + (t['D'].isDown || t['RIGHT'].isDown ? 1 : 0);
      let vy = (t['W'].isDown || t['UP'].isDown ? -1 : 0) + (t['S'].isDown || t['DOWN'].isDown ? 1 : 0);
      if (vx || vy) {
        this.meta = null;
      } else if (this.meta) {
        const dx = this.meta.x - this.pos.x, dy = this.meta.y - this.pos.y;
        if (Math.hypot(dx, dy) < 3) this.meta = null;
        else { vx = dx; vy = dy; }
      }
      this.anda = false;
      if (vx || vy) {
        const n = Math.hypot(vx, vy);
        vx /= n;
        vy /= n;
        const paso = Math.min((VELOCIDAD * dt) / 1000, this.meta ? Math.hypot(this.meta.x - this.pos.x, this.meta.y - this.pos.y) : Infinity);
        if (vx && this.libre(this.pos.x + vx * paso, this.pos.y)) { this.pos.x += vx * paso; this.anda = true; }
        if (vy && this.libre(this.pos.x, this.pos.y + vy * paso)) { this.pos.y += vy * paso; this.anda = true; }
        if (!this.anda) this.meta = null;
        this.vista = Math.abs(vx) > Math.abs(vy) ? (vx < 0 ? 1 : 2) : (vy < 0 ? 3 : 0);
      }
    }

    for (const a of this.animados) {
      a.objeto.setFrame(a.fila * a.cuadros + (this.reducido ? 0 : Math.floor((this.tiempo / 1000) * a.fps) % a.cuadros));
    }
    if (this.cargando) return;
    const activa = this.sala.actualizar(dt, this.pos, this.bloqueadas);
    this.pintarJugador();
    this.seguir();
    this.pintarAviso(activa);
  }

  private pintarJugador(): void {
    const x = Math.round(this.pos.x), y = Math.round(this.pos.y);
    const hoja = this.anda ? 'kit:valentina:walk' : 'kit:valentina:idle';
    const cuadros = this.anda ? 6 : 4, fps = this.anda ? 10 : 4;
    const col = this.reducido ? 0 : Math.floor((this.tiempo / 1000) * fps) % cuadros;
    this.jugador.setTexture(hoja, this.vista * cuadros + col).setPosition(x, y).setDepth(actorDepth(y));
    this.sombraJugador.setPosition(x, y - 4);
  }

  private pintarAviso(activa: string | null): void {
    const aviso = $('aviso'), cola = $('aviso-cola');
    const puerta = activa && !this.cruce ? this.sala!.puertas().find(p => p.id === activa) : undefined;
    const sitio = puerta ? this.sala!.posicionDelAviso(puerta.id) : null;
    if (!puerta || !sitio) {
      aviso.hidden = true;
      cola.hidden = true;
      return;
    }
    const cam = this.cameras.main;
    const lienzo = this.game.canvas.getBoundingClientRect();
    const x = lienzo.left + (sitio.x - cam.worldView.x) * cam.zoom * (lienzo.width / cam.width);
    const y = lienzo.top + (sitio.y - cam.worldView.y) * cam.zoom * (lienzo.height / cam.height);
    const bloqueada = this.bloqueadas.has(puerta.id);
    if (aviso.hidden || aviso.dataset['puerta'] !== puerta.id) {
      aviso.dataset['puerta'] = puerta.id;
      $('aviso-texto').textContent = puerta.etiqueta;
      $('aviso-falta').textContent = bloqueada ? ' · Antes, habla con la enfermera' : '';
      aviso.classList.toggle('bloqueada', bloqueada);
      // Un SVG no tiene la propiedad `hidden` de los elementos HTML: hay que tocar el atributo.
      $('candado').toggleAttribute('hidden', !bloqueada);
      aviso.setAttribute('aria-label', bloqueada ? `${puerta.etiqueta}: cerrada. Antes, habla con la enfermera` : `${puerta.etiqueta}. Tecla E`);
      $('vivo').textContent = bloqueada ? `${puerta.etiqueta}: cerrada.` : `${puerta.etiqueta}. Pulsa E para pasar.`;
    }
    const margen = aviso.offsetWidth / 2 + 8;
    aviso.style.left = `${Math.round(Math.min(Math.max(x, lienzo.left + margen), lienzo.right - margen))}px`;
    aviso.style.top = `${Math.round(y - 6)}px`;
    cola.style.left = `${Math.round(x)}px`;
    cola.style.top = `${Math.round(y - 6)}px`;
    aviso.hidden = false;
    cola.hidden = false;
  }

  /** Lo que el script de capturas lee. */
  estado() {
    return {
      listo: this.listo && !this.cargando, sala: this.salaDatos?.id, momento: this.momento, x: this.pos.x, y: this.pos.y,
      activa: this.sala?.puertaActiva() ?? null, cruce: this.cruce?.fase ?? null, puertas: this.sala?.puertas() ?? [],
      avisos: this.sala?.plan.avisos ?? [],
    };
  }

  /** Pone a quien juega en un punto, mirando hacia `vista` (0 abajo, 1 izquierda, 2 derecha, 3 arriba). */
  colocar(x: number, y: number, vista = 0): void {
    this.pos = { x, y };
    this.vista = vista;
  }
}

async function arrancar(): Promise<void> {
  const lugar = params.get('lugar') ?? 'hospital';
  const [manifiesto, datosDelLugar] = await Promise.all([
    traerJson(MANIFIESTO_DE_PIEZAS_URL),
    traerJson(urlDePieza(`piezas/lugares/${lugar}.json`)) as Promise<{ salas: SalaDeLugar[] }>,
  ]);
  if (!esManifiestoDePiezas(manifiesto)) throw new Error('el manifiesto de piezas no es de esquema 2');
  await document.fonts.ready;
  const escena = new ArnesDeSala(manifiesto, datosDelLugar.salas);
  const contenedor = $(CONFIG.contenedor ?? 'juego');
  const juego = new Phaser.Game({
    type: Phaser.WEBGL,
    parent: contenedor,
    backgroundColor: '#0b0a12',
    pixelArt: true,
    roundPixels: true,
    scale: { mode: Phaser.Scale.RESIZE, width: contenedor.clientWidth, height: contenedor.clientHeight },
    scene: escena,
  });
  (window as unknown as Record<string, unknown>)['__arnes'] = { juego, escena };
}

arrancar().catch(error => {
  document.body.insertAdjacentHTML('beforeend', `<pre style="color:#f88;position:fixed;top:40px;left:12px">${String(error)}</pre>`);
  (window as unknown as Record<string, unknown>)['__arnesError'] = String(error);
});
