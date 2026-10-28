"""Genera las páginas HTML estáticas a partir de src/paginas/.

Uso:
    python3 scripts/generar_paginas.py

Cada fichero de src/paginas/ empieza con un comentario JSON con sus metadatos:

    <!-- {"titulo": "Activar tu tarjeta", "descripcion": "...", "seccion": "familias",
          "migas": [["Familias", "familias/"]], "scripts": ["assets/js/buscador.js"]} -->

y se envuelve en la plantilla común (cabecera, navegación, migas y pie). Las rutas
internas se escriben con el marcador {{raiz}}, que se sustituye por la ruta relativa
a la raíz ("" o "../"), así el sitio funciona abierto desde cualquier carpeta.

Otros marcadores: {{contactos}}, {{sectores}}, {{total_establecimientos}},
{{fecha_listado}}, {{total_sectores}} y {{propuesta_md}} (docs/propuesta.md en HTML).
"""
import html
import json
import re
from datetime import date
from pathlib import Path

import markdown

RAIZ = Path(__file__).resolve().parent.parent
SRC = RAIZ / "src" / "paginas"
PARCIALES = RAIZ / "src" / "parciales"

SECCIONES = [
    ("familias", "Familias", "familias/"),
    ("comercios", "Comercios", "comercios/"),
    ("buscar", "Dónde usarla", "buscar/"),
    ("ayuda", "Ayuda", "ayuda.html"),
]


def fecha_larga(iso):
    meses = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto",
             "septiembre", "octubre", "noviembre", "diciembre"]
    d = date.fromisoformat(iso)
    return f"{d.day} de {meses[d.month - 1]} de {d.year}"


def bloque_sectores(datos):
    partes = []
    for g in datos["grupos"]:
        filas = [s for s in datos["sectores"] if s["grupo"] == g["id"]]
        items = "\n".join(
            f'      <li data-texto="{html.escape(s["descripcion"].lower())} {s["codigo"]}">'
            f'{html.escape(s["descripcion"])} '
            f'<span class="codigo">({s["codigo"]}-{s["ambito"]})</span></li>'
            for s in filas)
        partes.append(
            f'  <section class="grupo-sectores" aria-labelledby="g-{g["id"]}" data-grupo>\n'
            f'    <h2 id="g-{g["id"]}">{html.escape(g["nombre"])} '
            f'<span class="codigo">· {len(filas)}</span></h2>\n'
            f'    <ul class="lista-sectores">\n{items}\n    </ul>\n  </section>')
    return "\n".join(partes)


def propuesta():
    texto = (RAIZ / "docs" / "propuesta.md").read_text(encoding="utf-8")
    cuerpo = markdown.markdown(texto, extensions=["tables", "fenced_code"])
    # Las tablas anchas se desplazan dentro de su caja, no la página entera.
    cuerpo = cuerpo.replace("<table>", '<div class="tabla-scroll" tabindex="0" role="region" aria-label="Tabla (se puede desplazar)"><table>')
    cuerpo = cuerpo.replace("</table>", "</table></div>")
    return cuerpo.replace("<pre>", '<pre tabindex="0" role="region" aria-label="Esquema (se puede desplazar)">')


def nav(seccion, raiz):
    items = []
    for clave, texto, ruta in SECCIONES:
        actual = ' aria-current="true"' if clave == seccion else ""
        items.append(f'<li><a href="{raiz}{ruta}"{actual}>{texto}</a></li>')
    return "\n          ".join(items)


def migas(lista, titulo, raiz):
    if lista is None:
        return ""
    items = [f'<li><a href="{raiz}index.html">Inicio</a></li>']
    items += [f'<li><a href="{raiz}{ruta}">{html.escape(texto)}</a></li>' for texto, ruta in lista]
    items.append(f'<li aria-current="page">{html.escape(titulo)}</li>')
    return ('<nav class="migas contenedor" aria-label="Estás aquí">\n      <ol>\n        '
            + "\n        ".join(items) + "\n      </ol>\n    </nav>")


def main():
    plantilla = (PARCIALES / "plantilla.html").read_text(encoding="utf-8")
    contactos = (PARCIALES / "contactos.html").read_text(encoding="utf-8")
    est = json.loads((RAIZ / "data" / "establecimientos.json").read_text(encoding="utf-8"))
    sectores = json.loads((RAIZ / "data" / "sectores.json").read_text(encoding="utf-8"))
    sustituciones = {
        "{{contactos}}": contactos,
        "{{sectores}}": bloque_sectores(sectores),
        "{{total_sectores}}": str(sectores["total"]),
        "{{total_establecimientos}}": f'{est["total"]:,}'.replace(",", "."),
        "{{fecha_listado}}": fecha_larga(est["fechaListado"]),
        "{{propuesta_md}}": propuesta(),
    }

    generadas = []
    for origen in sorted(SRC.rglob("*.html")):
        texto = origen.read_text(encoding="utf-8")
        m = re.match(r"\s*<!--\s*(\{.*?\})\s*-->\s*", texto, re.S)
        meta = json.loads(m.group(1))
        cuerpo = texto[m.end():]
        relativa = origen.relative_to(SRC)
        raiz = "../" * (len(relativa.parts) - 1)

        for marcador, valor in sustituciones.items():
            cuerpo = cuerpo.replace(marcador, valor)
        scripts = "\n  ".join(f'<script src="{{{{raiz}}}}{s}" defer></script>' for s in meta.get("scripts", []))
        estilos = "\n  ".join(f'<link rel="stylesheet" href="{{{{raiz}}}}{c}">' for c in meta.get("css", []))
        titulo = meta["titulo"]
        pagina = (plantilla
                  .replace("{{titulo_completo}}", html.escape(
                      titulo if meta.get("portada") else f"{titulo} · Tarjeta Familia Castilla y León"))
                  .replace("{{descripcion}}", html.escape(meta["descripcion"]))
                  .replace("{{estilos}}", estilos)
                  .replace("{{scripts}}", scripts)
                  .replace("{{nav}}", nav(meta.get("seccion"), raiz))
                  .replace("{{migas}}", migas(meta.get("migas"), titulo, raiz))
                  .replace("{{contenido}}", cuerpo.strip())
                  .replace("{{raiz}}", raiz))
        if "{{" in pagina:
            raise SystemExit(f"Marcador sin sustituir en {relativa}: "
                             f"{re.search(r'{{[^}]*}}', pagina).group(0)}")
        destino = RAIZ / relativa
        destino.parent.mkdir(parents=True, exist_ok=True)
        destino.write_text(pagina, encoding="utf-8")
        generadas.append(str(relativa))
    print(f"{len(generadas)} páginas generadas:", ", ".join(generadas))


if __name__ == "__main__":
    main()
