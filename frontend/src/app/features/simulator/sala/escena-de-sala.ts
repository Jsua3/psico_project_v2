/**
 * Una sala por piezas dentro de una escena de Phaser: pinta el plan de `composicion.ts`, pone encima las dos capas de luz
 * de `luz.ts` y lleva las puertas con `puerta.ts`. Es lo que la escena del juego (y el arnés de capturas) crea al entrar en
 * una sala que trae `estructura`; lo demás de la escena (actores, cámara, rótulos) no cambia.
 *
 * - Fondo (piso, tapetes, muros, capas propias y la sombra de lo que cuelga del muro): se compone por software con
 *   `pintarFondo`, igual píxel a píxel a Python, y va como una sola textura.
 * - Piezas y puertas: sprites de sus tiras, para que se animen (reloj, puertas, ventanas y lámparas según el momento).
 * - Luz: dos texturas del tamaño de la sala, sobre los actores. `ambiente` multiplica y `brillo` suma: quien pasa por un
 *   haz se ilumina y quien está en penumbra se oscurece. La sombra de quien juega y la cuña de la puerta abierta se
 *   rehacen solo en el rectángulo que cambia.
 * - La puerta del lado de la cámara se señala con una flecha en el piso, que sube y baja (quieta con movimiento reducido).
 */
import Phaser from 'phaser';

import { DEPTH, actorDepth } from '../depth-sort.util';
import { urlDePieza } from './catalogo';
import type { ManifiestoDePiezas, SalaPorPiezas } from './catalogo';
import { planDeSala, rutasDelPlan } from './composicion';
import type { PlanDeSala, SpriteDeSala } from './composicion';
import type { Momento, Muro } from './geometria';
import { cuerpo, prepararLuz } from './luz';
import type { Cuerpo, LuzDeSala, Rectangulo } from './luz';
import { pintarFondo } from './pintor';
import type { Imagen } from './pintor';
import {
  PUERTA_ABIERTA, PUERTA_CERRADA, abiertaDelTodo, avanzarPuerta, cuadroVisible, desvioDeSacudida, puertaActiva, sacudir,
} from './puerta';
import type { EstadoDePuerta, Hojas } from './puerta';

/** Profundidades: el fondo y lo del muro bajo los actores; lo del lado de la cámara sobre ellos; la luz sobre todo eso. */
export const PROFUNDIDAD = {
  fondo: DEPTH.BACKGROUND,
  muro: DEPTH.WALLS,
  sombras: DEPTH.ENVIRONMENT,
  flechas: DEPTH.LIGHTING_FLOOR,
  frente: DEPTH.PROPS_FRONT,
  ambiente: DEPTH.LIGHTING - 2,
  brillo: DEPTH.LIGHTING - 1,
} as const;

/** Cada cuánto, como mucho, se rehace la sombra de quien juega mientras camina (ms). */
const MS_ENTRE_SOMBRAS = 33;
/** Flecha del lado de la cámara: periodo del vaivén y cuánto sube. */
const FLECHA_PERIODO_MS = 1200;
const FLECHA_SUBE = 2;

export interface PuertaDeEscena {
  id: string;
  muro: Muro;
  etiqueta: string;
  hacia?: string;
  par?: string;
  /** Punto de apoyo de la puerta en pantalla. */
  ancla: [number, number];
  /** Umbral: donde se mide la cercanía y donde aparece quien llega por ella. */
  umbral: [number, number];
}

export interface OpcionesDeEscena {
  momento?: Momento;
  reducido: boolean;
  /** Muebles y personas quietos de la sala: arrojan sombra. */
  cuerpos?: readonly Cuerpo[];
}

interface SpriteVivo {
  plan: SpriteDeSala;
  objeto: Phaser.GameObjects.Sprite;
  hojas: Hojas;
  estado: EstadoDePuerta;
}

const clave = (ruta: string) => `sala:${ruta}`;
const pixeles = new Map<string, Imagen>();

