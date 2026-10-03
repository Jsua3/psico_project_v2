// frontend/src/app/features/character/kit/testing/kit-testing.ts
/** Solo para specs: el paquete real del kit leído de disco y un KitService que ya lo tiene. */
import { signal } from '@angular/core';
import { readFileSync } from 'fs';
import { join } from 'path';

import type { KitBundle } from '../kit-engine';
import type { KitService } from '../kit.service';

let cached: KitBundle | null = null;

export function testKitBundle(): KitBundle {
  cached ??= JSON.parse(readFileSync(join(__dirname, '../../../../../assets/characters/kit/kit.json'), 'utf8')) as KitBundle;
  return cached;
}

export function fakeKitService(bundle: KitBundle = testKitBundle()): KitService {
  return { bundle: signal(bundle).asReadonly(), load: () => Promise.resolve(bundle) } as unknown as KitService;
}
