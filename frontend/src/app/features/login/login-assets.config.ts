/**
 * Assets y constantes del login SIEP.
 */

/** Rutas relativas al `base href` (producción y `ng serve`). */
export const LOGIN_ASSETS = {
  images: {
    hero: 'assets/images/login/Login.jpeg'
  }
} as const;

export const LOGIN_REMEMBER_EMAIL_KEY = 'siep_login_email';

export interface LoginPedagogyPillar {
  key: string;
  title: string;
  description: string;
  color: string;
  short: string;
}

export const LOGIN_PEDAGOGY_PILLARS: LoginPedagogyPillar[] = [
  {
    key: 'simula',
    title: 'SIMULA',
    description: 'Entornos reales para practicar sin riesgos.',
    color: '#b24bff',
    short: 'S'
  },
  {
    key: 'evalua',
    title: 'EVALÚA',
    description: 'Mide tu progreso y toma decisiones informadas.',
    color: '#4cc9ff',
    short: 'E'
  },
  {
    key: 'decide',
    title: 'DECIDE',
    description: 'Desarrolla criterio y toma mejores decisiones.',
    color: '#f5c451',
    short: 'D'
  },
  {
    key: 'aprende',
    title: 'APRENDE',
    description: 'Fortalece competencias para transformar.',
    color: '#5ce38a',
    short: 'A'
  }
];
