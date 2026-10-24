import type { Routes } from '@angular/router';

import { PendienteComponent } from './pantallas/pendiente.component';

/** Rutas del sandbox: cada momento del docente tiene su pantalla. */
export const routes: Routes = [
  { path: '', component: PendienteComponent, title: 'Mis casos · Editor de casos' },
  { path: 'lugar', component: PendienteComponent, title: 'Elegir un lugar · Editor de casos' },
  { path: 'salas', component: PendienteComponent, title: 'Elegir salas · Editor de casos' },
  {
    path: 'editor',
    title: 'El caso · Editor de casos',
    children: [
      { path: '', component: PendienteComponent },
      { path: 'sala/:salaId', component: PendienteComponent, title: 'Sala · Editor de casos' },
      { path: 'escena/:escenaId', component: PendienteComponent, title: 'Guion · Editor de casos' },
      { path: 'finales', component: PendienteComponent, title: 'Finales · Editor de casos' },
    ],
  },
  { path: 'probar', component: PendienteComponent, title: 'Probar como estudiante · Editor de casos' },
  { path: 'revision', component: PendienteComponent, title: 'Enviar a revisión · Editor de casos' },
  { path: '**', redirectTo: '' },
];
