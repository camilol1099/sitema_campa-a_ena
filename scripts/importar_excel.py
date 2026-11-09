"""
Importa el Excel de la campaña (hoja "BD") a Supabase: líderes y sus personas.

Uso (desde la raíz del proyecto):
    python scripts/importar_excel.py "data/BD Jesús Perpiñán.xlsx"            # solo revisa y escribe el informe
    python scripts/importar_excel.py "data/BD Jesús Perpiñán.xlsx" --subir    # además sube los datos

Reglas:
- Los valores se importan tal cual. Solo se limpian espacios sobrantes, la
  cédula queda en dígitos, "-" en puesto o mesa es vacío y se quitan
  caracteres invisibles del celular.
- Cada fila es una persona vinculada al líder de la columna "Lider".
- Líder vinculado a sí mismo (su nombre igual al de su líder, o un par de
  MISMO_LIDER): se toma solo como líder, con los datos de su fila; no se crea
  persona.
- Cédula repetida: la primera fila conserva la cédula; las siguientes quedan
  como personas sin cédula, con una observación para revisarlas.
- Todas las personas autorizaron el tratamiento de datos (Ley 1581).

El informe (data/informe_importacion.md) tiene datos personales: queda en
data/, que no se sube a git.

Para subir se inicia sesión como administradora (RLS). Credenciales:
IMPORT_EMAIL / IMPORT_PASSWORD, o TEST_ADMIN_EMAIL / TEST_ADMIN_PASSWORD de .env.test.
La URL y la clave pública salen de .env.local. Solo sube si la base está vacía.
"""

from __future__ import annotations

import argparse
import collections
import datetime as dt
import json
import os
import re
import sys
import unicodedata
import urllib.error
import urllib.request
import uuid
from pathlib import Path

import openpyxl

RAIZ = Path(__file__).resolve().parent.parent

# ---------------------------------------------------------------------------
# Configuración
# ---------------------------------------------------------------------------
HOJA = "BD"

# Columna del Excel (se compara sin tildes, mayúsculas ni espacios) → campo.
COLUMNAS = {
    "#": "excel_numero",
    "NOMBRE": "nombre",
    "CÉDULA": "cedula",
    "CELULAR": "celular",
    "DIRECCIÓN": "direccion",
    "BARRIO": "barrio",
    "Puesto de Votación": "puesto_votacion",
    "Mesa": "mesa",
    "Municipio": "municipio_verificacion",
    "Lider": "lider",
    "Coordinador": "coordinador",
}

# Valor del Excel → valor de la lista de verificación del sistema.
VERIFICACION = {
    "Valledupar": "Valledupar",
    "No vota en el municipio": "No vota en el municipio",
    "No se encuentra en el censo": "No está en el censo",
    "No está en el censo": "No está en el censo",
    "Errado": "Errado",
    "Cancelado": "Cancelado",
}

# Filas cuyo nombre no es idéntico al del líder pero son el mismo líder
# (confirmado por el desarrollador). Son nombres reales: se leen de
# data/mismo_lider.json (fuera de git), una lista de pares [nombre en la fila, líder].
_MISMO = RAIZ / "data" / "mismo_lider.json"
MISMO_LIDER = [tuple(par) for par in json.loads(_MISMO.read_text(encoding="utf-8"))] if _MISMO.exists() else []

# Barrios que Excel convirtió en fecha o número → nombre real
# (corrección aprobada por el desarrollador el 2026-11-05; se usa la forma
# que ya aparece en el Excel cuando existe).
BARRIO_CORREGIDO = {
    "1-may": "1 de Mayo",
    "7-ago": "7 de Agosto",
    "45127": "20 de Julio",      # 20-jul-2023
    "45211": "12 de octubre",    # 12-oct-2023
}

MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"]
INVISIBLES = re.compile(r"[​-‏‪-‮⁠﻿]")


# ---------------------------------------------------------------------------
# Utilidades
# ---------------------------------------------------------------------------
def clave(t) -> str:
    """Para comparar: sin tildes, minúsculas, espacios simples."""
    if t is None:
        return ""
    t = unicodedata.normalize("NFD", str(t))
    t = "".join(c for c in t if unicodedata.category(c) != "Mn")
    return re.sub(r"\s+", " ", t).strip().lower()


