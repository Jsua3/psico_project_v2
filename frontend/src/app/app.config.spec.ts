import { readFileSync } from 'fs';
import { join } from 'path';

const source = readFileSync(join(__dirname, 'app.config.ts'), 'utf-8');

describe('app.config: arranque', () => {
  it('valida la sesión sin bloquear el primer pintado más de 1,5 s', () => {
    expect(source).not.toContain('APP_INITIALIZER');
    expect(source).toContain('const AUTH_SYNC_BUDGET_MS = 1500;');
    expect(source).toMatch(
      /provideAppInitializer\(\(\) => \{\s*const auth = inject\(AuthService\);\s*return settleWithin\(firstValueFrom\(auth\.syncCurrentUser\(\)\), AUTH_SYNC_BUDGET_MS\);\s*\}\)/,
    );
  });
});
