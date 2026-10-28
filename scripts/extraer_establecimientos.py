"""Convierte el PDF oficial de establecimientos colaboradores en data/establecimientos-base.json.

Uso:
    python3 scripts/extraer_establecimientos.py fuentes/establecimientos-colaboradores-AAAA-MM-DD.pdf

El PDF trae una tabla por página (Localidad | Nombre | Dirección | CP). La provincia
aparece como título suelto encima de la tabla cuando empieza una nueva; la última
página es un resumen con el número de establecimientos por provincia, que se usa
para comprobar que no se pierde ninguna fila.
"""
import json
import re
import sys
import unicodedata
from pathlib import Path

import pdfplumber

PROVINCIAS = {
    "AVILA": "Ávila", "BURGOS": "Burgos", "LEON": "León", "PALENCIA": "Palencia",
    "SALAMANCA": "Salamanca", "SEGOVIA": "Segovia", "SORIA": "Soria",
    "VALLADOLID": "Valladolid", "ZAMORA": "Zamora",
}

# Reglas para clasificar por el nombre. El orden importa: la primera que encaja gana.
CATEGORIAS = [
    ("farmacia", "Farmacia y parafarmacia",
     r"FARMA|BOTICA|HERBOLARIO|PARAFARM|DIETETIC|ORTOPEDIA|ORTOPED|SANTIVERI|NATURA\b|KERALA"),
    ("optica", "Óptica y audición",
     r"OPTIC|ÓPTIC|VISION|VISIÓN|AUDI|GAFA|OCULAR"),
    ("supermercado", "Supermercado y alimentación",
     r"SUPERMERCAD|SUPER |SÚPER|HIPER|CARREFOUR|MERCADONA|LIDL|ALDI|EROSKI|GADIS|LUPA|"
     r"FROIZ|\bDIA\b|ALCAMPO|AHORRAM|AUTOSERVICIO|ALIMENTA|E\.LECLERC|LECLERC|HERMOSILLA|"
     r"CONSUM|SPAR|COVIRAN|COVIRÁN|UVESCO|BM |CARNICER|FRUTER|PANADER|ULTRAMARINOS|"
     r"MARKET|GOURMET|EMBUTIDO|PESCADER|CONGELADO|IBERICO|TERNERA|GRANEL|SABOR|CHOCOLAT|"
     r"ECONOMICA|ECOTIENDA|CARNES|LACTEO|QUESER|HUERTA|GRANERO|ALIMENTOS"),
    ("drogueria", "Droguería y perfumería",
     r"CLAREL|PERFUM|DROGUER|DOGUER|COSMETIC"),
    ("salud", "Salud y bienestar",
     r"CLINIC|CLÍNIC|FISIO|DENTAL|DENTIST|ODONTO|PODOLOG|PSICOLOG|LOGOPED|MEDIC|PEDIATR|"
     r"SALUD|DIETISTA|NUTRICI|OSTEOP|HOSPITAL|SANITARI|ENFERMER|QUIROPRACT|SALT ?ROOM|"
     r"LACTANCIA|CENTRO MENS|EQILIBRIO|EQUILIBRIO"),
    ("calzado", "Calzado",
     r"ZAPAT|CALZAD|SHOES|PIES|PIECITOS|PISANDO"),
    ("juguetes", "Juguetes, papelería y libros",
     r"JUGUET|JUGUE|TOYS|JUEGO|LIBRER|LIBRO|PAPEL|TOY|DIDACTIC|PEQUEINGENIO|FOTOCOPIA|"
     r"IMPRENTA|CODIGO 100|COMETA|RECREO"),
    ("puericultura", "Puericultura y bebé",
     r"BEB[EÉ]|BABY|PUERICULT|PRENATAL|CHICCO|MAMA|MAMÁ|NANA|CUNA|BIBERON|PAÑAL|MATERN|"
     r"CANGURITO|AJUAR|CRIANDO"),
    ("ropa", "Ropa y moda infantil",
     r"MODA|ROPA|TEXTIL|KIDS|INFANTIL|NIÑ|CONFECCI|BOUTIQUE|KIABI|PRIMARK|ZARA|OKAIDI|"
     r"H&M|MANGO|C&A|DECATHLON|SPRINTER|DEPORTE|SPORT|LENCER|MERCER|BORDAD|TEJIDO|FABRIC|"
     r"LABORES|HILOS|PEKES|NANOS|MIMOS|KINGS|LITTLE|PETIT|SMALLS|CHARCOS|TEDDY|RABIETAS|"
     r"GALERIAS|ALMACENES|CORTE INGL|ATLEET|ROPITAS|BOBOLI|JUNIOR|BIKE"),
    ("hogar", "Hogar y descanso",
     r"MUEBLE|MOBLE|COLCHON|DECORACI|SOFA|LAMPARA|BEDS|YOUR BED|MI CASA|AGUAS|SUEÑOS|"
     r"MOBILIARIO|TAPICER|HOME|HOGAR|DECOR|BRICO|DESCANSO|CASA BELLA|DICASA"),
]
OTROS = ("otros", "Otros comercios")


