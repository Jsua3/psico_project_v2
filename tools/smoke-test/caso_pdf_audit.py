"""Auditoría live del caso PDF multi-sala (checklist §12.3 del prompt maestro).

Flujo completo en navegador real:
login → hospital-urgencias → puerta bloqueada → familia → sala de escucha →
volver → decisiones H1-H3 → salida institucional (salto temporal) →
comisaría recepción → refresh (persistencia) → expediente → consultorio →
decisiones C1-C3 → final → mobile.

Capturas + mediciones en docs/audit-caso-pdf-multisala-2026-06-12/.
"""
import json
import sys
import time
from pathlib import Path

from playwright.sync_api import sync_playwright

BASE = "http://127.0.0.1:4201"
EMAIL = "estudiante@psychosim.edu.co"
PASSWORD = "Estudiante123!"
CASE_VERSION = 221
OUT = Path(__file__).resolve().parents[2] / "docs" / "audit-caso-pdf-multisala-2026-06-12"

failures: list[str] = []
console_errors: list[str] = []
not_found: list[str] = []
enter_room_calls: list[int] = []


def hold(page, key, ms):
    page.keyboard.down(key)
    time.sleep(ms / 1000)
    page.keyboard.up(key)
    time.sleep(0.25)


def context_bar(page):
    return (page.locator(".context-bar").text_content() or "").strip()


def hud_location(page):
    loc = page.locator(".hud-scene span")
    return (loc.first.text_content() or "").strip() if loc.count() else ""


def dialogue_open(page):
    return page.locator("app-dialogue-panel .speaker-name").count() > 0


def close_dialogue(page):
    """Escape SOLO con diálogo abierto (sin diálogo, Escape = salida segura)."""
    for _ in range(4):
        if not dialogue_open(page):
            return
        page.keyboard.press("Escape")
        time.sleep(0.7)


def skip_typewriter(page):
    """Las opciones solo aparecen al completar el typewriter — Saltar lo adelanta."""
    for _ in range(3):
        btn = page.locator("app-dialogue-panel button", has_text="Saltar")
        if not btn.count():
            return
        btn.first.click()
        time.sleep(0.6)


def click_choice(page, text, label):
    skip_typewriter(page)
    btn = page.locator("app-dialogue-panel button", has_text=text)
    try:
        btn.first.wait_for(state="visible", timeout=6000)
    except Exception:
        failures.append(f"{label}: no se encontró la opción {text!r}")
        return False
    btn.first.click()
    time.sleep(1.0)
    return True


def proceed_evidence_if_gated(page):
    skip_typewriter(page)
    gate = page.locator("app-dialogue-panel button", has_text="Decidir con información incompleta")
    if gate.count():
        gate.first.click()
        time.sleep(1.0)


def open_marker(page, label_text, step):
    """Abre el diálogo de un marker vía la lista accesible sr-only (camino
    estable del producto — los walks de puertas ya prueban el mapa)."""
    btn = page.locator(
        "section[aria-label='Lista accesible de puntos interactivos'] button",
        has_text=label_text,
    )
    if not btn.count():
        failures.append(f"{step}: marker {label_text!r} no está en la sala actual")
        return False
    btn.first.dispatch_event("click")
    time.sleep(1.5)
    if not dialogue_open(page):
        failures.append(f"{step}: el diálogo de {label_text!r} no abrió")
        return False
    return True


def decide(page, marker_label, option_text, shot=None):
    """Con el diálogo del marker abierto: elige opción, pasa el gate de evidencia
    si aparece, espera el feedback de supervisión y lo cierra."""
    if not click_choice(page, option_text, marker_label):
        return
    proceed_evidence_if_gated(page)
    time.sleep(2.2)  # fade + chooseDecision + feedback (400ms) + render
    if shot and dialogue_open(page):
        page.screenshot(path=str(OUT / shot))
    close_dialogue(page)
    time.sleep(1.2)


def expect(cond, label):
    print(("OK  " if cond else "FAIL") + f" {label}")
    if not cond:
        failures.append(label)


