# Tarjeta Familia · Castilla y León — web independiente y accesible

Propuesta para que toda la información de la **Tarjeta Familia** (Bono Nacimiento) pase de PDF a web, con:

- **arquitectura de la información** separada para **familias** y para **comercios**;
- un **buscador de comercios colaboradores cercanos** (localidad, código postal o ubicación; lista accesible y mapa opcional), que sustituye al listado en PDF de 41 páginas;
- un **formulario web accesible** para darse de alta como comercio colaborador;
- criterios de **accesibilidad (WCAG 2.2 AA)** y **usabilidad**.

📄 **Documento de la propuesta:** [`docs/propuesta.md`](docs/propuesta.md) (también se ve como página en `propuesta.html`).

> **Web independiente y no oficial**, hecha por una familia usuaria de la Tarjeta Familia porque la información oficial de la Junta de Castilla y León está repartida en 7 PDF poco usables y no accesibles. Todo el contenido sale de los documentos públicos guardados en [`fuentes/`](fuentes/). ¿Ves un error? [Abre una incidencia](https://github.com/jamm87/tarjeta-familia-cyl/issues).

## Verlo

Abre `index.html` en el navegador. Funciona sin servidor. Para una experiencia más fiel, con la geolocalización del navegador:

```sh
python3 -m http.server 8080   # y abre http://localhost:8080
```

## Publicarlo en GitHub Pages

Es una web estática: no necesita servidor, base de datos ni compilación.

**Web publicada:** https://jamm87.github.io/tarjeta-familia-cyl/

GitHub Pages la publica directamente desde la rama `main` (**Settings → Pages → Source: Deploy from a branch**, rama `main`, carpeta `/ (root)`). Cada `git push` a `main` la actualiza en uno o dos minutos. Con el plan gratuito de GitHub, el repositorio tiene que ser público.

### Cómo se gestionan los datos

- **Los datos son ficheros JSON dentro del repositorio** (`data/`). El buscador los carga en el navegador y hace todos los cálculos allí (distancias, filtros), sin servidor. También hay una copia en `.js` para que funcione abriendo los HTML con doble clic.
- **Para actualizarlos**, se ejecutan los scripts (ver más abajo) con el PDF nuevo y se hace `git push`: GitHub Pages publica la versión nueva.
- **El mapa** usa Leaflet, que va incluido en `vendor/`, y las teselas públicas de OpenStreetMap, que pide el navegador de quien lo consulta. Es gratuito y no necesita clave. Para un uso oficial con mucho tráfico conviene usar el mapa base del IGN (servicio WMTS gratuito) o un proveedor de teselas propio, porque la política de uso de OpenStreetMap limita el tráfico intenso.
- **En una versión definitiva**, lo ideal es que la Junta mantenga el listado como datos (una hoja de cálculo o su portal de datos abiertos) y que un proceso automático (por ejemplo, GitHub Actions) regenere `data/` y la web cada vez que cambie.

## Estructura

| Carpeta / fichero | Contenido |
|---|---|
| `index.html`, `familias/`, `comercios/`, `buscar/`, `ayuda.html`… | Páginas generadas en español (no editar a mano) |
| `en/`, `ar/` | Páginas generadas en inglés y en árabe (de derecha a izquierda) |
| `src/config.json` | Repositorio y **correo para avisos de errores** (`correo_errores`; vacío hasta que exista: entonces solo se ofrece GitHub) |
| `src/plantilla.html` | Plantilla común: cabecera, navegación, selector de idioma y pie |
| `src/<idioma>/paginas/`, `src/<idioma>/parciales/` | Contenido de cada página en `es`, `en` y `ar` (mismas rutas en los tres idiomas) |
| `src/i18n/<idioma>.json` | Textos de la plantilla, de los scripts (con plurales) y nombres de categorías; se generan en `assets/i18n/` |
| `assets/img/guias/` | Capturas de MoneyToPay con los datos personales tapados |
| `assets/` | CSS, JavaScript (buscador, asistente, formulario, filtro de sectores) e imágenes |
| `assets/js/asistente.js` | Asistente de búsqueda sin servicios externos: entiende «pañales cerca de Villafranca» con un diccionario de productos (es, en, ar) y el índice de localidades |
| `vendor/inter/` | Tipografía Inter (licencia OFL), servida desde la propia web |
| `data/establecimientos.json` | 1.623 comercios con categoría y coordenadas (también en `.js` para usar sin servidor) |
| `data/localidades.json` | 2.289 localidades, los municipios y los 1.965 códigos postales de Castilla y León, para buscar |
| `data/sectores.json` | 116 sectores autorizados, agrupados |
| `data/incidencias-listado.json` | Problemas de calidad encontrados en el PDF oficial |
| `scripts/` | Extracción de los PDF, geocodificación y generación de páginas |
| `tests/probar.mjs` | Pruebas de accesibilidad (axe-core) y de funcionamiento |
| `vendor/leaflet/` | Librería del mapa, copiada de npm (sin CDN) |
| `fuentes/` | PDF originales |

## Actualizar los datos cuando salga un listado nuevo

Requisitos: Python 3 con `pdfplumber` y `markdown` (`pip install pdfplumber markdown`), Node 18 o superior y `pdftotext` (poppler-utils).

```sh
npm install
# 1. Guarda el PDF nuevo en fuentes/ con la fecha en el nombre y extráelo:
python3 scripts/extraer_establecimientos.py fuentes/establecimientos-colaboradores-AAAA-MM-DD.pdf
#    (comprueba los totales por provincia con el resumen de la última página del PDF)
# 2. Normaliza localidades y añade coordenadas:
node scripts/geocodificar.mjs                 # por localidad, sin conexión
node scripts/geocodificar.mjs --cartociudad   # por dirección, con CartoCiudad (IGN)
# 3. Regenera las páginas (cifras y fecha del listado):
python3 scripts/generar_paginas.py
# 4. Comprueba:
npm test
```

Para cambiar textos, edita `src/<idioma>/paginas/`, `src/i18n/<idioma>.json` o `docs/propuesta.md` y ejecuta `python3 scripts/generar_paginas.py`. Si cambias una página, cambia también sus versiones en los otros idiomas. Los nombres de los campos del formulario (`name`, `data-seccion` y el `value` de los sectores) se quedan en español en los tres idiomas, porque el correo a la Junta se envía siempre en español.

### Coordenadas

Cada comercio se sitúa con la mejor fuente disponible, por este orden (el campo `precision` de `data/establecimientos.json` indica cuál):

1. `direccion`: su dirección, geocodificada con CartoCiudad (IGN);
2. `localidad`: el punto de su localidad o pedanía (GeoNames o CartoCiudad);
3. `municipio`: el centro de su municipio (IGN);
4. `codigo-postal`: el municipio de su código postal, según la relación oficial del CNIG (`fuentes/codigos-postales-municipios-cnig.csv`).

Las aldeas y pedanías del nomenclátor del INE sin punto propio se sitúan en su municipio.

El modo `--cartociudad` sitúa cada comercio en su dirección y cada aldea en su sitio con el servicio oficial del IGN, y guarda una caché en `data/cache-cartociudad.json` para no repetir consultas. Lo ejecuta el flujo de GitHub Actions `.github/workflows/coordenadas.yml` («Actualizar coordenadas»), en los servidores de GitHub. Se lanza solo al cambiar el script o las fuentes, o a mano desde la pestaña **Actions → Actualizar coordenadas → Run workflow**. Guarda los datos en `main` y pide a Pages que publique.

## Pruebas

`npm test` levanta un servidor local y, con Chromium (Playwright):

- pasa **axe-core** (WCAG 2.0, 2.1 y 2.2, niveles A y AA) en las 19 vistas, a **320 px** y a **1280 px**;
- comprueba que no hay **desplazamiento horizontal a 320 px**;
- prueba el **teclado** («Saltar al contenido»), el **buscador** (CP, sugerencias con flechas, filtros, orden por distancia, «Mostrar más», mapa y geolocalización simulada), el **formulario** (errores, foco, DNI, CIF, CP frente a provincia y correo generado) y el **filtro de sectores**.

`CAPTURAS=1 npm test` guarda además capturas en `tests/capturas/`.

Las pruebas automáticas no sustituyen a una auditoría manual ni a pruebas con usuarios y lectores de pantalla.

## Sistema visual

Basado en un lenguaje tipo «documento» (lienzo de papel cálido, tipografía Inter, tarjetas con
borde fino y sombras muy suaves) con los colores de Castilla y León: el rojo como único acento
para acciones y enlaces, el morado leonés oscuro solo en la banda de la portada y el oro como
detalle decorativo. Las variables están al principio de `assets/css/estilos.css`, con sus
contrastes comprobados (WCAG 2.2 AA).

## Pendiente

- **Correo para avisos de errores**: cuando exista, ponerlo en `src/config.json`
  (`"correo_errores": "…"`) y ejecutar `python3 scripts/generar_paginas.py`. Aparecerá un botón
  «Escríbenos un correo» en todas las páginas y los avisos de cada comercio irán a ese correo.