def normaliza(texto):
    texto = unicodedata.normalize("NFD", texto.upper())
    return "".join(c for c in texto if unicodedata.category(c) != "Mn")


def limpia(texto):
    return re.sub(r"\s+", " ", (texto or "").replace("\n", " ")).strip()


def titulo(texto):
    """'ARENAS DE SAN PEDRO' -> 'Arenas de San Pedro'."""
    menores = {"de", "del", "la", "las", "el", "los", "y", "e", "en"}
    palabras = limpia(texto).lower().split(" ")
    salida = []
    for i, p in enumerate(palabras):
        if i > 0 and p in menores:
            salida.append(p)
        else:
            salida.append("-".join(s[:1].upper() + s[1:] for s in p.split("-")))
    return " ".join(salida)


def categoriza(nombre):
    n = normaliza(nombre) + " "
    for clave, etiqueta, patron in CATEGORIAS:
        if re.search(normaliza(patron), n):
            return clave, etiqueta
    return OTROS


def tramos(caracteres):
    """Agrupa caracteres (en el orden del PDF) en tramos de texto continuo.

    En el PDF, el texto de una celda que no cabe se sale por la derecha y se
    superpone a la celda siguiente ("VILLARES DE LA REINA" sobre "SUPERMERCADOS").
    Cada celda se escribe de una vez, así que un retroceso en x o un salto grande
    marca el comienzo de la celda siguiente.
    """
    grupos, actual, fin = [], [], None
    for c in caracteres:
        if actual and (c["x0"] < fin - 1 or c["x0"] - fin > 12):
            grupos.append(actual)
            actual = []
        actual.append(c)
        fin = c["x1"]
    if actual:
        grupos.append(actual)
    return [(g[0]["x0"], g[-1]["x1"], limpia("".join(c["text"] for c in g))) for g in grupos]


def lee_filas(pagina, tabla):
    """Devuelve [localidad, nombre, dirección, cp] por cada fila de la tabla.

    Normalmente vale el texto de cada celda. Pero cuando un texto no cabe en su
    celda, se sale por la derecha y se solapa con la celda siguiente: las dos salen
    con letras cortadas o intercaladas ("APNLDAEZZA SAN MARCOS"). Se detecta porque
    el tramo de la celda siguiente empieza antes de que acabe el de la anterior, y
    en ese caso ambas celdas se toman de los tramos.
    """
    datos = tabla.extract()
    bordes = [celda[0] for celda in tabla.rows[0].cells if celda]
    salida = []
    for celdas, fila in zip(datos[1:], tabla.rows[1:]):
        celdas = [limpia(c) for c in celdas]
        if len(celdas) < 4:
            continue
        _, arriba, _, abajo = fila.bbox
        chars = [c for c in pagina.chars
                 if arriba <= (c["top"] + c["bottom"]) / 2 <= abajo and c["x0"] < tabla.bbox[2]]
        texto, inicio, fin = [""] * len(bordes), [None] * len(bordes), [0] * len(bordes)
        for x0, x1, t in tramos(chars):
            col = max([i for i, b in enumerate(bordes) if x0 >= b - 3] or [0])
            texto[col] = limpia(f"{texto[col]} {t}")
            inicio[col] = x0 if inicio[col] is None else min(inicio[col], x0)
            fin[col] = max(fin[col], x1)
        for i in range(len(bordes) - 1):
            if inicio[i + 1] is not None and fin[i] > bordes[i + 1] and inicio[i + 1] < fin[i] - 1:
                celdas[i], celdas[i + 1] = texto[i], texto[i + 1]
        # Celda sin bordes (pdfplumber la da vacía): caracteres que empiezan en su columna.
        for i, valor in enumerate(celdas[:len(bordes)]):
            if not valor:
                limite = bordes[i + 1] - 1 if i + 1 < len(bordes) else tabla.bbox[2]
                celdas[i] = limpia("".join(c["text"] for c in chars if bordes[i] - 3 <= c["x0"] < limite))
        salida.append(celdas)
    return salida


