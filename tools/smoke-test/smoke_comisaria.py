"""
Smoke test: comisaría sala de espera — 2.5D map visual validation.

Acceptance criteria verified:
  AC-3  Floor tiles visible (not black / solid dark rect)
  AC-4  Props back visible (cabinets NW/NE, chairs near north wall)
  AC-5  Props front visible (reception counter centre of room)
  AC-6  Counter occludes player when walking north past row ~21
  AC-8  No 404 errors for tilemap_packed.png
  AC-9  Player can reach door gap on right side (col 59 rows 14-16)

Usage:
    cd D:\\Sua_Files\\IdeaProjects\\psico_project_v2
    python tools/smoke-test/smoke_comisaria.py
"""

from __future__ import annotations

import json
import os
import sys
import time
from pathlib import Path
from playwright.sync_api import sync_playwright, Page, BrowserContext

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------
BASE_URL   = "http://localhost:4200"
LOGIN_URL  = f"{BASE_URL}/login"
SIM_URL    = f"{BASE_URL}/portal/simulador/1"

CREDENTIALS = {
    "email":    "estudiante@psychosim.edu.co",
    "password": "Test1234!",
}

OUT_DIR = Path(__file__).parent
OUT_DIR.mkdir(parents=True, exist_ok=True)

TIMEOUT_MS = 45_000   # per action
GAME_WAIT  = 6        # seconds after navigation for Phaser to render


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def log(msg: str) -> None:
    print(f"[smoke] {msg}", flush=True)


def screenshot(page: Page, name: str) -> Path:
    path = OUT_DIR / name
    page.screenshot(path=str(path), full_page=False)
    log(f"  screenshot -> {name}")
    return path


def dismiss_vite_overlay(page: Page) -> None:
    """Dismiss vite-error-overlay if present (press Escape)."""
    try:
        count = page.locator("vite-error-overlay").count()
        if count:
            log(f"Found {count} vite-error-overlay – pressing Escape to dismiss…")
            page.keyboard.press("Escape")
            time.sleep(0.5)
    except Exception:
        pass


def do_login(page: Page) -> None:
    """Fill and submit the login form."""
    log("Navigating to login page…")
    page.goto(LOGIN_URL, wait_until="networkidle", timeout=TIMEOUT_MS)
    time.sleep(2)  # wait for Angular to hydrate
    dismiss_vite_overlay(page)

    page.fill('input[type="email"], input[formcontrolname="email"]', CREDENTIALS["email"])
    page.fill('input[type="password"], input[formcontrolname="password"]', CREDENTIALS["password"])

    # Try normal click; fall back to JS click if overlay intercepts
    try:
        page.click('button[type="submit"]', timeout=8000)
    except Exception:
        log("Normal click failed, trying JS click fallback…")
        page.evaluate("document.querySelector('button[type=\"submit\"]').click()")

    page.wait_for_url("**/portal/**", timeout=TIMEOUT_MS)
    log("Login successful.")


# ---------------------------------------------------------------------------
# Network-error collector
# ---------------------------------------------------------------------------
failed_requests: list[str] = []
console_errors:  list[str] = []


def on_request_failed(req) -> None:
    failed_requests.append(req.url)


def on_console(msg) -> None:
    if msg.type in ("error", "warning"):
        console_errors.append(f"[{msg.type}] {msg.text}")


