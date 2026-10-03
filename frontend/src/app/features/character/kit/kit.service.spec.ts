import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { KIT_BUNDLE_URL, KitService } from './kit.service';
import { testKitBundle } from './testing/kit-testing';

describe('KitService', () => {
  let service: KitService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    service = TestBed.inject(KitService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('pide kit.json una sola vez y publica el paquete en la señal', async () => {
    const first = service.load();
    const second = service.load();
    http.expectOne(KIT_BUNDLE_URL).flush(testKitBundle());
    const bundle = await first;
    expect(await second).toBe(bundle);
    expect(service.bundle()).toBe(bundle);
    expect(await service.load()).toBe(bundle);
  });

  it('si la carga falla, el siguiente load vuelve a intentarlo', async () => {
    const failed = service.load();
    http.expectOne(KIT_BUNDLE_URL).flush('caído', { status: 500, statusText: 'Error' });
    await expect(failed).rejects.toBeTruthy();
    expect(service.bundle()).toBeNull();
    const retry = service.load();
    http.expectOne(KIT_BUNDLE_URL).flush(testKitBundle());
    await expect(retry).resolves.toBeTruthy();
  });
});
