"""Auditoria MVP Fase 1.1 — mediciones DOM + capturas (Playwright).

No reemplaza capture.py ni vertical_slice.py: es el smoke test de la fase 1.1.

Uso:
  python fase_1_1_audit.py --out-dir ../../docs/audit-mvp-game-fase-1-1-2026-06-10 --baseline
  python fase_1_1_audit.py --out-dir ../../docs/audit-mvp-game-fase-1-1-2026-06-10 --full

--baseline: solo mediciones por viewport -> 00-baseline-measurements.json
--full:     flujo completo (editor de personaje + juego + capturas) ->
            01..06 capturas + 07-final-measurements.json, exit code 1 si falla
            algun criterio MVP (overflow mobile, clases viejas, 404, errores).
"""
import argparse
import json
import sys
import time
from pathlib import Path

from playwright.sync_api import sync_playwright

BASE = "http://127.0.0.1:4201"
EMAIL = "estudiante@psychosim.edu.co"
PASSWORD = "Estudiante123!"

VIEWPORTS = [
    {"name": "desktop-1600x900", "width": 1600, "height": 900},
    {"name": "desktop-1366x768", "width": 1366, "height": 768},
    {"name": "mobile-390x844", "width": 390, "height": 844},
]

MEASURE_JS = """
() => {
  const rect = el => {
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.x, y: r.y, width: r.width, height: r.height,
             right: r.right, bottom: r.bottom };
  };
  return {
    innerWidth: window.innerWidth,
    innerHeight: window.innerHeight,
    scrollWidth: document.documentElement.scrollWidth,
    bodyScrollWidth: document.body.scrollWidth,
    canvasRect: rect(document.querySelector('canvas')),
    canvasZoneRect: rect(document.querySelector('.canvas-zone')),
    objectiveRect: rect(document.querySelector('.objective-card')),
    bottomZoneRect: rect(document.querySelector('.bottom-zone')),
    rightPanelRect: rect(document.querySelector('.right-panel')),
    toolDockRect: rect(document.querySelector('.tool-dock')),
    oldClassCounts: {
      'simulator-hero': document.querySelectorAll('.simulator-hero').length,
      'support-panel': document.querySelectorAll('.support-panel').length,
      'minimap-layer': document.querySelectorAll('.minimap-layer').length,
      'controls-hint': document.querySelectorAll('.controls-hint').length,
      'journal-toggle': document.querySelectorAll('.journal-toggle').length,
      'safe-exit-btn': document.querySelectorAll('.safe-exit-btn').length,
    },
  };
}
"""


def login(page):
    page.goto(f"{BASE}/login", wait_until="networkidle")
    page.fill('input[formControlName="email"]', EMAIL)
    page.fill('input[formControlName="password"]', PASSWORD)
    page.click('button[type="submit"]')
    page.wait_for_url("**/portal/**", timeout=20000)


def open_game(page, settle=5.0):
    page.goto(f"{BASE}/portal/simulador/1", wait_until="networkidle")
    time.sleep(2.0)
    resume = page.get_by_text("Continuar intento en progreso")
    if resume.count():
        resume.first.click()
    else:
        new = page.get_by_text("Iniciar nuevo intento")
        if new.count():
            new.first.click()
    time.sleep(settle)


def collect(page, viewport_name, console_errors, asset404):
    data = page.evaluate(MEASURE_JS)
    data["viewport"] = viewport_name
    data["consoleErrors"] = console_errors[:30]
    data["asset404"] = asset404[:30]
    return data


def wire_listeners(page, console_errors, asset404):
    page.on("console", lambda m: console_errors.append(m.text)
            if m.type == "error" else None)
    page.on("response", lambda r: asset404.append(f"{r.url} (HTTP {r.status})")
            if r.status >= 400 and "/assets/" in r.url else None)


def evaluate_failures(measurements):
    failures = []
    for m in measurements:
        vp = m["viewport"]
        iw = m["innerWidth"]
        if m["scrollWidth"] > iw + 1:
            failures.append(f"[{vp}] scrollWidth {m['scrollWidth']} > innerWidth {iw}+1")
        if m["bodyScrollWidth"] > iw + 1:
            failures.append(f"[{vp}] bodyScrollWidth {m['bodyScrollWidth']} > innerWidth {iw}+1")
        if m["canvasRect"] and m["canvasRect"]["right"] > iw + 1:
            failures.append(f"[{vp}] canvas.right {m['canvasRect']['right']:.0f} > innerWidth {iw}+1")
        if m["objectiveRect"] and m["objectiveRect"]["right"] > iw + 1:
            failures.append(f"[{vp}] objective.right {m['objectiveRect']['right']:.0f} > innerWidth {iw}+1")
        if m["bottomZoneRect"] and m["bottomZoneRect"]["right"] > iw + 1:
            failures.append(f"[{vp}] bottomZone.right {m['bottomZoneRect']['right']:.0f} > innerWidth {iw}+1")
        for cls, count in m["oldClassCounts"].items():
            if count > 0:
                failures.append(f"[{vp}] clase vieja .{cls} presente ({count})")
        if m["asset404"]:
            failures.append(f"[{vp}] 404 assets: {m['asset404']}")
        if m["consoleErrors"]:
            failures.append(f"[{vp}] errores consola: {m['consoleErrors'][:5]}")
    return failures


