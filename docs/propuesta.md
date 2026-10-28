# Propuesta: la información de la Tarjeta Familia, en la web y no en PDF

**Para:** Consejería de Desregulación, Familia y Ayudas Sociales, Junta de Castilla y León
**Qué incluye:** diagnóstico, arquitectura de la información, diseño del buscador de comercios, criterios de accesibilidad y usabilidad, y un prototipo navegable con el contenido real.
**Fecha:** octubre de 2026

---

## 1. Resumen

La página actual de la Tarjeta Familia en jcyl.es explica qué es la tarjeta en unos pocos párrafos, pero **todo lo que una familia o un comercio necesita hacer está en 7 PDF**: activar la tarjeta, comprobar la activación, consultar el saldo, las condiciones de uso, los sectores autorizados, el formulario para comercios y el listado de 1.628 establecimientos en 41 páginas.

Proponemos:

1. **Volcar todo el contenido en páginas web**, organizadas por lo que cada persona quiere hacer y no por documentos.
2. **Dos itinerarios claros desde la portada**: «Tengo la Tarjeta Familia» (familias) y «Tengo un comercio» (establecimientos).
3. **Un buscador de comercios cercanos**, por localidad, código postal o ubicación, con lista accesible y mapa opcional. Sustituye al PDF de 41 páginas.
4. **Un formulario web accesible para que los comercios se den de alta**, en lugar del PDF que hay que abrir con Acrobat.
5. **Cumplir WCAG 2.2 AA**, obligatorio para el sector público (RD 1112/2018, norma EN 301 549).

El prototipo que acompaña a esta propuesta ya funciona con los datos reales del listado del 21 de octubre de 2026.

## 2. Diagnóstico de la página actual

| Problema | Por qué importa | Evidencia |
|---|---|---|
| La información está en PDF | En el móvil hay que descargar, ampliar y desplazarse. Los PDF no están etiquetados, así que los lectores de pantalla no los leen bien. | 7 PDF enlazados desde la página |
| Buscar un comercio cercano es inviable | Hay que recorrer 41 páginas ordenadas por provincia y localidad, sin buscador ni distancias. | Listado de 1.628 filas |
| El mensaje más útil está escondido | La tarjeta **también funciona en comercios no adheridos** de un sector autorizado, pero solo se dice en un párrafo del bloque para comercios. Muchas familias creen que solo pueden usarla en el listado. | Página actual, apartado «¿En qué tipo de establecimientos…?» |
| Las instrucciones clave están repartidas | Sin PIN (se pulsa la tecla verde), sin pago sin contacto, sin compras online, guardar los tiques 6 meses, avisar de un robo antes de 24 h… Cada dato está en un documento distinto. | Condiciones de uso y guías de MoneyToPay |
| Nombres confusos | Las guías de MoneyToPay hablan de «Tarjeta Regalo» y «Tarjeta Empresa». La familia no sabe si es su tarjeta. | Guías de registro y de saldo |
| El aviso «puede que desde el móvil no pueda completar toda la operativa» solo aparece al final de un PDF | Quien lo intenta desde el móvil se atasca sin saber por qué. | «Compruebe que ha vinculado…» |
| El formulario para comercios exige Acrobat | El PDF rellenable no se puede completar en el móvil ni en muchos navegadores, y hay que guardarlo y adjuntarlo a mano. | Aviso en la página actual |
| Los sectores están en códigos | «5912-ES», «8351-IN»… Un comerciante no sabe si su negocio está incluido. | PDF de ramos autorizados |

### Calidad de los datos del listado

Al convertir el listado a datos hemos encontrado estos problemas (detalle en `data/incidencias-listado.json`):

- **El resumen por provincias no cuadra con el listado.** La última página suma 1.644 establecimientos, pero el listado tiene 1.628 filas (Palencia 115 frente a 119; Salamanca 129 frente a 131; Segovia 78 frente a 80; Valladolid 478 frente a 486).
- **Duplicados.** Una farmacia de Villaverde de Íscar (Segovia) aparece en las secciones de Ávila, León, Salamanca y Valladolid. Hay dos supermercados repetidos en Zamora. Quedan 1.623 establecimientos únicos.
- **Localidades escritas de varias formas**: «Avila» y «Ávila», «Leon» y «León», «Bugos», «La Cistérnica», «Corrales del Viuno», «Villarcayo de M. C.v.»… Hemos normalizado 47 nombres con el nomenclátor del IGN.
- **Un código postal que no corresponde a su provincia** (un comercio de Segovia con CP 42005, que es de Soria).
- **Textos cortados por el ancho de la celda**: localidades, nombres y direcciones que no caben y se solapan con la columna siguiente.
- **Sin coordenadas ni categoría**: el listado no permite buscar por cercanía ni por tipo de comercio.