def limpiar(t) -> str | None:
    """Texto sin espacios sobrantes; vacío → None."""
    if t is None:
        return None
    if isinstance(t, float) and t.is_integer():
        t = int(t)
    t = INVISIBLES.sub("", str(t))
    t = re.sub(r"\s+", " ", t).strip()
    return t or None


def texto_celda(celda) -> str | None:
    """Lo que el Excel muestra. Las fechas (barrios que Excel convirtió) se
    escriben como se ven, p. ej. "1-may", y luego se corrigen con BARRIO_CORREGIDO."""
    v = celda.value
    if isinstance(v, dt.datetime):
        t = f"{v.day}-{MESES[v.month - 1]}"
    else:
        t = limpiar(v)
    return BARRIO_CORREGIDO.get(t, t)


def cedula(v) -> str | None:
    if v is None:
        return None
    if isinstance(v, float) and v.is_integer():
        v = int(v)
    d = re.sub(r"\D", "", str(v))
    return d or None


def guion_vacio(t: str | None) -> str | None:
    return None if t in (None, "-") else t


def mesa(v) -> tuple[int | None, str | None]:
    """(mesa, problema). "-" o vacío → None."""
    t = guion_vacio(limpiar(v))
    if t is None:
        return None, None
    if re.fullmatch(r"\d+", t) and int(t) > 0:
        return int(t), None
    return None, t


# ---------------------------------------------------------------------------
# Lectura
# ---------------------------------------------------------------------------
def leer(ruta: Path):
    wb = openpyxl.load_workbook(ruta, data_only=True)
    if HOJA not in wb.sheetnames:
        sys.exit(f'No existe la hoja "{HOJA}". Hojas: {wb.sheetnames}')
    ws = wb[HOJA]

    # Fila de encabezados: la primera que tenga "NOMBRE".
    encabezado = None
    for fila in ws.iter_rows(min_row=1, max_row=50):
        if any(clave(c.value) == "nombre" for c in fila):
            encabezado = fila
            break
    if encabezado is None:
        sys.exit("No encontré la fila de encabezados (columna NOMBRE).")

    por_clave = {clave(k): campo for k, campo in COLUMNAS.items()}
    indices = {}
    for c in encabezado:
        campo = por_clave.get(clave(c.value))
        if campo:
            indices[campo] = c.column - 1
    faltan = set(COLUMNAS.values()) - set(indices)
    if faltan:
        sys.exit(f"Faltan columnas en el Excel: {sorted(faltan)}")

    filas = []
    for fila in ws.iter_rows(min_row=encabezado[0].row + 1):
        if all(c.value is None for c in fila):
            continue
        d = {campo: fila[i] for campo, i in indices.items()}
        d["_fila"] = fila[0].row
        filas.append(d)
    return filas


