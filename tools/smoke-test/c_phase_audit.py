"""Auditoria Fase C (escena por capas + avatar modular + movimiento fino).

No reemplaza capture.py ni fase_1_1_audit.py: es el smoke test de la fase C.

Uso:
  python c_phase_audit.py --out-dir ../../docs/audit-c-avatar-motion-2026-06-11 --before
  python c_phase_audit.py --out-dir ../../docs/audit-c-avatar-motion-2026-06-11 --after

--before: capturas 00-before-* + 00-before-measurements.json
--after:  capturas finales 01..11 + 12-final-measurements.json, exit 1 si
          falla algun criterio (overflow, 404 de assets, errores de consola).
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

MEASURE_JS = """
() => {
  const rect = el => {
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.x, y: r.y, width: r.width, height: r.height,
             right: r.right, bottom: r.bottom };
  };
  let avatarStored = null;
  try { avatarStored = localStorage.getItem('psychosim_avatar'); } catch (e) {}
  return {
    innerWidth: window.innerWidth,
    innerHeight: window.innerHeight,
    scrollWidth: document.documentElement.scrollWidth,
    bodyScrollWidth: document.body.scrollWidth,
    canvasRect: rect(document.querySelector('canvas')),
    avatarStored: avatarStored ? JSON.parse(avatarStored) : null,
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
    canvas = page.locator("canvas").first
    if canvas.count():
        canvas.click(force=True)
        time.sleep(0.4)


def hold(page, key, ms):
    page.keyboard.down(key)
    time.sleep(ms / 1000)
    page.keyboard.up(key)
    time.sleep(0.25)


def hold_and_shoot(page, key, ms, out_path):
    """Captura DURANTE el movimiento (tecla abajo) para ver el frame de caminata."""
    page.keyboard.down(key)
    time.sleep(ms / 1000)
    page.screenshot(path=str(out_path))
    page.keyboard.up(key)
    time.sleep(0.25)


def wire_listeners(page, console_errors, asset404):
    page.on("console", lambda m: console_errors.append(m.text)
            if m.type == "error" else None)
    page.on("response", lambda r: asset404.append(f"{r.url} (HTTP {r.status})")
            if r.status >= 400 and "/assets/" in r.url else None)


def collect(page, label, console_errors, asset404):
    data = page.evaluate(MEASURE_JS)
    data["label"] = label
    data["consoleErrors"] = console_errors[:30]
    data["asset404"] = asset404[:30]
    return data


def evaluate_failures(measurements):
    failures = []
    for m in measurements:
        vp = m["label"]
        iw = m["innerWidth"]
        if m["scrollWidth"] > iw + 1:
            failures.append(f"[{vp}] scrollWidth {m['scrollWidth']} > innerWidth {iw}+1")
        if m["bodyScrollWidth"] > iw + 1:
            failures.append(f"[{vp}] bodyScrollWidth {m['bodyScrollWidth']} > innerWidth {iw}+1")
        if m["canvasRect"] and m["canvasRect"]["right"] > iw + 1:
            failures.append(f"[{vp}] canvas.right {m['canvasRect']['right']:.0f} > innerWidth {iw}+1")
        if m["asset404"]:
            failures.append(f"[{vp}] 404 assets: {m['asset404']}")
        if m["consoleErrors"]:
            failures.append(f"[{vp}] errores consola: {m['consoleErrors'][:5]}")
    return failures


def select_hair_variant(page, label):
    """Click en la variante de cabello por su etiqueta visible (UI fase C)."""
    btn = page.get_by_role("radio", name=label)
    if not btn.count():
        btn = page.get_by_text(label, exact=True)
    if btn.count():
        btn.first.click()
        time.sleep(0.8)
        return True
    return False


def run_before(out_dir, headed):
    measurements = []
    with sync_playwright() as pw:
        browser = pw.chromium.launch(headless=not headed)
        console_errors, asset404 = [], []
        ctx = browser.new_context(viewport={"width": 1600, "height": 900})
        page = ctx.new_page()
        wire_listeners(page, console_errors, asset404)
        login(page)

        page.goto(f"{BASE}/portal/personaje", wait_until="networkidle")
        time.sleep(2.5)
        page.screenshot(path=str(out_dir / "00-before-personaje.png"))
        measurements.append(collect(page, "personaje-1600x900", console_errors, asset404))

        open_game(page)
        page.screenshot(path=str(out_dir / "00-before-game-explore.png"))
        measurements.append(collect(page, "game-explore-1600x900", console_errors, asset404))

        hold_and_shoot(page, "a", 700, out_dir / "00-before-game-moving.png")
        measurements.append(collect(page, "game-moving-1600x900", console_errors, asset404))
        ctx.close()
        browser.close()

    out = out_dir / "00-before-measurements.json"
    out.write_text(json.dumps(measurements, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"BEFORE -> {out}")
    for f in evaluate_failures(measurements):
        print(f"NOTE: {f}")
    return 0


def run_after(out_dir, headed):
    measurements = []
    variants = [
        ("Corto negro", "01-personaje-short-black.png"),
        ("Largo castaño", "02-personaje-long-brown.png"),
        ("Recogido castaño", "03-personaje-tied-brown.png"),
        ("Rojizo", "04-personaje-red.png"),
    ]
    with sync_playwright() as pw:
        browser = pw.chromium.launch(headless=not headed)

        # ── Desktop: editor de personaje, las 4 variantes de cabello ────────
        console_errors, asset404 = [], []
        ctx = browser.new_context(viewport={"width": 1600, "height": 900})
        page = ctx.new_page()
        wire_listeners(page, console_errors, asset404)
        login(page)
        page.goto(f"{BASE}/portal/personaje", wait_until="networkidle")
        time.sleep(2.5)
        for label, shot in variants:
            if not select_hair_variant(page, label):
                print(f"WARN: variante '{label}' no encontrada en la UI")
            page.screenshot(path=str(out_dir / shot))
        measurements.append(collect(page, "personaje-1600x900", console_errors, asset404))

        # Guardar con la variante por defecto (corto negro) para comparar en Phaser
        select_hair_variant(page, "Corto negro")
        save_btn = page.get_by_role("button", name="Guardar personaje")
        if save_btn.count():
            save_btn.first.click()
            time.sleep(1.2)

        # ── Juego: idle + caminatas + colision + dialogo ─────────────────────
        open_game(page)
        time.sleep(1.0)
        page.screenshot(path=str(out_dir / "05-game-idle-down.png"))
        measurements.append(collect(page, "game-idle-1600x900", console_errors, asset404))

        hold_and_shoot(page, "a", 650, out_dir / "06-game-walk-left.png")
        hold_and_shoot(page, "d", 650, out_dir / "07-game-walk-right.png")
        hold_and_shoot(page, "w", 650, out_dir / "08-game-walk-up.png")

        # Colision con el escritorio: subir hasta chocar (el escritorio esta al norte del spawn)
        hold(page, "d", 350)
        hold(page, "w", 1400)
        page.screenshot(path=str(out_dir / "09-game-collision-desk.png"))
        measurements.append(collect(page, "game-collision-1600x900", console_errors, asset404))

        # Dialogo: ir hacia el colega de guardia (al oeste del spawn) y pulsar E
        hold(page, "s", 900)
        hold(page, "a", 1200)
        page.keyboard.press("e")
        time.sleep(2.0)
        page.screenshot(path=str(out_dir / "10-game-dialogue.png"))
        page.keyboard.press("Escape")
        time.sleep(0.8)
        measurements.append(collect(page, "game-dialogue-1600x900", console_errors, asset404))
        ctx.close()

        # ── Mobile 390x844 ───────────────────────────────────────────────────
        console_errors, asset404 = [], []
        ctx = browser.new_context(viewport={"width": 390, "height": 844})
        page = ctx.new_page()
        wire_listeners(page, console_errors, asset404)
        login(page)
        open_game(page)
        page.screenshot(path=str(out_dir / "11-mobile-explore.png"))
        measurements.append(collect(page, "mobile-390x844", console_errors, asset404))
        ctx.close()
        browser.close()

    out = out_dir / "12-final-measurements.json"
    out.write_text(json.dumps(measurements, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"MEASUREMENTS -> {out}")

    failures = evaluate_failures(measurements)
    for f in failures:
        print(f"FAIL: {f}")
    if failures:
        print(f"RESULTADO: {len(failures)} fallos")
        return 1
    print("RESULTADO: OK")
    return 0


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out-dir", required=True)
    ap.add_argument("--before", action="store_true")
    ap.add_argument("--after", action="store_true")
    ap.add_argument("--headed", action="store_true")
    args = ap.parse_args()

    out_dir = Path(args.out_dir).resolve()
    out_dir.mkdir(parents=True, exist_ok=True)

    if args.before:
        return run_before(out_dir, args.headed)
    if args.after:
        return run_after(out_dir, args.headed)
    print("Especifica --before o --after")
    return 2


if __name__ == "__main__":
    sys.exit(main())