**Recomendación:** que el listado se mantenga como **datos** (una hoja de cálculo o base de datos con campos normalizados) y que el PDF, si se mantiene, se genere a partir de ellos. Se puede publicar además como **datos abiertos** en el portal de la Junta.

## 3. Quién usa la información y para qué

### Familias (beneficiarias del Bono Nacimiento)

Suelen consultar desde el **móvil**, con prisa y a menudo con un bebé en brazos. Sus tareas, por orden de frecuencia:

1. **¿Dónde puedo usarla cerca de mí?** Es la más frecuente y hoy la peor resuelta.
2. **Acabo de recibirla, ¿qué hago?** (activar).
3. **Estoy en la caja y no funciona / me pide el PIN.**
4. **¿Cuánto saldo me queda?**
5. **¿Qué puedo comprar?** ¿Y los tiques?
6. **La he perdido / me la han robado.**

### Comercios

Normalmente el titular o el personal de caja. Sus tareas:

1. **Una familia quiere pagar con la tarjeta: ¿puedo cobrarla?** (depende del sector del datáfono, no de estar adherido).
2. **¿Cómo se cobra?** (banda, tecla verde, firma).
3. **Quiero aparecer en el listado**: darse de alta como colaborador.

## 4. Arquitectura de la información

```
Inicio
├── Buscador destacado: «¿Dónde puedo usar mi tarjeta?» (localidad, CP o ubicación)
├── Lo esencial en 30 segundos (5 reglas de uso)
│
├── TENGO LA TARJETA FAMILIA (familias/)
│   ├── 1. Activa tu tarjeta ............ registro → vincular → comprobar (3 partes, 11 pasos)
│   ├── 2. Cómo pagar ................... en la caja paso a paso + resumen sí/no (imprimible)
│   ├── 3. Dónde usarla ................. → buscador
│   ├── Qué puedes comprar y dónde ...... productos, colaboradores frente a sector autorizado, tiques
│   ├── Consulta tu saldo ............... 3 opciones
│   ├── Pérdida, robo y otros problemas . robo (destacado) + desplegables por problema
│   ├── Qué es la Tarjeta Familia ....... Bono Nacimiento, emisor, aviso «Tarjeta Regalo/Empresa», datos
│   └── Preguntas frecuentes
│
├── TENGO UN COMERCIO (comercios/)
│   ├── ¿Puedo cobrar? .................. sí, si el datáfono está en un sector autorizado (en la portada de la sección)
│   ├── Sectores autorizados ............ 116 sectores agrupados en 7 grupos legibles, con buscador
│   ├── Guía para la caja ............... una página imprimible para tener junto al datáfono
│   └── Hazte colaborador ............... ventajas + formulario web accesible + distintivo
│
├── DÓNDE USARLA (buscar/) ............... buscador de comercios (lista + mapa opcional)
├── AYUDA ............................... tabla «si necesitas… contacta con…» + todos los contactos
└── Accesibilidad · Documentos originales
```

### Decisiones clave

- **Por tareas, no por documentos.** Cada página responde a una pregunta («¿Cómo pago?») y no reproduce un documento («Condiciones de uso»). El contenido de las condiciones se reparte entre «Qué es», «Cómo pagar», «Qué comprar» y «Problemas».
- **Los pasos de activación, en orden y numerados**, con lo que hay que tener a mano y el aviso «usa un ordenador» **antes** de empezar, no al final.
- **Un solo nombre: «Tarjeta Familia».** Se explica una vez que MoneyToPay la llama «Tarjeta Regalo» o «Tarjeta Empresa», justo donde aparece.
- **El mensaje «también en comercios no adheridos»** se repite donde hace falta: portada del buscador, «Qué comprar», preguntas frecuentes y sección de comercios.
- **Teléfonos según el problema.** Hay tres entidades (CaixaBank, MoneyToPay y la Consejería) y la familia no tiene por qué saber cuál le toca. La página de ayuda empieza por «si necesitas… contacta con…».
- **El robo, destacado.** Tiene un plazo legal (24 horas) y por eso va primero y resaltado en «Problemas».
- **Los PDF originales pasan a segundo plano**: se enlazan como referencia, nunca como única fuente.

## 5. El buscador de comercios

Es la pieza que más mejora la experiencia de las familias.

### Cómo funciona

