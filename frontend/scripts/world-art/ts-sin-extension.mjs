// Gancho de resolución para las pruebas en Node del motor de salas (`src/app/features/simulator/sala/`).
// Sus módulos TypeScript se importan entre sí sin extensión, como en el resto de la app; Node pide la extensión.
// Con este archivo importado primero, un especificador relativo sin extensión que exista como `.ts` se resuelve a ese archivo.
// El motor debe cargarse después, con `await import(...)`: los imports estáticos se resuelven antes de que el gancho exista.
import { existsSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { fileURLToPath } from 'node:url';

registerHooks({
  resolve(specifier, context, nextResolve) {
    const relativo = specifier.startsWith('./') || specifier.startsWith('../');
    if (relativo && context.parentURL?.startsWith('file:') && !/\.[a-z]+$/i.test(specifier)) {
      const candidato = new URL(`${specifier}.ts`, context.parentURL);
      if (existsSync(fileURLToPath(candidato))) return nextResolve(candidato.href, context);
    }
    return nextResolve(specifier, context);
  },
});
