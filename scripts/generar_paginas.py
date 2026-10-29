"""Genera las páginas HTML estáticas en español, inglés y árabe.

Uso:
    python3 scripts/generar_paginas.py

Estructura:
    src/plantilla.html              plantilla común (cabecera, navegación, migas y pie)
    src/i18n/<idioma>.json          textos de la plantilla, de los scripts y de los datos
    src/<idioma>/paginas/**.html    contenido de cada página
    src/<idioma>/parciales/*.html   bloques reutilizables ({{contactos}}, {{sin_pin}})

El español se publica en la raíz; el inglés en en/ y el árabe en ar/. Cada página
empieza con un comentario JSON con sus metadatos:

    <!-- {"titulo": "…", "descripcion": "…", "seccion": "familias",
          "migas": [["Familias", "familias/index.html"]], "scripts": ["assets/js/buscador.js"]} -->

Marcadores:
    {{raiz}}      ruta relativa a la raíz del sitio (recursos compartidos: assets, data, fuentes)
    {{inicio}}    ruta relativa a la portada del idioma (páginas del mismo idioma)
    {{t:clave}}   texto del diccionario del idioma (sección "plantilla")
    {{contactos}}, {{sin_pin}}, {{sectores}}, {{gerencias}}, {{total_establecimientos}}, {{fecha_listado}},
    {{total_sectores}}, {{propuesta_md}}
"""
import hashlib
import html
import json
import re
from datetime import date
from urllib.parse import quote
from pathlib import Path

import markdown

RAIZ = Path(__file__).resolve().parent.parent
SRC = RAIZ / "src"
IDIOMAS = {
    "es": {"carpeta": "", "dir": "ltr", "nombre": "Español"},
    "en": {"carpeta": "en/", "dir": "ltr", "nombre": "English"},
    "ar": {"carpeta": "ar/", "dir": "rtl", "nombre": "العربية"},
}
SECCIONES = {"familias": "familias/index.html", "comercios": "comercios/index.html",
             "buscar": "buscar/index.html", "ayuda": "ayuda.html"}


def version(ruta):
    """Huella del contenido de un recurso, para que el navegador no use una copia antigua."""
    return hashlib.sha1((RAIZ / ruta).read_bytes()).hexdigest()[:8]


def con_version(texto):
    return re.sub(r'((?:href|src)="(?:\.\./)*((?:assets|data|vendor)/[^"?#]+\.(?:css|js)))"',
                  lambda m: f'{m.group(1)}?v={version(m.group(2))}"', texto)


def fecha_larga(iso, t):
    d = date.fromisoformat(iso)
    return t["formato_fecha"].format(dia=d.day, mes=t["meses"][d.month - 1], anio=d.year)


def bloque_sectores(datos, t):
    partes = []
    for g in datos["grupos"]:
        filas = [s for s in datos["sectores"] if s["grupo"] == g["id"]]
        nombre = t["grupos_sectores"].get(g["id"], g["nombre"])
        items = "\n".join(
            f'      <li data-texto="{html.escape(s["descripcion"].lower())} {s["codigo"]}">'
            f'<span lang="es">{html.escape(s["descripcion"])}</span> '
            f'<span class="codigo">({s["codigo"]}-{s["ambito"]})</span></li>'
            for s in filas)
        partes.append(
            f'  <section class="grupo-sectores" aria-labelledby="g-{g["id"]}" data-grupo>\n'
            f'    <h2 id="g-{g["id"]}">{html.escape(nombre)} '
            f'<span class="codigo">· {len(filas)}</span></h2>\n'
            f'    <ul class="lista-sectores">\n{items}\n    </ul>\n  </section>')
    return "\n".join(partes)