def main() -> int:
    sys.stdout.reconfigure(encoding="utf-8")
    OUT.mkdir(parents=True, exist_ok=True)
    with sync_playwright() as pw:
        browser = pw.chromium.launch(headless=True)
        page = browser.new_page(viewport={"width": 1600, "height": 900})
        page.on("console", lambda m: console_errors.append(m.text) if m.type == "error" else None)
        page.on("response", lambda r: (
            not_found.append(r.url) if r.status == 404 else None,
            enter_room_calls.append(r.status) if "enter-room" in r.url else None,
        ))
        # Vite puede recargar la página en la PRIMERA visita tras (re)iniciar
        # ng serve (re-optimización de deps) — eso teletransporta al jugador.
        reloads: list[float] = []
        page.on("load", lambda: reloads.append(time.time()))

        # ── 1-2. login + abrir el caso ────────────────────────────────────────
        page.goto(f"{BASE}/login", wait_until="networkidle")
        page.fill('input[formControlName="email"]', EMAIL)
        page.fill('input[formControlName="password"]', PASSWORD)
        page.click('button[type="submit"]')
        page.wait_for_url("**/portal/**", timeout=20000)
        page.goto(f"{BASE}/portal/simulador/{CASE_VERSION}", wait_until="networkidle")
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

        # ── 3-4. sala inicial = hospital-urgencias ───────────────────────────
        expect("Urgencias" in hud_location(page), f"sala inicial Urgencias (HUD: {hud_location(page)!r})")
        page.screenshot(path=str(OUT / "01-hospital-urgencias.png"))

        # ── 5-7. mover + puerta con prompt propio ────────────────────────────
        hold(page, "s", 300)
        hold(page, "d", 2700)
        bar = context_bar(page)
        page.screenshot(path=str(OUT / "02-door-prompt.png"))
        expect("Sala de escucha" in bar, f"prompt de puerta (context bar: {bar!r})")

        # E sin hablar con la familia → bloqueada con aviso propio (no DialoguePanel)
        page.keyboard.press("e")
        time.sleep(1.2)
        locked = page.locator(".door-notice")
        expect(locked.count() > 0 and "contención" in (locked.text_content() or ""),
               "puerta bloqueada muestra door-notice con motivo")
        expect(not dialogue_open(page), "puerta bloqueada NO abre DialoguePanel")
        page.screenshot(path=str(OUT / "02b-door-locked.png"))
        time.sleep(3.5)  # deja expirar el aviso

        # ── familia en crisis (desbloquea la puerta) ──────────────────────────
        hold(page, "a", 4700)
        hold(page, "w", 500)
        page.keyboard.press("e")
        time.sleep(1.5)
        expect(dialogue_open(page), "diálogo de la familia en crisis abierto")
        page.screenshot(path=str(OUT / "02c-familia-crisis.png"))
        close_dialogue(page)

        # ── 8-9. cruzar a la sala de escucha ─────────────────────────────────
        hold(page, "s", 550)
        hold(page, "d", 4800)
        page.keyboard.press("e")
        time.sleep(4.0)
        expect("escucha" in hud_location(page).lower(),
               f"llegada a sala de escucha (HUD: {hud_location(page)!r})")
        page.screenshot(path=str(OUT / "03-hospital-sala-escucha.png"))

        # ── 10. volver a urgencias por la puerta de regreso ──────────────────
        bar = context_bar(page)
        expect("urgencias" in bar.lower(), f"prompt de puerta de regreso ({bar!r})")
        page.keyboard.press("e")
        time.sleep(4.0)
        expect("Urgencias" in hud_location(page), f"regreso a urgencias (HUD: {hud_location(page)!r})")
        page.screenshot(path=str(OUT / "04-door-return.png"))

        # volver a la sala de escucha para decidir (entrada 786,440 → puerta 838,440)
        hold(page, "d", 700)
        page.keyboard.press("e")
        time.sleep(4.0)

        # ── 11. decisiones del bloque hospital ───────────────────────────────
        # H1 — familia-duelo (168,408) caminando desde la entrada (160,452)
        hold(page, "w", 360)
        page.keyboard.press("e")
        time.sleep(1.5)
        expect(dialogue_open(page), "diálogo H1 (familia en duelo) abierto")
        decide(page, "H1", "Aplicar PAP", shot="07-decision-feedback.png")

        # H2/H3 vía lista accesible (el mapa ya quedó probado con los walks).
        if open_marker(page, "Marco normativo", "H2"):
            decide(page, "H2", "Ley 1257 de 2008")
        if open_marker(page, "Psicóloga hospitalaria", "H3"):
            decide(page, "H3", "evaluación psicosocial")

        # ── 12-13. salida institucional desbloqueada → comisaría ─────────────
        hold(page, "s", 220)
        hold(page, "d", 2700)
        bar = context_bar(page)
        expect("Comisaría" in bar or "Salida" in bar, f"prompt salida institucional ({bar!r})")
        page.keyboard.press("e")
        time.sleep(1.4)
        note = page.locator(".transition-note")
        expect(note.count() > 0 and "Quince días" in (note.text_content() or ""),
               "overlay de salto temporal 'Quince días después'")
        page.screenshot(path=str(OUT / "05-comisaria-recepcion.png"))
        time.sleep(4.0)
        expect("Recepción" in hud_location(page), f"llegada a recepción (HUD: {hud_location(page)!r})")

        # ── 18 (adelantado): refresh en sala intermedia → persistencia ───────
        page.reload(wait_until="networkidle")
        time.sleep(2.0)
        resume = page.get_by_text("Continuar intento en progreso")
        if resume.count():
            resume.first.click()
        time.sleep(5.0)
        page.locator("canvas").first.click(force=True)
        persisted = hud_location(page)
        expect("Recepción" in persisted, f"sala persistida tras refresh (HUD: {persisted!r})")
        page.screenshot(path=str(OUT / "05b-refresh-persistencia.png"))

        # ── expediente (740,312) desde entrada (160,452) ─────────────────────
        hold(page, "d", 4100)
        hold(page, "w", 900)
        page.keyboard.press("e")
        opened = False
        for _ in range(8):  # el primer POST tras el reload puede tardar
            time.sleep(0.5)
            if dialogue_open(page):
                opened = True
                break
        if not opened:
            page.keyboard.press("e")
            time.sleep(2.0)
            opened = dialogue_open(page)
        expect(opened, "expediente del caso abierto")
        close_dialogue(page)

        # ── 14. puerta al consultorio (838,440) ──────────────────────────────
        hold(page, "s", 880)
        hold(page, "d", 800)
        page.keyboard.press("e")
        time.sleep(4.0)
        expect("Consultorio" in hud_location(page), f"llegada al consultorio (HUD: {hud_location(page)!r})")
        page.screenshot(path=str(OUT / "06-comisaria-consultorio.png"))

        # ── 15. decisiones comisaría (vía lista accesible) ───────────────────
        if open_marker(page, "Sobreviviente", "C1"):
            decide(page, "C1", "Valorar riesgo")
        if open_marker(page, "Marco normativo", "C2"):
            decide(page, "C2", "Ley 2126")
        if open_marker(page, "Profesional psicosocial", "C3"):
            decide(page, "C3", "vulneración de derechos")

        # ── 16-17. cierre y final ────────────────────────────────────────────
        time.sleep(2.5)
        outcome = page.locator(".outcome")
        expect(outcome.count() > 0, "pantalla de cierre visible")
        ending = page.locator(".oc-ending__title")
        ending_text = (ending.text_content() or "").strip() if ending.count() else ""
        print(f"final mostrado: {ending_text!r}")
        expect("Integral" in ending_text, f"final integral alcanzado ({ending_text!r})")
        page.screenshot(path=str(OUT / "08-final.png"), full_page=True)

        # ── 09. mobile ───────────────────────────────────────────────────────
        page.set_viewport_size({"width": 390, "height": 844})
        time.sleep(1.2)
        page.screenshot(path=str(OUT / "09-mobile.png"))

        critical = [e for e in console_errors if "ERR_ABORTED" not in e]
        if critical:
            failures.append(f"errores de consola: {critical[:5]}")
        asset_404 = [u for u in not_found if "/assets/" in u]
        if asset_404:
            failures.append(f"404 de assets: {asset_404[:5]}")
        # 3 loads esperados: login → portal → reload de persistencia.
        if len(reloads) > 3:
            failures.append(f"recargas de página inesperadas: {len(reloads)} (¿re-optimización de Vite?)")
        browser.close()

    measurements = {
        "consoleErrors": [e for e in console_errors if "ERR_ABORTED" not in e],
        "assets404": [u for u in not_found if "/assets/" in u],
        "enterRoomResponses": enter_room_calls,
        "enterRoomAllOk": all(s == 200 for s in enter_room_calls) and bool(enter_room_calls),
        "failures": failures,
    }
    (OUT / "mediciones.json").write_text(json.dumps(measurements, indent=2, ensure_ascii=False), encoding="utf-8")

    print(f"\nenter-room: {enter_room_calls}")
    for f in failures:
        print(f"FAIL: {f}")
    print("RESULTADO:", "OK" if not failures else f"{len(failures)} fallos")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
