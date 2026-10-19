/*
 * Comportamiento de la pantalla de arranque de SIEP (plan 03, S2-4). Antes eran un <script> y un onclick en línea de
 * index.html; en un archivo externo la política de contenido (CSP) no necesita 'unsafe-inline' en los scripts.
 */
(function () {
  'use strict';

  // «Recargar»: reintenta el arranque (antes onclick="location.reload()").
  var reload = document.querySelector('.siep-boot .siep-boot__reload');
  if (reload) {
    reload.addEventListener('click', function () {
      location.reload();
    });
  }

  // Si a los 12 s Angular todavía no reemplazó la pantalla de arranque, ofrecer recargar.
  setTimeout(function () {
    var slow = document.querySelector('.siep-boot .siep-boot__slow');
    if (slow) slow.hidden = false;
  }, 12000);
})();