/** Los píxeles de una textura cargada, leídos una sola vez. */
function pixelesDe(escena: Phaser.Scene, ruta: string): Imagen | null {
  const guardada = pixeles.get(ruta);
  if (guardada) return guardada;
  if (!escena.textures.exists(clave(ruta))) return null;
  const fuente = escena.textures.get(clave(ruta)).getSourceImage() as HTMLImageElement | HTMLCanvasElement;
  const lienzo = document.createElement('canvas');
  lienzo.width = fuente.width;
  lienzo.height = fuente.height;
  const ctx = lienzo.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(fuente, 0, 0);
  const datos = ctx.getImageData(0, 0, lienzo.width, lienzo.height);
  const imagen = { ancho: lienzo.width, alto: lienzo.height, rgba: datos.data };
  pixeles.set(ruta, imagen);
  return imagen;
}

/** Galón de 9 × 6 px que apunta hacia la cámara, con su contorno: la flecha de la puerta que no se ve. */
function texturaDeFlecha(escena: Phaser.Scene): string {
  const nombre = 'sala:flecha-camara';
  if (escena.textures.exists(nombre)) return nombre;
  const forma = [
    '.#######.',
    '#ooooooo#',
    '.#ooooo#.',
    '..#ooo#..',
    '...#o#...',
    '....#....',
  ];
  const lienzo = escena.textures.createCanvas(nombre, 9, 6);
  const ctx = lienzo?.getContext();
  if (!lienzo || !ctx) return nombre;
  forma.forEach((fila, y) => [...fila].forEach((c, x) => {
    if (c === '.') return;
    ctx.fillStyle = c === '#' ? '#281c18' : '#f2e2b8';
    ctx.fillRect(x, y, 1, 1);
  }));
  lienzo.refresh();
  return nombre;
}

export class EscenaDeSala {
  readonly plan: PlanDeSala;
  private readonly escena: Phaser.Scene;
  private readonly objetos: Phaser.GameObjects.GameObject[] = [];
  private readonly vivos: SpriteVivo[] = [];
  private readonly flechas: { objeto: Phaser.GameObjects.Image; y: number }[] = [];
  private readonly luz: LuzDeSala;
  private readonly lienzos: { ambiente: Phaser.Textures.CanvasTexture; brillo: Phaser.Textures.CanvasTexture } | null;
  private readonly texturasPropias: string[] = [];
  private reducido: boolean;
  private tiempo = 0;
  private activa: string | null = null;
  private abiertas = '';
  private jugador: Cuerpo | null = null;
  private desdeSombra = MS_ENTRE_SOMBRAS;

  /** El plan de dibujo de la sala, o null si su estructura no se puede armar (ancho fuera del catálogo, por ejemplo). */
  static planear(sala: SalaPorPiezas, manifiesto: ManifiestoDePiezas | null, momento?: Momento): PlanDeSala | null {
    if (!manifiesto) return null;
    try {
      return planDeSala(sala, manifiesto, momento);
    } catch {
      return null;
    }
  }

  /** Pide las imágenes que el plan necesita y no están cargadas. true si pidió alguna: hay que esperar a que lleguen. */
  static pedirTexturas(escena: Phaser.Scene, plan: PlanDeSala): boolean {
    let pidio = false;
    const enFondo = new Set(plan.fondo.map(r => r.ruta));
    for (const ruta of rutasDelPlan(plan)) {
      if (escena.textures.exists(clave(ruta))) continue;
      const sprite = enFondo.has(ruta) ? undefined : plan.sprites.find(s => s.ruta === ruta);
      if (sprite) escena.load.spritesheet(clave(ruta), urlDePieza(ruta), { frameWidth: sprite.w, frameHeight: sprite.h });
      else escena.load.image(clave(ruta), urlDePieza(ruta));
      pidio = true;
    }
    return pidio;
  }