def extrae(ruta_pdf):
    filas, resumen, provincia = [], {}, None
    with pdfplumber.open(ruta_pdf) as pdf:
        for pagina in pdf.pages:
            # Título de provincia: única palabra de su línea y situada encima de la tabla
            # (así no se confunde con una dirección tipo "CTRA. SORIA").
            tablas = pagina.find_tables()
            inicio_tabla = tablas[0].bbox[1] if tablas else pagina.height
            lineas = {}
            for p in pagina.extract_words():
                lineas.setdefault(round(p["top"]), []).append(p)
            for top, linea in sorted(lineas.items()):
                clave = normaliza(linea[0]["text"])
                if len(linea) == 1 and clave in PROVINCIAS and top < inicio_tabla:
                    provincia = PROVINCIAS[clave]
            for tabla in tablas:
                cabecera = [limpia(c) for c in tabla.extract()[0]]
                if cabecera and normaliza(cabecera[0]) == "PROVINCIA":
                    for prov, num in tabla.extract()[1:]:
                        if prov and num and num.strip().isdigit():
                            resumen[PROVINCIAS.get(normaliza(limpia(prov)), limpia(prov))] = int(num)
                    continue
                for celdas in lee_filas(pagina, tabla):
                    if len(celdas) < 4:
                        continue
                    localidad, nombre, direccion, cp = celdas[:4]
                    if not nombre:
                        continue
                    # Si el nombre llena la celda, a veces arrastra la dirección pegada.
                    if direccion and nombre.endswith(direccion.split(" ", 1)[-1]) and len(nombre) > len(direccion):
                        corte = nombre.rfind(direccion.split(" ", 1)[0])
                        if corte > 0:
                            nombre = nombre[:corte].strip()
                    # Alguna fila trae el CP pegado al final de la dirección.
                    if not cp:
                        m = re.search(r"\s(\d{5})$", direccion)
                        if m:
                            direccion, cp = direccion[:m.start()].strip(), m.group(1)
                    cp = re.sub(r"\D", "", cp).zfill(5) if cp else ""
                    filas.append({
                        "provincia": provincia,
                        "localidad": titulo(localidad),
                        "nombre": limpia(nombre),
                        "direccion": limpia(direccion),
                        "cp": cp,
                    })
    return filas, resumen


def main():
    ruta = Path(sys.argv[1])
    filas, resumen = extrae(ruta)
    for i, f in enumerate(filas, 1):
        f["id"] = i
        f["categoria"], f["categoriaNombre"] = categoriza(f["nombre"])

    contados = {}
    for f in filas:
        contados[f["provincia"]] = contados.get(f["provincia"], 0) + 1
    print(f"{len(filas)} establecimientos extraídos")
    errores = 0
    for prov, esperado in resumen.items():
        marca = "OK" if contados.get(prov) == esperado else "DIFERENCIA"
        errores += marca != "OK"
        print(f"  {prov:<11} {contados.get(prov, 0):>4} (resumen del PDF: {esperado}) {marca}")

    fecha = re.search(r"(\d{4})-?(\d{2})-?(\d{2})", ruta.name)
    salida = {
        "fuente": ruta.name,
        "fechaListado": "-".join(fecha.groups()) if fecha else None,
        "total": len(filas),
        "establecimientos": [{k: f[k] for k in
                              ("id", "provincia", "localidad", "nombre", "direccion", "cp",
                               "categoria", "categoriaNombre")} for f in filas],
    }
    destino = Path(__file__).resolve().parent.parent / "data" / "establecimientos-base.json"
    destino.write_text(json.dumps(salida, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"Guardado en {destino}")
    if errores:
        # El resumen del PDF de 21/10/2026 no cuadra con su propio listado (ver docs/propuesta.md):
        # se avisa, pero no se detiene el proceso.
        print("AVISO: hay provincias que no coinciden con el resumen del PDF. Revísalas a mano.")


if __name__ == "__main__":
    main()
