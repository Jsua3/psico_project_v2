/*
 * Comportamiento de la pantalla de arranque de SIEP (plan 03, S2-4). Antes eran un <script> y un onclick en línea de
 * index.html; en un archivo externo la política de contenido (CSP) no necesita 'unsafe-inline' en los scripts.
 */
(function () {
  'use strict';

  // Piel de la pantalla de arranque: el tema que la persona eligió (el mismo que lee TemaService). Va en el div de
  // arranque, no en html ni en body (REGLA-010). Con «Automático» (o sin valor) manda prefers-color-scheme en boot.css.
  // Dentro de try/catch: el almacenamiento puede estar bloqueado (ventana privada, cookies cerradas).
  var arranque = document.querySelector('.siep-boot');
  if (arranque) {
    try {
      var tema = localStorage.getItem('metafronesis.tema');
      if (tema === 'oscuro' || tema === 'claro') arranque.classList.add('siep-boot--' + tema);
    } catch (e) {
      /* sin almacenamiento: queda la preferencia del sistema */
    }
  }

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