1. **¿Dónde estás?** Hay tres formas, y todas dan el mismo resultado:
   - escribir la **localidad** (con sugerencias al teclear de las 2.285 localidades de Castilla y León, tengan o no comercios);
   - escribir el **código postal**;
   - pulsar **«Usar mi ubicación»**. Se pide permiso al navegador solo al pulsar, y la ubicación no se guarda ni se envía.
2. **Filtros**: tipo de comercio (11 categorías: farmacia, supermercado, ropa infantil, óptica…), distancia (5, 10, 25 o 50 km, o toda la comunidad) y nombre o calle.
3. **Resultados en lista, ordenados por distancia.** Cada comercio muestra el nombre, el tipo, la distancia, la dirección y «Cómo llegar». Se cargan de 20 en 20.
4. **Mapa opcional** («Lista y mapa»). Agrupa los comercios de cada localidad en un marcador con el número. Si no hay resultados, propone ampliar la distancia y recuerda que hay más comercios en los sectores autorizados.
5. **La búsqueda queda en la dirección de la página** (`?q=Arévalo&cat=farmacia`), así que se puede guardar o compartir.

### Por qué la lista va primero y el mapa es opcional

Un mapa no es accesible por sí solo con lector de pantalla y en el móvil ocupa toda la pantalla. La lista contiene **toda** la información y se anuncia («23 comercios de farmacia a menos de 10 km de Arévalo»). El mapa la complementa y no la sustituye.

### Datos y precisión

- El listado se convierte automáticamente del PDF a datos con `scripts/extraer_establecimientos.py`, que comprueba los totales por provincia.
- Cada comercio se clasifica por su nombre con reglas revisables. Así se hicieron las 11 categorías; 88 quedan como «Otros comercios».
- **Coordenadas**: en este prototipo son **por localidad**:
  - 1.550 comercios, con el punto del núcleo urbano (GeoNames);
  - 68, con el centroide del municipio del IGN (pedanías y núcleos pequeños);
  - 1, con el de su código postal;
  - 4 pedanías no se han podido situar con seguridad y no se han inventado.

  Por eso las distancias son aproximadas y en las ciudades todos los comercios aparecen «en esta localidad».
- **Siguiente paso**: geocodificar cada dirección con **CartoCiudad**, el geocodificador oficial y gratuito del IGN. El script `scripts/geocodificar.mjs --cartociudad` ya lo hace y guarda una caché. No se pudo ejecutar desde el entorno donde se preparó el prototipo porque su red no permitía acceder a ese servicio.

## 6. Formulario para comercios

Sustituye al PDF rellenable:

- **Los mismos campos que el PDF**, agrupados en 5 bloques: representante, empresa, contacto, establecimiento y declaración.
- **Etiquetas visibles, ayudas con ejemplos** («12345678Z», «C/ Mayor, 12») y autocompletado del navegador.
- **Comprobación al enviar**: letra del DNI/NIE, dígito de control del CIF, móvil, código postal de Castilla y León y que este coincida con la provincia elegida. Los errores aparecen junto a cada campo y en un **resumen con enlaces** que recibe el foco.
- **La autorización para publicar los datos es una casilla aparte y sin marcar**: el consentimiento debe ser activo. Se explica que sin ella el comercio no aparecerá en el buscador.
- En el prototipo, al enviar **se abre el correo ya rellenado** para conciliacion.gss@jcyl.es, igual que el proceso actual. También se pueden copiar los datos.
- **Para la versión definitiva** recomendamos tramitarlo en la **Sede Electrónica** con identificación (Cl@ve o certificado). Así se sustituye la firma del PDF, el comercio recibe acuse de recibo y el alta se incorpora directamente a los datos del listado.

## 7. Accesibilidad y usabilidad

Objetivo: **WCAG 2.2 nivel AA** (EN 301 549, RD 1112/2018).