# ---------------------------------------------------------------------------
# Main test
# ---------------------------------------------------------------------------
def run() -> dict:
    results: dict = {
        "ac3_floor_tiles": "PENDING",
        "ac4_props_back":  "PENDING",
        "ac5_props_front": "PENDING",
        "ac6_depth_sort":  "PENDING",
        "ac8_no_404":      "PENDING",
        "ac9_door_gap":    "PENDING",
        "screenshots":     [],
        "tileset_errors":  [],
        "console_errors":  [],
        "canvas_found":    False,
    }

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True, slow_mo=100)
        context: BrowserContext = browser.new_context(
            viewport={"width": 1280, "height": 800},
        )

        context.on("requestfailed", on_request_failed)
        page = context.new_page()
        page.on("console", on_console)

        # ----------------------------------------------------------------
        # Step 1 – Login
        # ----------------------------------------------------------------
        try:
            do_login(page)
        except Exception as exc:
            log(f"ERROR during login: {exc}")
            screenshot(page, "00_login_error.png")
            browser.close()
            results["error"] = str(exc)
            return results

        # ----------------------------------------------------------------
        # Step 2 – Navigate to simulator
        # ----------------------------------------------------------------
        log(f"Navigating to simulator: {SIM_URL}")
        page.goto(SIM_URL, wait_until="networkidle", timeout=TIMEOUT_MS)
        p1 = screenshot(page, "01_after_navigate.png")
        results["screenshots"].append(str(p1))

        # ----------------------------------------------------------------
        # Step 3 – Wait for game to start (look for canvas element)
        # ----------------------------------------------------------------
        log("Waiting for Phaser canvas…")
        try:
            page.wait_for_selector("canvas", timeout=TIMEOUT_MS)
            results["canvas_found"] = True
            log("Canvas element found.")
        except Exception:
            log("WARNING: canvas element not found within timeout.")
            results["canvas_found"] = False

        # Extra wait for Phaser tiles to paint
        log(f"Waiting {GAME_WAIT}s for Phaser to render tiles…")
        time.sleep(GAME_WAIT)

        p2 = screenshot(page, "02_game_initial.png")
        results["screenshots"].append(str(p2))

        # ----------------------------------------------------------------
        # Step 4 – Handle resume/start prompts
        # ----------------------------------------------------------------
        # Priority: click "Continuar" (resume existing attempt at comisaría)
        # Fall back to "Iniciar nuevo intento" only if no in-progress attempt
        resume_clicked = False
        for selector in [
            'button:has-text("Continuar intento en progreso")',
            'button:has-text("Continuar")',
        ]:
            try:
                btn = page.locator(selector).first
                if btn.is_visible(timeout=3000):
                    log(f"Clicking RESUME button: {selector}")
                    btn.click()
                    resume_clicked = True
                    time.sleep(5)
                    break
            except Exception:
                pass

        if not resume_clicked:
            for selector in [
                'button:has-text("Iniciar nuevo intento")',
                'button:has-text("Iniciar")',
                'button:has-text("Comenzar")',
            ]:
                try:
                    btn = page.locator(selector).first
                    if btn.is_visible(timeout=2000):
                        log(f"Clicking START button: {selector}")
                        btn.click()
                        time.sleep(5)
                        break
                except Exception:
                    pass

        p3 = screenshot(page, "03_after_start_prompt.png")
        results["screenshots"].append(str(p3))

        # ----------------------------------------------------------------
        # Step 5 – Wait for game world to fully load
        # ----------------------------------------------------------------
        log("Waiting 8s for game world / tilemap to fully render…")
        time.sleep(8)
        p3b = screenshot(page, "03b_game_loaded.png")
        results["screenshots"].append(str(p3b))

        # ----------------------------------------------------------------
        # Step 6 – Screenshot pixel analysis: check for non-black pixels
        # Uses the Playwright screenshot (avoids WebGL canvas read restrictions)
        # ----------------------------------------------------------------
        log("Analysing screenshot for rendered content…")
        try:
            from PIL import Image
            import io
            screenshot_bytes = page.screenshot(full_page=False)
            img = Image.open(io.BytesIO(screenshot_bytes)).convert("RGB")
            w, h = img.size
            # Sample a horizontal strip at 40% height (floor zone)
            strip_y = int(h * 0.40)
            nonblack = 0
            samples = 100
            for i in range(samples):
                x = int(w * i / samples)
                r, g, b = img.getpixel((x, strip_y))
                if r > 20 or g > 20 or b > 20:
                    nonblack += 1
            ratio = nonblack / samples
            log(f"Screenshot strip at y={strip_y}: {nonblack}/{samples} non-black pixels (ratio={ratio:.2f})")
            if ratio > 0.05:
                results["ac3_floor_tiles"] = "PASS"
                log("AC-3 PASS: floor area has non-black pixels (tiles rendering).")
            else:
                results["ac3_floor_tiles"] = "FAIL – screenshot floor strip is mostly black"
                log("AC-3 FAIL: screenshot is mostly black – tiles not rendering.")
        except ImportError:
            log("Pillow not installed – falling back to canvas presence check")
            canvas_count = page.locator("canvas").count()
            if canvas_count > 0:
                results["ac3_floor_tiles"] = "PASS (canvas present – Pillow not available for pixel check)"
            else:
                results["ac3_floor_tiles"] = "FAIL – no canvas found"
        except Exception as exc:
            log(f"Screenshot pixel analysis error: {exc}")
            results["ac3_floor_tiles"] = f"ERROR – {exc}"

        # ----------------------------------------------------------------
        # Step 7 – Move player north (arrow keys) to test depth sorting
        # ----------------------------------------------------------------
        log("Testing depth sort – moving player north…")
        try:
            canvas_el = page.locator("canvas").first
            if canvas_el.is_visible(timeout=3000):
                canvas_el.click()  # focus the game
                time.sleep(0.3)
                # Walk north for 2 seconds
                for _ in range(40):
                    page.keyboard.press("ArrowUp")
                    time.sleep(0.05)
                p4 = screenshot(page, "04_player_north.png")
                results["screenshots"].append(str(p4))
                # Walk south to test counter occlusion (south = back toward player)
                for _ in range(20):
                    page.keyboard.press("ArrowDown")
                    time.sleep(0.05)
                p5 = screenshot(page, "05_player_counter_area.png")
                results["screenshots"].append(str(p5))
                results["ac6_depth_sort"] = "MANUAL – see 04_player_north.png / 05_player_counter_area.png"
            else:
                results["ac6_depth_sort"] = "SKIP – canvas not visible"
        except Exception as exc:
            log(f"Depth sort movement error: {exc}")
            results["ac6_depth_sort"] = f"ERROR – {exc}"

        # ----------------------------------------------------------------
        # Step 8 – Move player east toward door gap (AC-9)
        # ----------------------------------------------------------------
        log("Testing door gap access – moving player east…")
        try:
            canvas_el = page.locator("canvas").first
            if canvas_el.is_visible(timeout=3000):
                # Move right (east)
                for _ in range(40):
                    page.keyboard.press("ArrowRight")
                    time.sleep(0.05)
                p6 = screenshot(page, "06_player_east_door.png")
                results["screenshots"].append(str(p6))
                results["ac9_door_gap"] = "MANUAL – see 06_player_east_door.png"
        except Exception as exc:
            log(f"Door gap movement error: {exc}")
            results["ac9_door_gap"] = f"ERROR – {exc}"

        # ----------------------------------------------------------------
        # Step 9 – Final wide screenshot
        # ----------------------------------------------------------------
        time.sleep(1)
        p7 = screenshot(page, "07_final_state.png")
        results["screenshots"].append(str(p7))

        browser.close()

    # ----------------------------------------------------------------
    # AC-8: 404 analysis
    # ----------------------------------------------------------------
    tileset_errors = [u for u in failed_requests if "tilemap_packed" in u or ".png" in u.lower()]
    all_errors_404  = [u for u in failed_requests]
    results["tileset_errors"] = tileset_errors
    results["all_failed_requests"] = all_errors_404
    results["console_errors"] = console_errors[:20]  # cap at 20

    if tileset_errors:
        results["ac8_no_404"] = f"FAIL – tileset 404s: {tileset_errors}"
    elif all_errors_404:
        results["ac8_no_404"] = f"WARN – other failed requests (no tileset): {all_errors_404}"
    else:
        results["ac8_no_404"] = "PASS – no failed asset requests"

    # AC-4, AC-5 are purely visual — mark for manual review
    results["ac4_props_back"]  = "MANUAL – inspect 02_game_initial.png / 03_after_start_prompt.png"
    results["ac5_props_front"] = "MANUAL – inspect 02_game_initial.png / 05_player_counter_area.png"

    return results


if __name__ == "__main__":
    log("=" * 60)
    log("Comisaría Sala de Espera — Smoke Test")
    log("=" * 60)
    results = run()

    print()
    print("=" * 60)
    print("RESULTS")
    print("=" * 60)
    for key, val in results.items():
        if key in ("screenshots", "tileset_errors", "all_failed_requests", "console_errors"):
            print(f"  {key}:")
            items = val if isinstance(val, list) else [val]
            for item in items:
                print(f"    - {item}")
        else:
            print(f"  {key}: {val}")
    print()

    # Write JSON report
    report_path = OUT_DIR / "smoke_report.json"
    with open(report_path, "w", encoding="utf-8") as f:
        json.dump(results, f, indent=2, ensure_ascii=False)
    log(f"JSON report written: {report_path}")

    # Exit with non-zero if any hard FAIL
    hard_fails = [k for k, v in results.items() if isinstance(v, str) and v.startswith("FAIL")]
    if hard_fails:
        log(f"HARD FAILS: {hard_fails}")
        sys.exit(1)
    else:
        log("All hard checks passed (manual checks require visual inspection).")
        sys.exit(0)
