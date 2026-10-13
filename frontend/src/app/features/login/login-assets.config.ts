/**
 * Assets y constantes del login SIEP.
 */

/** Rutas relativas al `base href` (producción y `ng serve`). */
export const LOGIN_ASSETS = {
  images: {
    // Escena del panel en WebP a 640 y 1280 px (plan visual F4-4: antes, un JPEG de 1600 px y 214 KB pintado dos veces).
    hero: 'assets/images/login/escena-acceso-640.webp',
    hero2x: 'assets/images/login/escena-acceso-1280.webp'
  }
} as const;

export const LOGIN_REMEMBER_EMAIL_KEY = 'siep_login_email';

export interface LoginPedagogyPillar {
  key: string;
  title: string;
  description: string;
}

export const LOGIN_PEDAGOGY_PILLARS: LoginPedagogyPillar[] = [
  {
    key: 'simula',
    title: 'SIMULA',
    description: 'Entornos reales para practicar sin riesgos.',
  },
  {
    key: 'evalua',
    title: 'EVALÚA',
    description: 'Mide tu progreso y toma decisiones informadas.',
  },
  {
    key: 'decide',
    title: 'DECIDE',
    description: 'Desarrolla criterio y toma mejores decisiones.',
  },
  {
    key: 'aprende',
    title: 'APRENDE',
    description: 'Fortalece competencias para transformar.',
  }
];