  constructor(escena: Phaser.Scene, sala: SalaPorPiezas, plan: PlanDeSala, manifiesto: ManifiestoDePiezas, opciones: OpcionesDeEscena) {
    this.escena = escena;
    this.plan = plan;
    this.reducido = opciones.reducido;
    const sufijo = `${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`;

    // Fondo: una sola textura, compuesta como en Python.
    const imagenes = new Map<string, Imagen>();
    for (const r of plan.fondo) {
      const px = pixelesDe(escena, r.ruta);
      if (px) imagenes.set(r.ruta, px);
    }
    for (const s of plan.sprites) {
      if (s.capa === 'muro' && s.muro === 'fondo') {
        const px = pixelesDe(escena, s.ruta);
        if (px) imagenes.set(s.ruta, px);
      }
    }
    const fondo = pintarFondo(plan, imagenes);
    const nombreFondo = `sala:fondo-${sufijo}`;
    const lienzoFondo = escena.textures.createCanvas(nombreFondo, plan.ancho, plan.alto);
    if (lienzoFondo) {
      lienzoFondo.getContext().putImageData(new ImageData(new Uint8ClampedArray(fondo.rgba), plan.ancho, plan.alto), 0, 0);
      lienzoFondo.refresh();
      this.texturasPropias.push(nombreFondo);
      this.objetos.push(escena.add.image(0, 0, nombreFondo).setOrigin(0, 0).setDepth(PROFUNDIDAD.fondo));
    }

    // Piezas y puertas.
    for (const s of plan.sprites) {
      if (!escena.textures.exists(clave(s.ruta))) continue;
      const objeto = escena.add.sprite(s.x, s.y, clave(s.ruta), s.cuadro).setOrigin(0, 0).setFlipX(s.espejo);
      objeto.setDepth(s.capa === 'muro' ? PROFUNDIDAD.muro : s.capa === 'frente' ? PROFUNDIDAD.frente : actorDepth(s.z));
      this.objetos.push(objeto);
      const hojas = (manifiesto.piezas[`puerta/${s.modelo}`]?.hojas ?? 'una') as Hojas;
      this.vivos.push({ plan: s, objeto, hojas, estado: PUERTA_CERRADA });
    }
    const flecha = texturaDeFlecha(escena);
    for (const f of plan.flechas) {
      const objeto = escena.add.image(f.x, f.y, flecha).setOrigin(0.5, 1).setDepth(PROFUNDIDAD.flechas);
      this.objetos.push(objeto);
      this.flechas.push({ objeto, y: f.y });
    }

    // Luz.
    this.luz = prepararLuz(sala, manifiesto.piezas, { momento: plan.momento, cuerpos: opciones.cuerpos ?? [] });
    const capas = this.luz.capas();
    const ambiente = escena.textures.createCanvas(`sala:ambiente-${sufijo}`, plan.ancho, plan.alto);
    const brillo = escena.textures.createCanvas(`sala:brillo-${sufijo}`, plan.ancho, plan.alto);
    if (ambiente && brillo) {
      this.lienzos = { ambiente, brillo };
      this.texturasPropias.push(ambiente.key, brillo.key);
      ambiente.getContext().putImageData(new ImageData(capas.ambiente, plan.ancho, plan.alto), 0, 0);
      brillo.getContext().putImageData(new ImageData(capas.brillo, plan.ancho, plan.alto), 0, 0);
      ambiente.refresh();
      brillo.refresh();
      this.objetos.push(
        escena.add.image(0, 0, ambiente.key).setOrigin(0, 0).setDepth(PROFUNDIDAD.ambiente).setBlendMode(Phaser.BlendModes.MULTIPLY),
        escena.add.image(0, 0, brillo.key).setOrigin(0, 0).setDepth(PROFUNDIDAD.brillo).setBlendMode(Phaser.BlendModes.ADD),
      );
    } else {
      this.lienzos = null;
    }
  }

  /** Las puertas de la sala, con su umbral. */
  puertas(): PuertaDeEscena[] {
    return this.plan.sprites.flatMap(s => s.puerta ? [{
      id: s.id, muro: s.puerta.muro, etiqueta: s.puerta.etiqueta, hacia: s.puerta.hacia, par: s.puerta.par,
      ancla: s.puerta.ancla, umbral: s.puerta.llegada,
    }] : []);
  }

  /** La puerta que manda ahora (la que muestra el aviso), o null. */
  puertaActiva(): string | null {
    return this.activa;
  }

