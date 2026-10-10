"""Convierte los TSV volcados del Excel a Markdown. Uso: python -I tsv_to_md.py <dir_tsv> <dir_salida>"""
import sys
from pathlib import Path

SHEETS = [
    ("01_1_Requisitos_funcionales.tsv", "01-requisitos-funcionales.md", "Requisitos funcionales (RF-01 a RF-26)"),
    ("02_2_No_funcionales.tsv", "02-requisitos-no-funcionales.md", "Requisitos no funcionales (RNF-01 a RNF-08)"),
    ("03_3_Reglas_de_negocio.tsv", "03-reglas-de-negocio.md", "Reglas de negocio (RN-01 a RN-11)"),
    ("04_4_Casos_de_uso.tsv", "04-casos-de-uso.md", "Casos de uso (CU-01 a CU-15)"),
]


def esc(s: str) -> str:
    return s.replace("|", "\\|").replace(" ⏎ ", "<br>").strip()


def main(src: str, dst: str) -> None:
    out = Path(dst)
    out.mkdir(parents=True, exist_ok=True)
    for tsv, md, title in SHEETS:
        rows = []
        for line in (Path(src) / tsv).read_text(encoding="utf-8").splitlines():
            parts = line.split("\t")
            rows.append(parts[1:])  # la primera columna es el número de fila de la hoja
        sheet_title = rows[0][0] if rows and rows[0] else title
        header_idx = next(i for i, r in enumerate(rows) if r and r[0].strip() == "ID")
        header = rows[header_idx]
        width = len(header)
        body = rows[header_idx + 1 :]
        lines = [
            f"# {title}",
            "",
            f"> Fuente: hoja «{sheet_title}» de `RequisitosPN3.xlsx` (versión académica inicial, línea base unificada de la carrera). Texto fiel al Excel; si el Excel cambia, este archivo se regenera, no se edita a mano.",
            "",
            "| " + " | ".join(esc(h) for h in header) + " |",
            "|" + "|".join(["---"] * width) + "|",
        ]
        for r in body:
            cells = (r + [""] * width)[:width]
            lines.append("| " + " | ".join(esc(c) for c in cells) + " |")
        lines.append("")
        (out / md).write_text("\n".join(lines), encoding="utf-8")
        print(md, len(body), "filas")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