def run_baseline(out_dir, headed):
    measurements = []
    with sync_playwright() as pw:
        browser = pw.chromium.launch(headless=not headed)
        for vp in VIEWPORTS:
            console_errors, asset404 = [], []
            ctx = browser.new_context(
                viewport={"width": vp["width"], "height": vp["height"]})
            page = ctx.new_page()
            wire_listeners(page, console_errors, asset404)
            login(page)
            open_game(page)
            measurements.append(collect(page, vp["name"], console_errors, asset404))
            ctx.close()
        browser.close()
    out = out_dir / "00-baseline-measurements.json"
    out.write_text(json.dumps(measurements, indent=2, ensure_ascii=False),
                   encoding="utf-8")
    print(f"BASELINE -> {out}")
    for f in evaluate_failures(measurements):
        print(f"FAIL: {f}")
    return 0


def run_full(out_dir, headed):
    measurements = []
    failures = []
    with sync_playwright() as pw:
        browser = pw.chromium.launch(headless=not headed)

        # ── Desktop 1600x900: editor de personaje + juego ───────────────────
        console_errors, asset404 = [], []
        ctx = browser.new_context(viewport={"width": 1600, "height": 900})
        page = ctx.new_page()
        wire_listeners(page, console_errors, asset404)
        login(page)

        # 1-2. Editor de personaje: cambiar algo visible (tono de piel) y guardar
        page.goto(f"{BASE}/portal/personaje", wait_until="networkidle")
        time.sleep(2.5)
        swatches = page.locator("button.ce-swatch")
        if swatches.count() >= 3:
            swatches.nth(2).click()
            time.sleep(0.6)
        save_btn = page.get_by_role("button", name="Guardar personaje")
        if save_btn.count():
            save_btn.first.click()
            time.sleep(1.5)
        page.screenshot(path=str(out_dir / "01-character-editor.png"))

        # 3-4. Juego: explorar desktop
        open_game(page)
        page.screenshot(path=str(out_dir / "02-game-explore-desktop.png"))
        measurements.append(collect(page, "desktop-1600x900", console_errors, asset404))

        # 5. Interactuar con un actor/recurso cercano (mover + E)
        canvas = page.locator("canvas").first
        if canvas.count():
            canvas.click(force=True)
        for key, ms in (("a", 900), ("s", 500)):
            page.keyboard.down(key)
            time.sleep(ms / 1000)
            page.keyboard.up(key)
            time.sleep(0.2)
        page.keyboard.press("e")
        time.sleep(2.0)
        page.screenshot(path=str(out_dir / "03-game-dialogue-desktop.png"))
        page.keyboard.press("Escape")
        time.sleep(0.8)

        # 6. Bitacora
        page.keyboard.press("j")
        time.sleep(1.2)
        page.screenshot(path=str(out_dir / "04-journal-overlay.png"))
        page.keyboard.press("Escape")
        time.sleep(0.6)
        ctx.close()

        # ── Desktop 1366x768: solo medicion ─────────────────────────────────
        console_errors, asset404 = [], []
        ctx = browser.new_context(viewport={"width": 1366, "height": 768})
        page = ctx.new_page()
        wire_listeners(page, console_errors, asset404)
        login(page)
        open_game(page)
        page.screenshot(path=str(out_dir / "05-desktop-1366-explore.png"))
        measurements.append(collect(page, "desktop-1366x768", console_errors, asset404))
        ctx.close()

        # ── Mobile 390x844: explorar + dialogo ──────────────────────────────
        console_errors, asset404 = [], []
        ctx = browser.new_context(viewport={"width": 390, "height": 844})
        page = ctx.new_page()
        wire_listeners(page, console_errors, asset404)
        login(page)
        open_game(page)
        page.screenshot(path=str(out_dir / "06-mobile-explore.png"))
        measurements.append(collect(page, "mobile-390x844", console_errors, asset404))

        # Dialogo en mobile via lista accesible de interacciones
        sr_buttons = page.locator("section[aria-label='Lista accesible de puntos interactivos'] button")
        if sr_buttons.count():
            # sr-only: sin geometría en viewport — click sintético
            sr_buttons.first.dispatch_event("click")
            time.sleep(2.0)
        page.screenshot(path=str(out_dir / "07-mobile-dialogue.png"))
        m = collect(page, "mobile-390x844-dialogue", console_errors, asset404)
        measurements.append(m)

        # Journal en mobile (Fase F: el overlay debe entrar en 390px).
        # J abre la bitácora directamente; NO usar Escape antes — si el diálogo
        # ya se cerró solo, Escape dispara la salida segura y consume el intento.
        page.keyboard.press("j")
        time.sleep(1.2)
        page.screenshot(path=str(out_dir / "07b-mobile-journal.png"))
        page.keyboard.press("Escape")
        ctx.close()
        browser.close()

    out = out_dir / "08-final-measurements.json"
    out.write_text(json.dumps(measurements, indent=2, ensure_ascii=False),
                   encoding="utf-8")
    print(f"MEASUREMENTS -> {out}")

    failures = evaluate_failures(measurements)
    for f in failures:
        print(f"FAIL: {f}")
    if failures:
        print(f"RESULTADO: {len(failures)} fallos")
        return 1
    print("RESULTADO: OK — todos los criterios MVP cumplidos")
    return 0


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out-dir", required=True)
    ap.add_argument("--baseline", action="store_true")
    ap.add_argument("--full", action="store_true")
    ap.add_argument("--headed", action="store_true")
    args = ap.parse_args()

    out_dir = Path(args.out_dir).resolve()
    out_dir.mkdir(parents=True, exist_ok=True)

    if args.baseline:
        return run_baseline(out_dir, args.headed)
    if args.full:
        return run_full(out_dir, args.headed)
    print("Especifica --baseline o --full")
    return 2


if __name__ == "__main__":
    sys.exit(main())