def bloque_gerencias(datos, idioma, t):
    """Oficinas de registro preferentes para el Bono Nacimiento, con enlace a Google Maps."""
    tp = t["plantilla"]
    items = []
    for g in datos["gerencias"]:
        mapa = "https://www.google.com/maps/search/?api=1&query=" + quote(g["mapa"])
        nota = f'\n        <p>{g["nota"][idioma]}</p>' if "nota" in g else ""
        tel = g["telefono"].replace(" ", "")
        items.append(
            f'      <li class="contacto">\n'
            f'        <h3>{html.escape(g["provincia"])}</h3>\n'
            f'        <p lang="es">{html.escape(g["direccion"])}<br>{g["cp"]} {html.escape(g["localidad"])}</p>{nota}\n'
            f'        <p>{tp["gerencia_telefono"]} <a href="tel:{tel}" dir="ltr">{g["telefono"]}</a></p>\n'
            f'        <p><a href="{mapa}">{tp["gerencia_mapa"]}'
            f'<span class="visualmente-oculto">: {html.escape(g["provincia"])}</span></a></p>\n'
            f'      </li>')
    return '<ul class="contactos">\n' + "\n".join(items) + "\n    </ul>"


def propuesta(t):
    texto = (RAIZ / "docs" / "propuesta.md").read_text(encoding="utf-8")
    cuerpo = markdown.markdown(texto, extensions=["tables", "fenced_code"])
    # Las tablas anchas se desplazan dentro de su caja, no la página entera.
    region = f'tabindex="0" role="region" aria-label="{t["plantilla"]["tabla_desplazable"]}"'
    cuerpo = cuerpo.replace("<table>", f'<div class="tabla-scroll" {region}><table>').replace("</table>", "</table></div>")
    return cuerpo.replace("<pre>", f'<pre {region}>')


def navegacion(seccion, inicio, t):
    items = []
    for clave, ruta in SECCIONES.items():
        actual = ' aria-current="true"' if clave == seccion else ""
        items.append(f'<li><a href="{inicio}{ruta}"{actual}>{t["plantilla"]["nav_" + clave]}</a></li>')
    return "\n          ".join(items)


def migas(lista, titulo, inicio, t):
    if lista is None:
        return ""
    items = [f'<li><a href="{inicio}index.html">{t["plantilla"]["inicio"]}</a></li>']
    items += [f'<li><a href="{inicio}{ruta}">{html.escape(texto)}</a></li>' for texto, ruta in lista]
    items.append(f'<li aria-current="page">{html.escape(titulo)}</li>')
    return (f'<nav class="migas contenedor" aria-label="{t["plantilla"]["migas"]}">\n      <ol>\n        '
            + "\n        ".join(items) + "\n      </ol>\n    </nav>")


def selector_idioma(idioma, relativa, raiz, disponibles):
    enlaces = []
    for codigo, datos in IDIOMAS.items():
        destino = relativa if relativa in disponibles[codigo] else "index.html"
        actual = ' aria-current="true"' if codigo == idioma else ""
        enlaces.append(f'<li><a href="{raiz}{datos["carpeta"]}{destino}" hreflang="{codigo}" lang="{codigo}"{actual}>'
                       f'{datos["nombre"]}</a></li>')
    return "\n            ".join(enlaces)


def alternativos(relativa, raiz, disponibles):
    return "\n  ".join(
        f'<link rel="alternate" hreflang="{codigo}" href="{raiz}{datos["carpeta"]}{relativa}">'
        for codigo, datos in IDIOMAS.items() if relativa in disponibles[codigo])


def escribe_textos_js(idioma, t):
    """Textos que usan los scripts del navegador: assets/i18n/<idioma>.js"""
    destino = RAIZ / "assets" / "i18n" / f"{idioma}.js"
    destino.parent.mkdir(parents=True, exist_ok=True)
    datos = {**t["js"], "categorias": t["categorias"], "locale": t["locale"]}
    destino.write_text(f"window.TF_TEXTOS = {json.dumps(datos, ensure_ascii=False)};\n", encoding="utf-8")