| Criterio | Cómo se aplica en el prototipo |
|---|---|
| Contenido en HTML, no en PDF | Todo el contenido de los PDF está en páginas web. Los PDF solo se enlazan como referencia. |
| Lenguaje claro | Frases cortas, segunda persona, pasos numerados, un único nombre, palabras de uso común («datáfono», «tecla verde»). |
| Estructura semántica | Un `h1` por página, jerarquía de encabezados, regiones (`header`, `nav`, `main`, `footer`), migas de pan y enlace «Saltar al contenido». |
| Teclado | Todo se puede usar con teclado. El foco es visible (3 px) y se mueve a los resultados o a los errores cuando cambian. |
| Lectores de pantalla | Avisos de estado (`role="status"`) para los resultados y la ubicación, sugerencias con el patrón *combobox* de ARIA 1.2 y errores asociados con `aria-describedby`. |
| Contraste y tamaño | Texto base de 18 px. Contraste de al menos 4,5:1 en texto y 3:1 en bordes de campos. Nada depende solo del color (los iconos ✓ ✕ ! llevan texto). |
| Móvil primero | Diseño a una columna que se amplía. Sin desplazamiento horizontal a 320 px. Zonas táctiles de al menos 44 px. |
| Zoom y reflow | Se puede ampliar al 200 % sin perder contenido. Las unidades son relativas. |
| Movimiento | Respeta `prefers-reduced-motion`. |
| Sin dependencia del mapa | La lista contiene toda la información del mapa. |
| Funciona sin JavaScript | Todo el contenido informativo se lee sin JavaScript. Sin él, el buscador remite al PDF y el formulario se envía por correo. |
| Imprimible | Las guías «Cómo pagar» y «Para la caja» tienen estilos de impresión. |
| Privacidad | Sin cookies ni analítica de terceros en el prototipo. La ubicación no se guarda. |
| Rendimiento | Sin frameworks ni compilación. La página más pesada (el buscador) carga unos 450 KB de datos sin comprimir (unos 80 KB con gzip). El mapa solo se descarga si se pide. |

**Comprobación**: `npm test` revisa cada página con axe-core (WCAG 2.0, 2.1 y 2.2, niveles A y AA) a 320 px y en escritorio, y prueba el buscador y el formulario con el teclado. **Antes de publicar** hace falta una auditoría manual y pruebas con familias y comercios reales, incluidas personas que usan lectores de pantalla.

## 8. Hoja de ruta

| Fase | Qué | Resultado |
|---|---|---|
| 1. Contenido (inmediato) | Publicar en jcyl.es las páginas de familias y comercios con el contenido de esta propuesta | Fin de la dependencia de los PDF |
| 2. Buscador | Geocodificar las direcciones con CartoCiudad, publicar el buscador y mantener el listado como datos (CSV o base de datos) | Búsqueda por cercanía real |
| 3. Altas | Formulario en la Sede Electrónica que alimente directamente el listado | Altas sin papel, listado siempre al día |
| 4. Datos abiertos | Publicar el listado (con coordenadas y categorías) en el portal de datos abiertos | Reutilización por apps y ayuntamientos |
| 5. Mejora continua | Pruebas con usuarios, analítica respetuosa con la privacidad y revisión del contenido con MoneyToPay y CaixaBank | Menos llamadas y menos incidencias |

### Cosas que conviene confirmar con MoneyToPay y CaixaBank

- **Horario de MoneyToPay.** El mismo documento dice «24 h al día, 365 días» y «de lunes a viernes de 8 a 17 horas».
- **Si la familia puede ver o cambiar en la web de MoneyToPay el nombre «Tarjeta Regalo/Empresa».** Si no, si se puede pedir que aparezca como «Tarjeta Familia».
- **Si, al devolver un producto, el importe vuelve a la tarjeta.** Las condiciones solo dicen que no se devuelve en efectivo.
- **Las 4 pedanías que no hemos podido situar en su municipio:** Barrientos de la Vega, Miñambres de la Valduerna, Cascón de la Nava y Quintanilla del Puente.

## 9. Métricas para medir la mejora

- **Llamadas y correos de consulta** sobre activación, sobre dónde usar la tarjeta y sobre el PIN, antes y después.
- **Uso del buscador**: búsquedas, búsquedas sin resultados y uso de la ubicación.
- **Descargas de los PDF**: deberían caer casi a cero.
- **Altas de comercios colaboradores** por el formulario web.
- **Tasa de éxito en pruebas con usuarios**: «encuentra una farmacia colaboradora cerca de tu casa», «activa la tarjeta», «¿qué haces si te piden el PIN?».

## 10. Contenido del prototipo

| Ruta | Qué es |
|---|---|
| `index.html` | Portada |
| `familias/` | 8 páginas para familias |
| `comercios/` | 4 páginas para comercios, con el formulario |
| `buscar/` | Buscador de comercios |
| `ayuda.html`, `accesibilidad.html`, `fuentes/` | Ayuda, declaración de accesibilidad y documentos originales |
| `data/` | Datos extraídos: establecimientos, localidades, sectores e incidencias |
| `scripts/` | Extracción del PDF, geocodificación y generación de páginas |
| `src/` | Contenido de las páginas (se edita aquí y se regenera) |
| `tests/` | Pruebas de accesibilidad y funcionamiento |

Cómo verlo y cómo actualizar los datos: ver `README.md`.