# ---------------------------------------------------------------------------
# Transformación
# ---------------------------------------------------------------------------
def preparar(filas):
    avisos = collections.defaultdict(list)
    mismo = {(clave(a), clave(b)) for a, b in MISMO_LIDER}

    def datos(f):
        verif_raw = limpiar(f["municipio_verificacion"].value)
        verif = None
        if verif_raw is not None:
            if verif_raw not in VERIFICACION:
                sys.exit(f'Fila {f["_fila"]}: verificación desconocida "{verif_raw}". Agrégala a VERIFICACION.')
            verif = VERIFICACION[verif_raw]
        m, problema = mesa(f["mesa"].value)
        if problema:
            avisos["Mesa no numérica (queda vacía)"].append(f'fila {f["_fila"]}: "{problema}"')
        num = f["excel_numero"].value
        return {
            "nombre": limpiar(f["nombre"].value),
            "cedula": cedula(f["cedula"].value),
            "celular": limpiar(f["celular"].value),
            "direccion": limpiar(f["direccion"].value),
            "barrio": texto_celda(f["barrio"]),
            "puesto_votacion": guion_vacio(limpiar(f["puesto_votacion"].value)),
            "mesa": m,
            "municipio_verificacion": verif,
            "coordinador": limpiar(f["coordinador"].value),
            "excel_numero": int(num) if isinstance(num, (int, float)) else None,
            "_fila": f["_fila"],
            "_lider": limpiar(f["lider"].value),
        }

    registros = [datos(f) for f in filas]
    sin_nombre = [r["_fila"] for r in registros if not r["nombre"]]
    if sin_nombre:
        sys.exit(f"Filas sin nombre: {sin_nombre}")

    # Barrios que Excel convirtió en fecha o número.
    for f, r in zip(filas, registros):
        v = f["barrio"].value
        if v is not None and not isinstance(v, str):
            avisos["Barrio que Excel convirtió en fecha o número (corregido)"].append(
                f'fila {r["_fila"]}: {v!r} → "{r["barrio"]}" ({r["nombre"]})'
            )

    # Líderes: se unen los que solo cambian en tildes, mayúsculas o espacios.
    grafias = collections.defaultdict(collections.Counter)
    for r in registros:
        if r["_lider"]:
            grafias[clave(r["_lider"])][r["_lider"]] += 1
    lideres = {}
    for k, cont in grafias.items():
        # La más usada, pero prefiriendo la que no está toda en minúscula.
        nombre = min(cont, key=lambda g: (g == g.lower(), -cont[g]))
        lideres[k] = {"id": str(uuid.uuid4()), "tipo": "lider", "nombre": nombre}
        if len(cont) > 1:
            avisos["Líder escrito de varias formas (se unió en uno)"].append(
                " / ".join(f'"{g}" ({n})' for g, n in cont.items()) + f' → "{nombre}"'
            )

    # Líderes vinculados a sí mismos: su fila da los datos del líder.
    personas, propias = [], collections.defaultdict(list)
    for r in registros:
        kl = clave(r["_lider"])
        if kl and (clave(r["nombre"]) == kl or (clave(r["nombre"]), kl) in mismo):
            propias[kl].append(r)
        else:
            personas.append(r)
    for kl, rs in propias.items():
        if len(rs) > 1:
            sys.exit(f"El líder {lideres[kl]['nombre']} aparece {len(rs)} veces vinculado a sí mismo: revisar.")
        r = rs[0]
        lideres[kl].update(
            {c: r[c] for c in ("cedula", "celular", "direccion", "barrio", "puesto_votacion", "mesa",
                               "municipio_verificacion", "coordinador")}
        )
        avisos["Líder vinculado a sí mismo (queda solo como líder, con los datos de su fila)"].append(
            f'fila {r["_fila"]}: "{r["nombre"]}" → líder "{lideres[kl]["nombre"]}"'
        )
    for a, b in MISMO_LIDER:
        if clave(b) not in propias:
            avisos["Par de MISMO_LIDER que no se encontró"].append(f'"{a}" / "{b}"')

    ced_lider = collections.Counter(l.get("cedula") for l in lideres.values() if l.get("cedula"))
    for c, n in ced_lider.items():
        if n > 1:
            sys.exit(f"Dos líderes con la misma cédula {c}: revisar.")

    # Un líder no puede ser también persona (pedido del desarrollador, 2026-11-05):
    # la fila con la misma cédula o el mismo nombre de un líder no se crea como
    # persona. Sus datos completan los que le falten al líder.
    campos_lider = ("cedula", "celular", "direccion", "barrio", "puesto_votacion", "mesa",
                    "municipio_verificacion", "coordinador")
    ced_a_lider = {l["cedula"]: k for k, l in lideres.items() if l.get("cedula")}
    quedan = []
    for r in personas:
        kl = ced_a_lider.get(r["cedula"]) if r["cedula"] else None
        motivo = "misma cédula"
        if kl is None and clave(r["nombre"]) in lideres:
            kl, motivo = clave(r["nombre"]), "mismo nombre"
        if kl is None:
            quedan.append(r)
            continue
        l = lideres[kl]
        completados = [c for c in campos_lider if l.get(c) is None and r[c] is not None]
        if r["cedula"] and l.get("cedula") and r["cedula"] != l["cedula"]:
            avisos["Cédula distinta entre el líder y su fila como persona (se deja la del líder)"].append(
                f'líder "{l["nombre"]}" {l["cedula"]} / fila {r["_fila"]} {r["cedula"]}'
            )
        for c in completados:
            l[c] = r[c]
        if l.get("cedula") in ced_a_lider and ced_a_lider[l["cedula"]] != kl:
            sys.exit(f'Dos líderes con la cédula {l["cedula"]}: revisar.')
        if l.get("cedula"):
            ced_a_lider[l["cedula"]] = kl
        avisos["Líder que estaba como persona de otro líder (queda solo como líder)"].append(
            f'fila {r["_fila"]} "{r["nombre"]}" (en la lista de {r["_lider"] or "sin líder"}, {motivo})'
            f' → líder "{l["nombre"]}"' + (f'; se completó: {", ".join(completados)}' if completados else "")
        )
    personas = quedan

    # Cédulas repetidas entre personas.
    primera = {}
    for r in personas:
        c = r["cedula"]
        if not c:
            continue
        if c in primera:
            p = primera[c]
            r["observaciones"] = (
                f"Cédula {c} repetida en el Excel: también la tiene {p['nombre']} "
                f"(fila {p['_fila']}, líder {p['_lider'] or 'sin líder'}). Revisar."
            )
            r["cedula"] = None
            avisos["Cédula repetida (la segunda queda sin cédula y con observación)"].append(
                f'{c}: fila {p["_fila"]} "{p["nombre"]}" ({p["_lider"]}) / fila {r["_fila"]} "{r["nombre"]}" ({r["_lider"]})'
            )
        else:
            primera[c] = r

    for r in personas:
        if not r["_lider"]:
            avisos["Persona sin líder (queda sin vínculo)"].append(f'fila {r["_fila"]} "{r["nombre"]}"')

    # Filas de personas y vínculos.
    filas_personas, vinculos = [], []
    for r in personas:
        pid = str(uuid.uuid4())
        filas_personas.append(
            {
                "id": pid,
                "nombre": r["nombre"],
                "cedula": r["cedula"],
                "celular": r["celular"],
                "direccion": r["direccion"],
                "barrio": r["barrio"],
                "municipio_verificacion": r["municipio_verificacion"],
                "puesto_votacion": r["puesto_votacion"],
                "mesa": r["mesa"],
                "observaciones": r.get("observaciones"),
                "autorizacion_datos": True,
                "fecha_autorizacion": None,
                "origen": "excel_2025",
                "excel_numero": r["excel_numero"],
            }
        )
        if r["_lider"]:
            vinculos.append(
                {"persona_id": pid, "referente_id": lideres[clave(r["_lider"])]["id"], "coordinador": r["coordinador"]}
            )

    campos_ref = ("cedula", "celular", "direccion", "barrio", "puesto_votacion", "mesa",
                  "municipio_verificacion", "coordinador")
    referentes = [{**{c: None for c in campos_ref}, **l} for l in lideres.values()]

    # Listas: barrios y puestos tal como vienen (sin espacios sobrantes).
    barrios = sorted({x["barrio"] for x in referentes + filas_personas if x["barrio"]})
    puestos = sorted({x["puesto_votacion"] for x in referentes + filas_personas if x["puesto_votacion"]})
    for nombre, lista in (("Barrio", barrios), ("Puesto", puestos)):
        grupos = collections.defaultdict(list)
        for n in lista:
            grupos[clave(n)].append(n)
        for g in grupos.values():
            if len(g) > 1:
                avisos[f"{nombre} escrito de varias formas (quedan separados; unificar se consulta)"].append(" / ".join(g))
        for n in lista:
            if not 2 <= len(n) <= (80 if nombre == "Barrio" else 120):
                sys.exit(f'{nombre} con largo no permitido: "{n}"')

    return {
        "barrios": barrios,
        "puestos": puestos,
        "referentes": referentes,
        "personas": filas_personas,
        "vinculos": vinculos,
        "avisos": avisos,
        "total_filas": len(registros),
    }