def main():
    plantilla = (SRC / "plantilla.html").read_text(encoding="utf-8")
    est = json.loads((RAIZ / "data" / "establecimientos.json").read_text(encoding="utf-8"))
    sectores = json.loads((RAIZ / "data" / "sectores.json").read_text(encoding="utf-8"))
    gerencias = json.loads((RAIZ / "data" / "gerencias.json").read_text(encoding="utf-8"))
    disponibles = {i: {p.relative_to(SRC / i / "paginas").as_posix() for p in (SRC / i / "paginas").rglob("*.html")}
                   for i in IDIOMAS}

    total = 0
    for idioma, conf in IDIOMAS.items():
        t = json.loads((SRC / "i18n" / f"{idioma}.json").read_text(encoding="utf-8"))
        escribe_textos_js(idioma, t)
        parciales = {p.stem: p.read_text(encoding="utf-8").strip() for p in (SRC / idioma / "parciales").glob("*.html")}
        sustituciones = {
            "{{contactos}}": parciales["contactos"],
            "{{sin_pin}}": parciales["sin-pin"],
            "{{sectores}}": bloque_sectores(sectores, t),
            "{{gerencias}}": bloque_gerencias(gerencias, idioma, t),
            "{{total_sectores}}": str(sectores["total"]),
            "{{total_establecimientos}}": format(est["total"], ",").replace(",", t["separador_miles"]),
            "{{fecha_listado}}": fecha_larga(est["fechaListado"], t),
        }
        if idioma == "es":
            sustituciones["{{propuesta_md}}"] = propuesta(t)

        for origen in sorted((SRC / idioma / "paginas").rglob("*.html")):
            texto = origen.read_text(encoding="utf-8")
            m = re.match(r"\s*<!--\s*(\{.*?\})\s*-->\s*", texto, re.S)
            meta = json.loads(m.group(1))
            cuerpo = texto[m.end():]
            relativa = origen.relative_to(SRC / idioma / "paginas").as_posix()
            inicio = "../" * relativa.count("/")
            raiz = "../" * (relativa.count("/") + conf["carpeta"].count("/"))

            for marcador, valor in sustituciones.items():
                cuerpo = cuerpo.replace(marcador, valor)
            scripts = meta.get("scripts", [])
            if scripts:
                scripts = [f"assets/i18n/{idioma}.js", "assets/js/i18n.js"] + scripts
            scripts = "\n  ".join(f'<script src="{{{{raiz}}}}{s}" defer></script>' for s in scripts)
            estilos = "\n  ".join(f'<link rel="stylesheet" href="{{{{raiz}}}}{c}">' for c in meta.get("css", []))
            titulo = meta["titulo"]
            pagina = (plantilla
                      .replace("{{titulo_completo}}", html.escape(
                          titulo if meta.get("portada") else f'{titulo} · {t["plantilla"]["sitio"]}'))
                      .replace("{{descripcion}}", html.escape(meta["descripcion"]))
                      .replace("{{lang}}", idioma)
                      .replace("{{dir}}", conf["dir"])
                      .replace("{{alternativos}}", alternativos(relativa, raiz, disponibles))
                      .replace("{{idiomas}}", selector_idioma(idioma, relativa, raiz, disponibles))
                      .replace("{{estilos}}", estilos)
                      .replace("{{scripts}}", scripts)
                      .replace("{{nav}}", navegacion(meta.get("seccion"), inicio, t))
                      .replace("{{migas}}", migas(meta.get("migas"), titulo, inicio, t))
                      .replace("{{contenido}}", cuerpo.strip()))
            pagina = re.sub(r"\{\{t:(\w+)\}\}", lambda x: t["plantilla"][x.group(1)], pagina)
            pagina = con_version(pagina.replace("{{inicio}}", inicio).replace("{{raiz}}", raiz))
            if "{{" in pagina:
                raise SystemExit(f"Marcador sin sustituir en {idioma}/{relativa}: "
                                 f"{re.search(r'{{[^}]*}}', pagina).group(0)}")
            destino = RAIZ / conf["carpeta"] / relativa
            destino.parent.mkdir(parents=True, exist_ok=True)
            destino.write_text(pagina, encoding="utf-8")
            total += 1
    print(f"{total} páginas generadas ({', '.join(IDIOMAS)})")


if __name__ == "__main__":
    main()
