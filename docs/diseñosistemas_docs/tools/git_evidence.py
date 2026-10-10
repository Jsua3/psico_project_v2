#!/usr/bin/env python3
"""Genera EVIDENCIA_GIT.md: ramas, pull requests e historial de la serie ADSI, desde Git y GitHub.

No inventa nada: cada cifra sale de `git` y de `gh pr list` en el momento de correrlo, y las
columnas de commit salen de la ficha de cada entrada de CAMBIOS_ADSI.md.

Uso (desde la raíz del repositorio):
    python docs/diseñosistemas_docs/tools/git_evidence.py [--tip adsi/a05c-editor-e2e]
"""
import argparse
import json
import re
import subprocess
import sys
from collections import Counter
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
DOCS = ROOT / "docs" / "diseñosistemas_docs"
REGISTRY = DOCS / "CAMBIOS_ADSI.md"
OUTPUT = DOCS / "EVIDENCIA_GIT.md"
BASE = "adsi/integracion"


def run(*args):
    return subprocess.run(args, cwd=ROOT, capture_output=True, text=True, encoding="utf-8", check=True).stdout


def registry_entries():
    """{ID: {"title", "branch", "commit"}} leído de las fichas de CAMBIOS_ADSI.md."""
    text = REGISTRY.read_text(encoding="utf-8")
    entries = {}
    for block in re.split(r"\n### ", text)[1:]:
        title = block.split("\n", 1)[0]
        match = re.match(r"([A-Z]-\d+[a-z]?)\s+·\s+(.+)", title)
        row = re.search(r"\| \*\*Rama / commit\*\* \| `([^`]+)` · `([0-9a-f]{7,})`", block)
        if match and row:
            entries[row.group(1)] = {"id": match.group(1), "title": match.group(2), "commit": row.group(2)}
    return entries


def pull_requests():
    raw = run("gh", "pr", "list", "--state", "all", "--limit", "100", "--json",
              "number,title,headRefName,baseRefName,state,isDraft,createdAt")
    return sorted((pr for pr in json.loads(raw) if pr["number"] >= 24), key=lambda pr: pr["number"])


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--tip", default="adsi/a05c-editor-e2e", help="rama punta de la pila")
    args = parser.parse_args()

    entries = registry_entries()
    prs = pull_requests()
    commits = run("git", "log", "--format=%H%x09%an%x09%ad%x09%s", "--date=short", f"{BASE}..{args.tip}").splitlines()
    authors = Counter(line.split("\t")[1] for line in commits)
    coauthored = int(run("git", "log", "--grep=Co-Authored-By: Claude", "--oneline", f"{BASE}..{args.tip}").count("\n"))
    first, last = commits[-1].split("\t"), commits[0].split("\t")

    out = []
    w = out.append
    w("# Evidencia de Git de la serie ADSI\n")
    w(f"Generado el {date.today().isoformat()} por `docs/diseñosistemas_docs/tools/git_evidence.py` "
      f"a partir de `git` y `gh pr list`. No se edita a mano: se vuelve a generar.\n")
    w("## Resumen\n")
    w(f"- **Ramas locales de la serie:** {len(run('git', 'for-each-ref', 'refs/heads/adsi', '--format=%(refname:short)').split())}.")
    to_base = [pr for pr in prs if pr["baseRefName"] == BASE]
    other = [f"#{pr['number']} → `{pr['baseRefName']}`" for pr in prs if pr["baseRefName"] != BASE]
    w(f"- **Pull requests hacia `{BASE}`** (desde el #24): {len(to_base)}"
      + (f", más {', '.join(other)} (borrador para el CI oficial)." if other else "."))
    w(f"- **Commits de la pila** (`{BASE}..{args.tip}`): {len(commits)}, entre {first[2]} y {last[2]}; "
      f"merges en el rango: {run('git', 'rev-list', '--merges', '--count', f'{BASE}..{args.tip}').strip()}.")
    w("- **Autores del rango:** " + ", ".join(f"{name}: {count}" for name, count in authors.most_common()) + ".")
    w(f"- **Commits con coautoría de Claude** (`Co-Authored-By`): {coauthored} de {len(commits)}.\n")
    w("> **Lo que esta evidencia no muestra:** los commits están a nombre de una sola persona (con dos "
      "nombres de configuración, `Jsua3` y `Juan José Sua`) y de Claude como coautor. El plan (§12, "
      "punto 3) pedía que los cuatro integrantes se vieran en el historial; eso depende de que cada "
      "dueño de rama revise, apruebe o commitee desde su cuenta, y **no está hecho**.\n")
    w("## Pila de ramas y pull requests\n")
    w("Cada rama parte de la anterior de la pila y su PR apunta a `adsi/integracion` (GitHub Flow, Unidad 7). "
      "Se fusionan en este orden, con *merge commit* (no *squash*), para que la historia conserve cada cambio.\n")
    w("| PR | Rama | Estado | Cambio | Commit del código |")
    w("|---|---|---|---|---|")
    for pr in prs:
        entry = entries.get(pr["headRefName"], {})
        change = f"{entry.get('id', '—')} · {entry.get('title', pr['title'])}" if entry else pr["title"]
        state = pr["state"] + (" (borrador)" if pr["isDraft"] else "")
        base = "" if pr["baseRefName"] == BASE else f" → `{pr['baseRefName']}`"
        w(f"| [#{pr['number']}](https://github.com/Jsua3/psico_project_v2/pull/{pr['number']}) | "
          f"`{pr['headRefName']}`{base} | {state} | {change} | `{entry.get('commit', '—')}` |")
    w("\n## Cómo se reproduce\n")
    w("```bash")
    w("python docs/diseñosistemas_docs/tools/git_evidence.py")
    w(f"git log --format='%h %an %ad %s' --date=short {BASE}..{args.tip}")
    w("gh pr list --state all --limit 100 --json number,title,headRefName,baseRefName,state")
    w("```")
    OUTPUT.write_text("\n".join(out) + "\n", encoding="utf-8", newline="\n")
    print(f"escrito {OUTPUT.relative_to(ROOT)}: {len(prs)} PR, {len(commits)} commits")


if __name__ == "__main__":
    sys.exit(main())