  /**
   * Avanza `dtMs`: anima el reloj y lo que se mueve solo, abre la puerta a la que se acerca quien juega y cierra las demás,
   * y rehace la luz donde cambió (la cuña de la puerta abierta y la sombra de quien juega). Devuelve la puerta activa.
   */
  actualizar(dtMs: number, jugador: { x: number; y: number } | null, bloqueadas: ReadonlySet<string> = new Set()): string | null {
    this.tiempo += dtMs;
    this.activa = jugador ? puertaActiva(this.puertas(), jugador, this.activa) : null;
    const abiertas: string[] = [];
    for (const vivo of this.vivos) {
      const s = vivo.plan;
      if (s.puerta) {
        vivo.estado = avanzarPuerta(vivo.estado, { dtMs, cerca: this.activa === s.id, bloqueada: bloqueadas.has(s.id), reducido: this.reducido });
        vivo.objeto.setFrame(cuadroVisible(vivo.estado, vivo.hojas));
        vivo.objeto.x = s.x + desvioDeSacudida(vivo.estado);
        if (abiertaDelTodo(vivo.estado)) abiertas.push(s.id);
      } else if (s.fps && s.cuadros > 2) {
        vivo.objeto.setFrame(this.reducido ? s.cuadro : Math.floor((this.tiempo / 1000) * s.fps) % s.cuadros);
      }
    }
    const firma = abiertas.join('|');
    if (firma !== this.abiertas) {
      this.abiertas = firma;
      this.pintarLuz(this.luz.abrir(abiertas));
    }
    for (const f of this.flechas) {
      const fase = this.reducido ? 0 : Math.floor(((this.tiempo % FLECHA_PERIODO_MS) / FLECHA_PERIODO_MS) * 4);
      f.objeto.y = f.y - [0, 1, FLECHA_SUBE, 1][fase];
    }
    this.desdeSombra += dtMs;
    if (jugador) {
      const nuevo = cuerpo(Math.round(jugador.x), Math.round(jugador.y), 48, 72, true);
      if (this.desdeSombra >= MS_ENTRE_SOMBRAS && (!this.jugador || nuevo.x0 !== this.jugador.x0 || nuevo.y0 !== this.jugador.y0)) {
        this.jugador = nuevo;
        this.desdeSombra = 0;
        this.pintarLuz(this.luz.moverCuerpo(nuevo));
      }
    } else if (this.jugador) {
      this.jugador = null;
      this.pintarLuz(this.luz.moverCuerpo(null));
    }
    return this.activa;
  }

  /** Intento de cruzar una puerta cerrada con llave: traquetea. */
  sacudir(id: string): void {
    const vivo = this.vivos.find(v => v.plan.id === id);
    if (vivo) vivo.estado = sacudir(vivo.estado, this.reducido);
  }

  /** Deja una puerta abierta de una vez (quien acaba de llegar por ella la ve abierta detrás). */
  abrirYa(id: string): void {
    const vivo = this.vivos.find(v => v.plan.id === id);
    if (!vivo) return;
    vivo.estado = PUERTA_ABIERTA;
    this.activa = id;
  }

  fijarReducido(reducido: boolean): void {
    this.reducido = reducido;
  }

  /** Dónde va el aviso de una puerta, en coordenadas de sala: sobre la puerta (o sobre su umbral, si es del lado de la cámara). */
  posicionDelAviso(id: string): { x: number; y: number } | null {
    const s = this.plan.sprites.find(p => p.id === id && p.puerta);
    if (!s?.puerta) return null;
    if (s.puerta.muro === 'camara') return { x: s.puerta.llegada[0], y: s.puerta.llegada[1] - 84 };
    return { x: s.puerta.llegada[0], y: Math.min(s.y, s.puerta.llegada[1] - 84) - 6 };
  }

  destruir(): void {
    for (const objeto of this.objetos) objeto.destroy();
    for (const nombre of this.texturasPropias) if (this.escena.textures.exists(nombre)) this.escena.textures.remove(nombre);
    this.objetos.length = 0;
  }

  private pintarLuz(zona: Rectangulo | null): void {
    if (!zona || !this.lienzos) return;
    const capas = this.luz.capas();
    for (const [lienzo, datos] of [[this.lienzos.ambiente, capas.ambiente], [this.lienzos.brillo, capas.brillo]] as const) {
      lienzo.getContext().putImageData(new ImageData(datos, this.plan.ancho, this.plan.alto), 0, 0, zona.x, zona.y, zona.w, zona.h);
      lienzo.refresh();
    }
  }
}
