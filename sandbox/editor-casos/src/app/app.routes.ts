import type { Routes } from '@angular/router';

import { EditorComponent } from './pantallas/editor/editor.component';
import { InicioComponent } from './pantallas/inicio/inicio.component';
import { LugarComponent } from './pantallas/lugar/lugar.component';
import { PendienteComponent } from './pantallas/pendiente.component';
import { SalaComponent } from './pantallas/sala/sala.component';
import { SalasComponent } from './pantallas/salas/salas.component';

/** Rutas del sandbox: cada momento del docente tiene su pantalla. */
export const routes: Routes = [
  { path: '', component: InicioComponent, title: 'Mis casos · Editor de casos' },
  { path: 'lugar', component: LugarComponent, title: 'Elegir un lugar · Editor de casos' },
  { path: 'salas', component: SalasComponent, title: 'Elegir salas · Editor de casos' },
  {
    path: 'editor',
    title: 'El caso · Editor de casos',
    children: [
      { path: '', component: EditorComponent },
      { path: 'sala/:salaId', component: SalaComponent, title: 'Sala · Editor de casos' },
      { path: 'escena/:escenaId', component: PendienteComponent, title: 'Guion · Editor de casos' },
      { path: 'finales', component: PendienteComponent, title: 'Finales · Editor de casos' },
    ],
  },
  { path: 'probar', component: PendienteComponent, title: 'Probar como estudiante · Editor de casos' },
  { path: 'revision', component: PendienteComponent, title: 'Enviar a revisión · Editor de casos' },
  { path: '**', redirectTo: '' },
];
