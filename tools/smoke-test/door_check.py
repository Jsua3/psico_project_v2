"""Verificación live del flujo de puertas (Task 7 — fase competitiva).

Camina a la puerta derecha, intenta E (bloqueada), habla con la enfermera,
vuelve a la puerta, cruza a la sala de escucha y regresa. Captura evidencia.
"""
import sys
import time
from pathlib import Path

from playwright.sync_api import sync_playwright

BASE = "http://127.0.0.1:4201"
EMAIL = "estudiante@psychosim.edu.co"
PASSWORD = "Estudiante123!"
OUT = Path(__file__).resolve().parents[2] / "docs" / "audit-flujo-competitivo-npcs-2026-06-11"


def hold(page, key, ms):
    page.keyboard.down(key)
    time.sleep(ms / 1000)
    page.keyboard.up(key)
    time.sleep(0.3)


def context_bar(page):
    return (page.locator(".context-bar").text_content() or "").strip()


def speaker(page):
    loc = page.locator(".speaker-name")
    return (loc.first.text_content() or "").strip() if loc.count() else ""


def main() -> int:
    sys.stdout.reconfigure(encoding="utf-8")  # consola Windows cp1252 vs '→'
    OUT.mkdir(parents=True, exist_ok=True)
    failures = []
    with sync_playwright() as pw:
        browser = pw.chromium.launch(headless=True)
        page = browser.new_page(viewport={"width": 1600, "height": 900})
        console_errors = []
        page.on("console", lambda m: console_errors.append(m.text) if m.type == "error" else None)

        page.goto(f"{BASE}/login", wait_until="networkidle")
        page.fill('input[formControlName="email"]', EMAIL)
        page.fill('input[formControlName="password"]', PASSWORD)
        page.click('button[type="submit"]')
        page.wait_for_url("**/portal/**", timeout=20000)

        page.goto(f"{BASE}/portal/simulador/1", wait_until="networkidle")
        time.sleep(2.0)
        new_btn = page.get_by_text("Iniciar nuevo intento")
        if new_btn.count():
            new_btn.first.click()
        else:
            resume = page.get_by_text("Continuar intento en progreso")
            if resume.count():
                resume.first.click()
        time.sleep(5.0)
        page.locator("canvas").first.click(force=True)
        time.sleep(0.5)

        # ── 1. caminar a la puerta derecha-abajo (spawn 480,420 → ~853,465) ──
        hold(page, "s", 300)
        hold(page, "d", 2600)
        bar = context_bar(page)
        page.screenshot(path=str(OUT / "03-door-prompt.png"))
        print(f"context bar junto a la puerta: {bar!r}")
        if "Sala de escucha" not in bar:
            failures.append(f"prompt de puerta no visible: {bar!r}")

        # ── 2. E sin evidencia → diálogo de puerta bloqueada ─────────────────
        page.keyboard.press("e")
        time.sleep(1.8)
        if page.get_by_text("Habla primero con la enfermera").count():
            print("puerta bloqueada OK (gate visible)")
        else:
            failures.append("no apareció el mensaje de puerta bloqueada")
        page.screenshot(path=str(OUT / "03b-door-locked.png"))
        page.keyboard.press("Escape")
        time.sleep(0.6)

        # ── 3. hablar con la enfermera (736,372): primero a la izquierda (la
        #      planta bloquea el ascenso en x>796) y luego subir por x≈733;
        #      así la seguridad (patrulla en y≈462) queda lejos del rango ──────
        hold(page, "a", 800)
        hold(page, "w", 700)
        page.keyboard.press("e")
        time.sleep(1.8)
        who = speaker(page)
        print(f"diálogo abierto por: {who!r}")
        page.screenshot(path=str(OUT / "03c-enfermera-dialogue.png"))
        if "Enfermera" not in who:
            failures.append(f"el diálogo no es de la enfermera: {who!r}")
        page.keyboard.press("Escape")
        time.sleep(0.6)

        # ── 4. volver a la puerta y cruzar ────────────────────────────────────
        hold(page, "s", 700)
        hold(page, "d", 900)
        page.keyboard.press("e")
        time.sleep(3.5)   # fade + enterRoom + scenario reload + render
        bar_arrival = context_bar(page)
        page.screenshot(path=str(OUT / "04-room-transition.png"))
        print(f"context bar al llegar a la sala de escucha: {bar_arrival!r}")
        if "Sala de urgencias" not in bar_arrival:
            failures.append(f"no se cruzó a la sala de escucha (prompt regreso ausente): {bar_arrival!r}")

        # ── 5. volver por la misma puerta (E de nuevo) ────────────────────────
        page.keyboard.press("e")
        time.sleep(3.5)
        bar_back = context_bar(page)
        page.screenshot(path=str(OUT / "04b-room-return.png"))
        print(f"context bar de vuelta en urgencias: {bar_back!r}")
        if "Sala de escucha" not in bar_back:
            failures.append(f"no se volvió a urgencias: {bar_back!r}")

        critical = [e for e in console_errors if "ERR_ABORTED" not in e]
        if critical:
            failures.append(f"errores de consola: {critical[:5]}")
        browser.close()

    for f in failures:
        print(f"FAIL: {f}")
    print("RESULTADO:", "OK" if not failures else f"{len(failures)} fallos")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