def informe(d, ruta: Path):
    sin = lambda campo: sum(1 for p in d["personas"] if not p[campo])
    lineas = [
        "# Informe de importación del Excel",
        "",
        f"Generado: {dt.datetime.now():%Y-%m-%d %H:%M}. Contiene datos personales: no compartir ni subir a git.",
        "",
        "## Totales",
        f"- Filas leídas: {d['total_filas']}",
        f"- Líderes: {len(d['referentes'])}",
        f"- Personas: {len(d['personas'])}",
        f"- Vínculos persona → líder: {len(d['vinculos'])}",
        f"- Barrios en la lista: {len(d['barrios'])}",
        f"- Puestos de votación en la lista: {len(d['puestos'])}",
        f"- Personas sin cédula: {sin('cedula')} · sin celular: {sin('celular')} · sin dirección: {sin('direccion')}"
        f" · sin barrio: {sin('barrio')} · sin puesto: {sin('puesto_votacion')} · sin verificar: {sin('municipio_verificacion')}",
        "",
    ]
    for titulo, items in d["avisos"].items():
        lineas += [f"## {titulo} ({len(items)})", *[f"- {i}" for i in items], ""]
    ruta.write_text("\n".join(lineas), encoding="utf-8")


# ---------------------------------------------------------------------------
# Subida (PostgREST con la sesión de la administradora: RLS aplica)
# ---------------------------------------------------------------------------
def leer_env(archivo: Path) -> dict:
    env = {}
    if archivo.exists():
        for linea in archivo.read_text(encoding="utf-8").splitlines():
            if "=" in linea and not linea.lstrip().startswith("#"):
                k, v = linea.split("=", 1)
                env[k.strip()] = v.strip().strip('"').strip("'")
    return env


