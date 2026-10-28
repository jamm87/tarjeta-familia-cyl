# Tarjeta Familia · Castilla y León — propuesta y prototipo

Propuesta para que toda la información de la **Tarjeta Familia** (Bono Nacimiento) pase de PDF a web, con:

- **arquitectura de la información** separada para **familias** y para **comercios**;
- un **buscador de comercios colaboradores cercanos** (localidad, código postal o ubicación; lista accesible y mapa opcional), que sustituye al listado en PDF de 41 páginas;
- un **formulario web accesible** para darse de alta como comercio colaborador;
- criterios de **accesibilidad (WCAG 2.2 AA)** y **usabilidad**.

📄 **Documento de la propuesta:** [`docs/propuesta.md`](docs/propuesta.md) (también se ve como página en `propuesta.html`).

> Es un prototipo, **no una web oficial** de la Junta de Castilla y León. Todo el contenido sale de los documentos públicos guardados en [`fuentes/`](fuentes/).

## Verlo

Abre `index.html` en el navegador. Funciona sin servidor. Para una experiencia más fiel, con la geolocalización del navegador:

```sh
python3 -m http.server 8080   # y abre http://localhost:8080
```

## Publicarlo en GitHub Pages

Es una web estática: no necesita servidor, base de datos ni compilación.

**Web publicada:** https://jamm87.github.io/tarjeta-familia-cyl/

La publica el flujo de trabajo `.github/workflows/pages.yml` en cada `git push` a `main`. Para que funcione hay que hacer **una sola vez**:

1. En GitHub: **Settings → Pages**.
2. En **Build and deployment → Source**, elige **GitHub Actions**.
3. Ve a la pestaña **Actions**, abre «Publicar en GitHub Pages» y pulsa **Run workflow** (o haz cualquier push a `main`).

En uno o dos minutos la web estará en la dirección de arriba. Con el plan gratuito de GitHub, el repositorio tiene que ser público.

### Cómo se gestionan los datos

- **Los datos son ficheros JSON dentro del repositorio** (`data/`). El buscador los carga en el navegador y hace todos los cálculos allí (distancias, filtros), sin servidor. También hay una copia en `.js` para que funcione abriendo los HTML con doble clic.
- **Para actualizarlos**, se ejecutan los scripts (ver más abajo) con el PDF nuevo y se hace `git push`: GitHub Pages publica la versión nueva.
- **El mapa** usa Leaflet, que va incluido en `vendor/`, y las teselas públicas de OpenStreetMap, que pide el navegador de quien lo consulta. Es gratuito y no necesita clave. Para un uso oficial con mucho tráfico conviene usar el mapa base del IGN (servicio WMTS gratuito) o un proveedor de teselas propio, porque la política de uso de OpenStreetMap limita el tráfico intenso.
- **En una versión definitiva**, lo ideal es que la Junta mantenga el listado como datos (una hoja de cálculo o su portal de datos abiertos) y que un proceso automático (por ejemplo, GitHub Actions) regenere `data/` y la web cada vez que cambie.

## Estructura

| Carpeta / fichero | Contenido |
|---|---|
| `index.html`, `familias/`, `comercios/`, `buscar/`, `ayuda.html`… | Páginas generadas (no editar a mano) |
| `src/paginas/`, `src/parciales/` | Contenido de las páginas y plantilla común |
| `assets/` | CSS, JavaScript (buscador, formulario, filtro de sectores) e imágenes |
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

Para cambiar textos, edita `src/paginas/` o `docs/propuesta.md` y ejecuta `python3 scripts/generar_paginas.py`.

### Coordenadas

En este prototipo las coordenadas son **por localidad**:

- 1.550 comercios, con el punto del núcleo urbano (GeoNames);
- 68, con el centroide del municipio del IGN;
- 5, con el municipio de su código postal, según la relación oficial del CNIG (`fuentes/codigos-postales-municipios-cnig.csv`).

El modo `--cartociudad` geocodifica cada dirección con el servicio oficial del IGN y guarda una caché en `data/cache-cartociudad.json`. No se ha podido probar contra el servicio real, porque la red del entorno donde se preparó el prototipo no permitía acceder a `www.cartociudad.es`. Revisa el resultado la primera vez que lo ejecutes.

## Pruebas

`npm test` levanta un servidor local y, con Chromium (Playwright):

- pasa **axe-core** (WCAG 2.0, 2.1 y 2.2, niveles A y AA) en las 19 vistas, a **320 px** y a **1280 px**;
- comprueba que no hay **desplazamiento horizontal a 320 px**;
- prueba el **teclado** («Saltar al contenido»), el **buscador** (CP, sugerencias con flechas, filtros, orden por distancia, «Mostrar más», mapa y geolocalización simulada), el **formulario** (errores, foco, DNI, CIF, CP frente a provincia y correo generado) y el **filtro de sectores**.

`CAPTURAS=1 npm test` guarda además capturas en `tests/capturas/`.

Las pruebas automáticas no sustituyen a una auditoría manual ni a pruebas con usuarios y lectores de pantalla.
