"""Captura de pantalla autenticada del simulador SIEP (Playwright).

Uso:
  python capture.py --route /portal/simulador/1 --out ../../docs/audit-mvp-game-2026-06-09/00-before.png
  python capture.py --route /portal/personaje --out shot.png --width 1366 --height 768
  python capture.py --route /portal/simulador/1 --out shot.png --actions resume,wait:3
Acciones soportadas (separadas por coma):
  resume        click "Continuar intento en progreso" si aparece
  new           click "Iniciar nuevo intento" si aparece
  wait:N        espera N segundos
  key:K         pulsa tecla K (p. ej. key:e, key:j, key:Escape)
  click:TEXT    click en el primer elemento con ese texto visible
Imprime al final los errores de consola y requests fallidos (404 etc.).
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


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--route", default="/portal/simulador/1")
    ap.add_argument("--out", required=True)
    ap.add_argument("--width", type=int, default=1600)
    ap.add_argument("--height", type=int, default=900)
    ap.add_argument("--actions", default="")
    ap.add_argument("--settle", type=float, default=4.0,
                    help="segundos de espera tras cargar la ruta")
    ap.add_argument("--headed", action="store_true")
    args = ap.parse_args()

    out = Path(args.out).resolve()
    out.parent.mkdir(parents=True, exist_ok=True)

    console_errors: list[str] = []
    failed_requests: list[str] = []

    with sync_playwright() as pw:
        browser = pw.chromium.launch(headless=not args.headed)
        page = browser.new_page(viewport={"width": args.width, "height": args.height})
        page.on("console", lambda m: console_errors.append(m.text) if m.type == "error" else None)
        page.on("requestfailed", lambda r: failed_requests.append(f"{r.url} ({r.failure})"))
        page.on("response", lambda r: failed_requests.append(f"{r.url} (HTTP {r.status})")
                if r.status >= 400 else None)

        page.goto(f"{BASE}/login", wait_until="networkidle")
        page.fill('input[formControlName="email"]', EMAIL)
        page.fill('input[formControlName="password"]', PASSWORD)
        page.click('button[type="submit"]')
        page.wait_for_url("**/portal/**", timeout=15000)

        page.goto(f"{BASE}{args.route}", wait_until="networkidle")
        time.sleep(args.settle)

        for action in [a.strip() for a in args.actions.split(",") if a.strip()]:
            if action == "resume":
                btn = page.get_by_text("Continuar intento en progreso")
                if btn.count():
                    btn.first.click()
                    time.sleep(3)
            elif action == "new":
                btn = page.get_by_text("Iniciar nuevo intento")
                if btn.count():
                    btn.first.click()
                    time.sleep(3)
            elif action.startswith("wait:"):
                time.sleep(float(action.split(":", 1)[1]))
            elif action == "focus-canvas":
                canvas = page.locator("canvas").first
                if canvas.count():
                    canvas.click(force=True)
                    time.sleep(0.4)
            elif action.startswith("hold:"):
                _, key, ms = action.split(":", 2)
                page.keyboard.down(key)
                time.sleep(float(ms) / 1000)
                page.keyboard.up(key)
                time.sleep(0.3)
            elif action.startswith("key:"):
                page.keyboard.press(action.split(":", 1)[1])
                time.sleep(0.6)
            elif action.startswith("click:"):
                target = page.get_by_text(action.split(":", 1)[1])
                if target.count():
                    target.first.click()
                    time.sleep(1)

        page.screenshot(path=str(out))
        browser.close()

    print(f"SCREENSHOT {out}")
    print(json.dumps({"console_errors": console_errors[:40],
                      "failed_requests": failed_requests[:40]},
                     ensure_ascii=False, indent=1))
    return 0


if __name__ == "__main__":
    sys.exit(main())
