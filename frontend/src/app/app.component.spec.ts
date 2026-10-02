import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { AppComponent } from './app.component';

describe('AppComponent: enlaces de salto', () => {
  beforeEach(() => TestBed.configureTestingModule({
    imports: [AppComponent],
    providers: [provideRouter([])],
  }));

  afterEach(() => document.querySelectorAll('[data-test-target]').forEach(node => node.remove()));

  function render() {
    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();
    return fixture;
  }

  it('lleva el foco al primer <main> sin navegar', () => {
    const main = document.createElement('main');
    main.setAttribute('data-test-target', '');
    document.body.appendChild(main);

    const link = render().nativeElement.querySelector('a.psy-skip-link') as HTMLAnchorElement;
    const click = new MouseEvent('click', { bubbles: true, cancelable: true });
    link.dispatchEvent(click);

    expect(click.defaultPrevented).toBe(true);
    expect(main.getAttribute('tabindex')).toBe('-1');
    expect(document.activeElement).toBe(main);
  });

  it('prefiere #main-content cuando existe', () => {
    const main = document.createElement('main');
    main.setAttribute('data-test-target', '');
    const content = document.createElement('div');
    content.id = 'main-content';
    content.setAttribute('data-test-target', '');
    document.body.append(main, content);

    const link = render().nativeElement.querySelector('a.psy-skip-link') as HTMLAnchorElement;
    link.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

    expect(document.activeElement).toBe(content);
  });

  it('solo ofrece «Saltar al juego» dentro de un caso', () => {
    const links = render().nativeElement.querySelectorAll('a.psy-skip-link');
    expect(links.length).toBe(1);
  });
});
