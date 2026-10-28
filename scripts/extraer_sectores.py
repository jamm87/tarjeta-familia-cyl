"""Convierte el PDF de ramos/sectores autorizados en data/sectores.json.

Uso:
    python3 scripts/extraer_sectores.py fuentes/ramos-autorizados-AAAA-MM-DD.pdf

Cada línea del PDF es "CÓDIGO-ÁMBITO DESCRIPCIÓN" (p. ej. "5912-ES FARMACIAS").
ES = código de sector de la red de pagos española; IN = código internacional (MCC).
Se añade un grupo legible para que un comercio encuentre el suyo sin conocer códigos.
"""
import json
import re
import subprocess
import sys
import unicodedata
from pathlib import Path

GRUPOS = [
    ("alimentacion", "Supermercados y alimentación",
     r"SUPERMERC|HIPERMERC|ALIMENT|COMESTIBLES|ULTRAMARINOS|ECONOMATO|PANADER|LACTEO|"
     r"AHORRAMAS|ALCAMPO|ALDI|ALIMERKA|CONSUM|DIA|EROSKI|MERCADONA|LIDL|LECLERC|MAKRO|"
     r"CARREFOUR|CONDIS|FROIZ|GADISA|LUPA|UVESCO|SUPERMERCADOS|HIPERCOR"),
    ("salud", "Farmacia, salud y óptica",
     r"FARMAC|DROGUER|MEDIC|DENT|ORTODON|HOSPITAL|SANATORIO|LABORATORIO|OPTIC|OPTOMET|"
     r"OFTALM|ORTOPED|PROTESIS|PODOLOG|OSTEOP|HERBOLARIO|PARAFARM|DISPENSING|HEALTH|"
     r"OPTICIAN|OPTHAMOLOG|PHYSICIAN|GENERAL OPTICA|VISIONLAB|AUDITIV"),
    ("ropa", "Ropa, calzado y textil",
     r"CONFECCI|ROPA|TEXTIL|ZAPATER|CALZADO|MERCER|BORDADOS|TEJIDOS|C&A|CORTEFIEL|"
     r"DESIGUAL|ZARA|H& M|KIABI|MANGO|PRIMARK|PRENATAL"),
    ("juguetes", "Juguetes, libros, música y deporte",
     r"JUGUET|DEPORT|LIBR|DISCOS|REVISTAS|PERIODICOS|INSTRUMENTOS|PASATIEMPOS|TOYS|"
     r"DECATHLON|SPRINTER"),
    ("hogar", "Hogar, muebles y electrodomésticos",
     r"MUEBLE|ELECTRODOM|HOGAR|IKEA|LEROY|ANTIGUEDADES"),
    ("educacion", "Educación y cuidado infantil",
     r"COLEGIO|ESCUELA|ENSEÑANZA|ENSENANZA|EDUCATIV|CHILD CARE|CUIDADOS INFANTILES|SCHOOLS|"
     r"INSTITUTOS|ACADEMIAS|SECRETARIADO"),
    ("grandes", "Grandes almacenes y grandes superficies",
     r"GRAN ALMACEN|GRANDES|CORTE INGLES"),
]


def normaliza(texto):
    texto = unicodedata.normalize("NFD", texto.upper())
    return "".join(c for c in texto if unicodedata.category(c) != "Mn")


# Códigos que corresponden a una cadena concreta y no a un tipo de comercio.
CADENAS = {"5335", "5957", "5952", "5959", "5338", "5441", "5958", "5939", "5955", "5422"}
SIGLAS = {"C&a": "C&A", "H&": "H&M", "Dia": "DIA", "Ikea": "IKEA", "Aldi": "ALDI"}


def frase(codigo, texto):
    """'DROGUERíAS Y FARMACIAS' -> 'Droguerías y farmacias'; 'EL CORTE INGLéS' -> 'El Corte Inglés'."""
    t = re.sub(r"\s+", " ", texto.strip().lower())
    if codigo.startswith("1") or codigo in CADENAS:
        palabras = [p if p in {"y", "de", "r", "u"} else p[:1].upper() + p[1:] for p in t.split(" ")]
        t = " ".join(SIGLAS.get(p, p) for p in palabras)
        t = t.replace("H&M M", "H&M").replace("Toys r Us", "Toys \"R\" Us").replace("( ", "(")
    else:
        t = t[:1].upper() + t[1:]
        t = t.replace("(tna)", "(TNA)")
    # El PDF corta las descripciones a 50 caracteres.
    if len(texto.strip()) >= 50:
        t = t.rstrip(" ,") + "…"
    return t


def grupo(descripcion):
    n = normaliza(descripcion)
    for clave, nombre, patron in GRUPOS:
        if re.search(normaliza(patron), n):
            return clave
    return "otros"


def main():
    ruta = Path(sys.argv[1])
    texto = subprocess.run(["pdftotext", "-layout", str(ruta), "-"], capture_output=True,
                           text=True, check=True).stdout
    sectores = []
    for linea in texto.splitlines():
        m = re.match(r"\s*(\d{4})-(ES|IN)\s+(.+?)\s*$", linea)
        if m:
            codigo, ambito, descripcion = m.groups()
            sectores.append({
                "codigo": codigo,
                "ambito": ambito,
                "descripcion": frase(codigo, descripcion),
                "grupo": grupo(descripcion),
            })
    fecha = re.search(r"(\d{4})-?(\d{2})-?(\d{2})", ruta.name)
    grupos = [{"id": c, "nombre": n} for c, n, _ in GRUPOS] + [{"id": "otros", "nombre": "Otros"}]
    salida = {
        "fuente": ruta.name,
        "fecha": "-".join(fecha.groups()) if fecha else None,
        "total": len(sectores),
        "grupos": [g for g in grupos if any(s["grupo"] == g["id"] for s in sectores)],
        "sectores": sectores,
    }
    destino = Path(__file__).resolve().parent.parent / "data" / "sectores.json"
    destino.write_text(json.dumps(salida, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print(f"{len(sectores)} sectores guardados en {destino}")
    for g in salida["grupos"]:
        print(f"  {g['nombre']}: {sum(s['grupo'] == g['id'] for s in sectores)}")


if __name__ == "__main__":
    main()