def pedir(metodo, url, cuerpo=None, cabeceras=None):
    datos = None if cuerpo is None else json.dumps(cuerpo).encode("utf-8")
    req = urllib.request.Request(url, data=datos, method=metodo, headers={"Content-Type": "application/json", **(cabeceras or {})})
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            txt = r.read().decode("utf-8")
            return r.status, (json.loads(txt) if txt else None), dict(r.headers)
    except urllib.error.HTTPError as e:
        sys.exit(f"Error {e.code} en {metodo} {url.split('?')[0]}: {e.read().decode('utf-8')}")


def subir(d):
    env = {**leer_env(RAIZ / ".env.test"), **leer_env(RAIZ / ".env.local"), **os.environ}
    url = env.get("NEXT_PUBLIC_SUPABASE_URL")
    key = env.get("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY") or env.get("NEXT_PUBLIC_SUPABASE_ANON_KEY")
    email = env.get("IMPORT_EMAIL") or env.get("TEST_ADMIN_EMAIL")
    clave_ = env.get("IMPORT_PASSWORD") or env.get("TEST_ADMIN_PASSWORD")
    if not all([url, key, email, clave_]):
        sys.exit("Faltan URL, clave pública o credenciales de la administradora.")

    _, sesion, _ = pedir("POST", f"{url}/auth/v1/token?grant_type=password", {"email": email, "password": clave_}, {"apikey": key})
    cab = {"apikey": key, "Authorization": f"Bearer {sesion['access_token']}"}

    # Solo con la base vacía (para no duplicar).
    for tabla in ("referentes", "personas", "vinculos"):
        _, _, h = pedir("GET", f"{url}/rest/v1/{tabla}?select=id&limit=1", cabeceras={**cab, "Prefer": "count=exact"})
        total = int(h.get("Content-Range", "*/0").split("/")[-1] or 0)
        if total:
            sys.exit(f"La tabla {tabla} ya tiene {total} registros. Vacíala antes de importar.")

    def insertar(tabla, filas, conflicto=None, lote=500):
        pref = "return=minimal" + (",resolution=ignore-duplicates" if conflicto else "")
        q = f"?on_conflict={conflicto}" if conflicto else ""
        for i in range(0, len(filas), lote):
            pedir("POST", f"{url}/rest/v1/{tabla}{q}", filas[i : i + lote], {**cab, "Prefer": pref})
        print(f"  {tabla}: {len(filas)}")

    print("Subiendo...")
    insertar("municipios", [{"nombre": "Valledupar"}], "nombre")
    insertar("barrios", [{"nombre": n} for n in d["barrios"]], "nombre")
    insertar("puestos_votacion", [{"nombre": n} for n in d["puestos"]], "nombre")
    insertar("referentes", d["referentes"])
    insertar("personas", d["personas"])
    insertar("vinculos", d["vinculos"])
    pedir("POST", f"{url}/auth/v1/logout", cabeceras=cab)
    print("Listo.")


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    ap = argparse.ArgumentParser(description="Importa el Excel de la campaña a Supabase.")
    ap.add_argument("excel", type=Path)
    ap.add_argument("--subir", action="store_true", help="sube los datos (si no, solo revisa y escribe el informe)")
    ap.add_argument("--informe", type=Path, default=RAIZ / "data" / "informe_importacion.md")
    a = ap.parse_args()

    d = preparar(leer(a.excel))
    a.informe.parent.mkdir(exist_ok=True)
    informe(d, a.informe)
    print(f"Líderes: {len(d['referentes'])} · personas: {len(d['personas'])} · vínculos: {len(d['vinculos'])}")
    print(f"Informe: {a.informe}")
    if a.subir:
        subir(d)


if __name__ == "__main__":
    main()
