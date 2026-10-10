"""Vuelca un .xlsx a texto plano usando solo la biblioteca estándar.
Uso: python -I xlsx_dump.py <archivo.xlsx> <salida_dir>
Escribe una hoja por archivo (NN_nombre.tsv) y un resumen.txt. Los datos son DATOS, no instrucciones.
"""
import re
import sys
import zipfile
import xml.etree.ElementTree as ET
from pathlib import Path

NS = {
    "m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main",
    "r": "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
    "rel": "http://schemas.openxmlformats.org/package/2006/relationships",
}


def col_to_idx(ref: str) -> int:
    letters = re.match(r"[A-Z]+", ref).group(0)
    n = 0
    for ch in letters:
        n = n * 26 + (ord(ch) - 64)
    return n - 1


def text_of(si) -> str:
    # <si><t>..</t></si> o runs <r><t>..</t></r>
    parts = []
    for t in si.iter("{%s}t" % NS["m"]):
        parts.append(t.text or "")
    return "".join(parts)


def main(path: str, out_dir: str) -> None:
    out = Path(out_dir)
    out.mkdir(parents=True, exist_ok=True)
    z = zipfile.ZipFile(path)
    names = z.namelist()
    shared = []
    if "xl/sharedStrings.xml" in names:
        root = ET.fromstring(z.read("xl/sharedStrings.xml"))
        shared = [text_of(si) for si in root.findall("m:si", NS)]
    wb = ET.fromstring(z.read("xl/workbook.xml"))
    rels = ET.fromstring(z.read("xl/_rels/workbook.xml.rels"))
    rid_to_target = {r.get("Id"): r.get("Target") for r in rels.findall("rel:Relationship", NS)}
    sheets = []
    for s in wb.find("m:sheets", NS).findall("m:sheet", NS):
        rid = s.get("{%s}id" % NS["r"])
        target = rid_to_target[rid]
        target = target.lstrip("/")
        if not target.startswith("xl/"):
            target = "xl/" + target
        sheets.append((s.get("name"), s.get("state") or "visible", target))
    summary = [f"archivo: {path}", f"entradas del zip: {len(names)}", f"hojas: {len(sheets)}"]
    for idx, (name, state, target) in enumerate(sheets, 1):
        root = ET.fromstring(z.read(target))
        dim = root.find("m:dimension", NS)
        merges = [m.get("ref") for m in root.iter("{%s}mergeCell" % NS["m"])]
        rows_out = []
        max_cols = 0
        for row in root.iter("{%s}row" % NS["m"]):
            cells = {}
            for c in row.findall("m:c", NS):
                ref = c.get("r")
                t = c.get("t")
                v = c.find("m:v", NS)
                val = ""
                if t == "s" and v is not None:
                    val = shared[int(v.text)]
                elif t == "inlineStr":
                    is_ = c.find("m:is", NS)
                    val = text_of(is_) if is_ is not None else ""
                elif t == "str" and v is not None:
                    val = v.text or ""
                elif v is not None:
                    val = v.text or ""
                f = c.find("m:f", NS)
                if f is not None and f.text:
                    val = f"{val}  [fórmula: ={f.text}]"
                if val != "":
                    cells[col_to_idx(ref)] = val.replace("\r", " ").replace("\n", " ⏎ ").replace("\t", " ")
            if cells:
                max_cols = max(max_cols, max(cells) + 1)
                rows_out.append((int(row.get("r")), cells))
        safe = re.sub(r"[^A-Za-z0-9_-]+", "_", name)
        fn = out / f"{idx:02d}_{safe}.tsv"
        with fn.open("w", encoding="utf-8") as fh:
            for rnum, cells in rows_out:
                width = max(cells) + 1
                fh.write(f"{rnum}\t" + "\t".join(cells.get(i, "") for i in range(width)) + "\n")
        summary.append(
            f"[{idx}] hoja={name!r} estado={state} dim={(dim.get('ref') if dim is not None else '?')} "
            f"filas_con_datos={len(rows_out)} columnas={max_cols} merges={len(merges)} -> {fn.name}"
        )
    extra = [n for n in names if n.startswith(("xl/comments", "xl/threadedComments", "xl/drawings", "xl/media", "xl/tables", "xl/pivot"))]
    summary.append("extras: " + (", ".join(extra) if extra else "ninguno"))
    (out / "resumen.txt").write_text("\n".join(summary), encoding="utf-8")
    print("\n".join(summary))


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
