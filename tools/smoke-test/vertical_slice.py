"""Vertical slice E2E del MVP SIEP (urgencias-crisis) con capturas de evidencia.

Recorrido: login → editor de personaje (cambio visible + guardar) → simulador →
explorar → interacción/decisión → feedback → bitácora → salida segura → mobile.

Capturas en docs/audit-mvp-game-2026-06-09/ según el prompt maestro.
"""
import json
import time
from pathlib import Path

from playwright.sync_api import sync_playwright

BASE = "http://127.0.0.1:4201"
EMAIL = "estudiante@psychosim.edu.co"
PASSWORD = "Estudiante123!"
OUT = Path(__file__).resolve().parents[2] / "docs" / "audit-mvp-game-2026-06-09"

console_errors: list[str] = []
asset_404: list[str] = []


def wire_logging(page):
    page.on("console", lambda m: console_errors.append(m.text) if m.type == "error" else None)
    page.on("response", lambda r: asset_404.append(f"{r.url} (HTTP {r.status})")
            if r.status >= 400 and "/assets/" in r.url else None)


def login(page):
    page.goto(f"{BASE}/login", wait_until="networkidle")
    page.fill('input[formControlName="email"]', EMAIL)
    page.fill('input[formControlName="password"]', PASSWORD)
    page.click('button[type="submit"]')
    page.wait_for_url("**/portal/**", timeout=15000)


def hold(page, key, ms):
    page.keyboard.down(key)
    time.sleep(ms / 1000)
    page.keyboard.up(key)
    time.sleep(0.25)


def enter_simulator(page, force_new):
    page.goto(f"{BASE}/portal/simulador/1", wait_until="networkidle")
    time.sleep(4)
    label = "Iniciar nuevo intento" if force_new else "Continuar intento en progreso"
    btn = page.get_by_text(label)
    if btn.count():
        btn.first.click()
        time.sleep(4)
    page.locator("canvas").first.click(force=True)
    time.sleep(0.4)


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    with sync_playwright() as pw:
        browser = pw.chromium.launch()

        # ── Desktop 1600x900 ────────────────────────────────────────────────
        page = browser.new_page(viewport={"width": 1600, "height": 900})
        wire_logging(page)
        login(page)

        # 1) Editor de personaje: quitar el cabello (cambio inequívoco) y guardar
        page.goto(f"{BASE}/portal/personaje", wait_until="networkidle")
        time.sleep(1.5)
        page.get_by_text("Sin cabello", exact=True).first.click()
        time.sleep(0.8)
        page.screenshot(path=str(OUT / "01-character-editor.png"))
        page.get_by_text("Guardar personaje", exact=True).first.click()
        time.sleep(1)

        # 2) Simulador: intento nuevo (spawn limpio) y exploración
        enter_simulator(page, force_new=True)
        hold(page, "d", 700)
        hold(page, "w", 400)
        time.sleep(0.6)
        page.screenshot(path=str(OUT / "02-game-explore-desktop.png"))

        # 3) Caminar hasta la familia (escucha segura): bajar para esquivar la
        #    mesa de centro y luego ir a la izquierda hasta el sofá
        hold(page, "s", 1200)
        hold(page, "a", 2400)
        hold(page, "w", 250)
        page.keyboard.press("e")
        time.sleep(4.5)  # typewriter del diálogo
        page.screenshot(path=str(OUT / "03-game-dialogue-desktop.png"))

        # 4) Elegir la primera opción de decisión (tecla 1)
        page.keyboard.press("1")
        time.sleep(4)
        page.screenshot(path=str(OUT / "07-decision-feedback.png"))
        # Cerrar el feedback con su botón "Continuar" (nunca Escape: sin diálogo
        # abierto Escape dispara la salida segura)
        cont_btn = page.locator(".dialogue-strip .close-btn")
        if cont_btn.count():
            try:
                cont_btn.first.click(timeout=3000)
            except Exception:
                pass
        time.sleep(1)

        # 5) Bitácora: abrir, escribir, guardar
        page.keyboard.press("j")
        time.sleep(1)
        ta = page.locator(".journal-modal textarea")
        if ta.count() and ta.first.is_enabled():
            ta.first.fill("Identifiqué señales de riesgo vital y prioricé la contención emocional de la familia antes de cualquier interrogatorio.")
            time.sleep(0.4)
            save_btn = page.get_by_text("Guardar bitácora", exact=True)
            if save_btn.count():
                save_btn.first.click()
                time.sleep(1.5)
        page.screenshot(path=str(OUT / "04-journal-overlay.png"))
        x_btn = page.locator(".journal-modal .sheet-close")
        if x_btn.count():
            try:
                x_btn.first.click(timeout=3000)
            except Exception:
                page.keyboard.press("j")
        time.sleep(1)

        # 6) Cerrar cualquier diálogo restante (Escape con diálogo abierto solo
        #    lo cierra) y salida segura desde su botón del bottom-zone
        for _ in range(3):
            if not page.locator(".dialogue-strip").count():
                break
            page.keyboard.press("Escape")
            time.sleep(0.8)
        exit_btn = page.locator("button.safe-exit")
        if exit_btn.count():
            exit_btn.first.click()
        time.sleep(3.5)
        page.screenshot(path=str(OUT / "08-outcome-safe-exit.png"))
        page.close()

        # ── Mobile 390x844 ──────────────────────────────────────────────────
        mob = browser.new_page(viewport={"width": 390, "height": 844})
        wire_logging(mob)
        login(mob)
        enter_simulator(mob, force_new=True)
        mob.screenshot(path=str(OUT / "05-mobile-explore.png"))
        hold(mob, "s", 1200)
        hold(mob, "a", 2400)
        hold(mob, "w", 250)
        mob.keyboard.press("e")
        time.sleep(4.5)
        mob.screenshot(path=str(OUT / "06-mobile-dialogue.png"))
        mob.close()
        browser.close()

    print(json.dumps({
        "console_errors": console_errors[:30],
        "asset_404": asset_404[:30],
        "out": str(OUT),
    }, ensure_ascii=False, indent=1))


if __name__ == "__main__":
    main()
