// Pruebas de la web: accesibilidad automática (axe-core), diseño a 320 px y
// funcionamiento del buscador y del formulario con teclado.
//
//   npm test            (necesita Playwright con Chromium instalado)
//   CAPTURAS=1 npm test (guarda capturas en tests/capturas/)
import { createServer } from "node:http";
import { readFile, mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const RAIZ = fileURLToPath(new URL("../", import.meta.url));
const AXE = await readFile(require.resolve("axe-core/axe.min.js"), "utf8");
const CAPTURAS = process.env.CAPTURAS === "1";

const PAGINAS = [
  "index.html", "familias/index.html", "familias/activar.html", "familias/pagar.html",
  "familias/que-comprar.html", "familias/saldo.html", "familias/problemas.html", "familias/que-es.html",
  "familias/preguntas-frecuentes.html", "comercios/index.html", "comercios/sectores.html",
  "comercios/como-cobrar.html", "comercios/hazte-colaborador.html", "buscar/index.html",
  "buscar/index.html?q=Ar%C3%A9valo", "ayuda.html", "accesibilidad.html", "fuentes/index.html", "propuesta.html", "sobre.html",
];

const TIPOS = { ".html": "text/html; charset=utf-8", ".css": "text/css", ".js": "text/javascript", ".json": "application/json", ".jpg": "image/jpeg", ".png": "image/png", ".svg": "image/svg+xml", ".pdf": "application/pdf" };
const servidor = createServer(async (req, res) => {
  const ruta = normalize(decodeURIComponent(new URL(req.url, "http://x").pathname)).replace(/^(\.\.[/\\])+/, "");
  try {
    const cuerpo = await readFile(join(RAIZ, ruta.endsWith("/") ? `${ruta}index.html` : ruta));
    res.writeHead(200, { "Content-Type": TIPOS[extname(ruta)] ?? "application/octet-stream" });
    res.end(cuerpo);
  } catch {
    res.writeHead(404);
    res.end("No encontrado");
  }
});
await new Promise((ok) => servidor.listen(0, "127.0.0.1", ok));
const BASE = `http://127.0.0.1:${servidor.address().port}/`;

let fallos = 0;
const ok = (cond, mensaje) => {
  console.log(`${cond ? "  ✓" : "  ✗"} ${mensaje}`);
  if (!cond) fallos++;
};

const navegador = await chromium.launch();

async function nuevaPagina(ancho, opciones = {}) {
  const contexto = await navegador.newContext({ viewport: { width: ancho, height: 900 }, locale: "es-ES", ...opciones });
  // Las teselas del mapa son externas: no se piden durante las pruebas.
  await contexto.route(/tile\.openstreetmap\.org/, (r) => r.abort());
  const pagina = await contexto.newPage();
  pagina.on("pageerror", (e) => ok(false, `Error de JavaScript: ${e.message}`));
  return pagina;
}

async function axe(pagina) {
  await pagina.addScriptTag({ content: AXE });
  return pagina.evaluate(async () => {
    const r = await window.axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"] } });
    return r.violations.map((v) => `${v.id} (${v.impact}): ${v.help} → ${v.nodes.slice(0, 3).map((n) => n.target.join(" ")).join(" | ")}`);
  });
}

if (CAPTURAS) await mkdir(new URL("capturas/", import.meta.url), { recursive: true });

// ---- 1. Accesibilidad y diseño en cada página, a 320 px y en escritorio -------------------
console.log("\nAccesibilidad (axe-core, WCAG 2.2 A/AA) y desbordamiento horizontal");
for (const ancho of [320, 1280]) {
  const pagina = await nuevaPagina(ancho);
  for (const ruta of PAGINAS) {
    await pagina.goto(BASE + ruta);
    await pagina.waitForLoadState("networkidle");
    const violaciones = await axe(pagina);
    ok(violaciones.length === 0, `${ruta} @${ancho}px: ${violaciones.length ? violaciones.join("; ") : "sin violaciones"}`);
    if (ancho === 320) ok(/no oficial/.test(await pagina.textContent(".no-oficial")), `${ruta} indica que la web no es oficial`);
    const desborda = await pagina.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    if (ancho === 320) ok(desborda <= 0, `${ruta} @320px sin desplazamiento horizontal (${desborda}px de más)`);
    if (CAPTURAS) await pagina.screenshot({ path: fileURLToPath(new URL(`capturas/${ruta.replace(/[/?=%]/g, "_")}-${ancho}.png`, import.meta.url)), fullPage: true });
  }
  await pagina.context().close();
}

// ---- 2. Navegación con teclado -------------------------------------------------------------
console.log("\nTeclado");
{
  const pagina = await nuevaPagina(1280);
  await pagina.goto(BASE + "index.html");
  await pagina.keyboard.press("Tab");
  ok(await pagina.evaluate(() => document.activeElement.classList.contains("saltar")), "El primer Tab llega a «Saltar al contenido»");
  await pagina.keyboard.press("Enter");
  ok(await pagina.evaluate(() => document.activeElement.id === "contenido"), "«Saltar al contenido» mueve el foco al contenido principal");
  await pagina.context().close();
}

// ---- 3. Sugerencias en la portada ----------------------------------------------------------
console.log("\nPortada");
{
  const pagina = await nuevaPagina(390);
  await pagina.goto(BASE + "index.html");
  await pagina.focus("#q-portada");
  await pagina.keyboard.type("villafr");
  await pagina.waitForSelector("#sugerencias-portada:not([hidden]) [role=option]");
  ok(await pagina.getAttribute("#q-portada", "aria-expanded") === "true", "La portada muestra sugerencias al escribir");
  const opciones = await pagina.$$eval("#sugerencias-portada [role=option]", (els) => els.map((e) => e.textContent));
  ok(opciones.some((t) => /Villafranca del Bierzo/.test(t)), `Sugiere «Villafranca del Bierzo» (${opciones.length} sugerencias)`);
  const indice = opciones.findIndex((t) => /Villafranca del Bierzo/.test(t));
  for (let i = 0; i <= indice; i++) await pagina.keyboard.press("ArrowDown");
  ok(await pagina.getAttribute("#q-portada", "aria-activedescendant") === `sugerencias-portada-${indice}`, "Las flechas recorren las sugerencias");
  await Promise.all([pagina.waitForURL(/buscar\/index\.html\?q=Villafranca/), pagina.keyboard.press("Enter")]);
  await pagina.waitForFunction(() => /Villafranca del Bierzo/.test(document.querySelector("#titulo-resultados").textContent));
  ok(true, `Enter lleva al buscador con los resultados: «${await pagina.textContent("#titulo-resultados")}»`);
  await pagina.context().close();
}

// ---- 3b. Buscador ---------------------------------------------------------------------------
console.log("\nBuscador");
{
  const pagina = await nuevaPagina(1280);
  await pagina.goto(BASE + "buscar/index.html?q=05200");
  const titulo = await pagina.textContent("#titulo-resultados");
  ok(/comercios .*código postal 05200 \(Arévalo\)/.test(titulo), `Búsqueda por CP desde la URL: «${titulo}»`);
  const primero = await pagina.textContent(".lista-establecimientos li:first-child .distancia");
  ok(primero === "En este código postal", `El primer resultado está en el código postal buscado («${primero}»)`);

  // Sugerencias y selección solo con teclado.
  await pagina.goto(BASE + "buscar/index.html");
  await pagina.focus("#q");
  await pagina.keyboard.type("medina del c");
  await pagina.waitForSelector("#sugerencias:not([hidden]) [role=option]");
  ok(await pagina.getAttribute("#q", "aria-expanded") === "true", "El combobox indica que la lista está abierta");
  await pagina.keyboard.press("ArrowDown");
  ok(await pagina.getAttribute("#q", "aria-activedescendant") === "sugerencias-0", "La flecha abajo activa la primera sugerencia");
  await pagina.keyboard.press("Enter");
  await pagina.waitForFunction(() => /Medina del Campo/.test(document.querySelector("#titulo-resultados").textContent));
  ok(await pagina.evaluate(() => document.activeElement.id === "titulo-resultados"), "Tras buscar, el foco pasa al título de resultados");
  const anuncio = await pagina.waitForFunction(() => document.querySelector("#anuncio").textContent).then((h) => h.jsonValue());
  ok(/Medina del Campo/.test(anuncio), `Se anuncia el resultado a lectores de pantalla: «${anuncio}»`);

  // Filtro por categoría.
  await pagina.selectOption("#categoria", "farmacia");
  await pagina.waitForFunction(() => /farmacia/.test(document.querySelector("#titulo-resultados").textContent));
  const categorias = await pagina.$$eval(".etiqueta-cat", (els) => [...new Set(els.map((e) => e.textContent))]);
  ok(categorias.length === 1 && categorias[0] === "Farmacia y parafarmacia", `El filtro deja solo farmacias (${categorias.join(", ")})`);
  ok(pagina.url().includes("cat=farmacia"), "La búsqueda queda en la URL para compartirla");

  // Distancias ordenadas.
  await pagina.selectOption("#radio", "50");
  const distancias = await pagina.$$eval(".distancia", (els) => els.map((e) => e.textContent));
  const km = distancias.map((d) => (d === "En esta localidad" ? 0 : parseFloat(d.replace("A ", "").replace("menos de 1", "0.5").replace(",", "."))));
  ok(km.every((v, i) => i === 0 || v >= km[i - 1]), "Los resultados están ordenados por distancia");

  // Cargar más mueve el foco al primer resultado nuevo.
  await pagina.selectOption("#categoria", "");
  if (await pagina.isVisible("#mas")) {
    await pagina.click("#mas");
    ok(await pagina.evaluate(() => document.activeElement.matches(".lista-establecimientos li:nth-child(21) article")), "«Mostrar más» lleva el foco al primer resultado nuevo");
  }

  // Código postal sin comercios: se muestran los más cercanos (09110 = Castrojeriz).
  await pagina.goto(BASE + "buscar/index.html?q=09110&km=5");
  const tituloCP = await pagina.textContent("#titulo-resultados");
  ok(/más cercanos al código postal 09110 \(Castrojeriz\)/.test(tituloCP), `CP sin comercios cerca muestra los más cercanos: «${tituloCP}»`);
  ok(await pagina.$$eval(".lista-establecimientos > li", (els) => els.length) === 10, "Se muestran los 10 más cercanos");

  // Código postal de fuera de Castilla y León.
  await pagina.goto(BASE + "buscar/index.html?q=28001");
  ok(/no es de Castilla y León/.test(await pagina.textContent("#titulo-resultados")), "Un CP de fuera de Castilla y León da un mensaje claro");

  // Municipio: incluye sus pedanías (Trobajo del Camino es de San Andrés del Rabanedo).
  await pagina.goto(BASE + "buscar/index.html?q=San%20Andr%C3%A9s%20del%20Rabanedo");
  const pedania = await pagina.$$eval(".establecimiento", (els) => els.filter((e) => /Trobajo del Camino/.test(e.textContent)).map((e) => e.querySelector(".distancia").textContent));
  ok(pedania.length > 0 && pedania.every((t) => t === "En este municipio"), `Buscar un municipio incluye sus pedanías (${pedania.length} en Trobajo del Camino)`);

  // El texto libre también busca por tipo de comercio.
  await pagina.goto(BASE + "buscar/index.html?q=Ar%C3%A9valo&texto=zapater%C3%ADa&km=50");
  const tipos = await pagina.$$eval(".etiqueta-cat", (els) => [...new Set(els.map((e) => e.textContent))]);
  ok(tipos.length === 1 && tipos[0] === "Calzado", `«zapatería» en el texto libre encuentra calzado (${tipos.join(", ")})`);

  // Localidad inexistente.
  await pagina.fill("#q", "Xyzzyville");
  await pagina.click("#form-busqueda button[type=submit]");
  ok(/No encontramos/.test(await pagina.textContent("#titulo-resultados")), "Una localidad que no existe da un mensaje claro");

  // Mapa opcional.
  await pagina.fill("#q", "Arévalo");
  await pagina.press("#q", "Enter");
  await pagina.waitForFunction(() => /Arévalo/.test(document.querySelector("#titulo-resultados").textContent));
  await pagina.click("[data-vista=mapa]");
  await pagina.waitForSelector("#mapa .leaflet-marker-icon");
  const marcadores = await pagina.$$eval("#mapa .leaflet-marker-icon", (els) => els.length);
  ok(marcadores > 0, `El mapa se carga bajo demanda y muestra ${marcadores} marcadores`);
  ok(await pagina.isVisible("text=Ver en el mapa"), "Con el mapa activo, cada resultado ofrece «Ver en el mapa»");
  await pagina.context().close();

  // Geolocalización simulada en Valladolid (Plaza Mayor).
  const geo = await nuevaPagina(390, { geolocation: { latitude: 41.6521, longitude: -4.7286 }, permissions: ["geolocation"] });
  await geo.goto(BASE + "buscar/index.html");
  await geo.click("#ubicacion");
  await geo.waitForFunction(() => /tu ubicación/.test(document.querySelector("#titulo-resultados").textContent));
  ok(/cerca de Valladolid/.test(await geo.textContent("#estado-ubicacion")), `Ubicación: «${await geo.textContent("#estado-ubicacion")}»`);
  const loc = await geo.textContent(".lista-establecimientos li:first-child article p:nth-of-type(2)");
  ok(/Valladolid/.test(loc), "Con la ubicación, el primer comercio está en Valladolid");
  await geo.context().close();
}

// ---- 4. Formulario de colaborador ----------------------------------------------------------
console.log("\nFormulario de colaborador");
{
  const pagina = await nuevaPagina(1280);
  await pagina.goto(BASE + "comercios/hazte-colaborador.html");
  await pagina.click("#form-colaborador button[type=submit]");
  ok(await pagina.isVisible("#resumen-errores"), "Al enviar vacío aparece el resumen de errores");
  ok(await pagina.evaluate(() => document.activeElement.id === "resumen-errores"), "El foco va al resumen de errores");
  const errores = await pagina.$$eval("#resumen-errores li", (els) => els.length);
  ok(errores === 14, `El resumen lista los 14 campos obligatorios (${errores})`);
  ok(await pagina.getAttribute("#dni", "aria-invalid") === "true", "Los campos con error tienen aria-invalid");
  await pagina.click("#resumen-errores li:nth-child(3) a");
  ok(await pagina.evaluate(() => document.activeElement.id === "dni"), "Cada error enlaza con su campo");

  await pagina.fill("#nombre", "Ana");
  await pagina.fill("#apellido1", "García");
  await pagina.fill("#dni", "12345678A");
  await pagina.fill("#razon", "Farmacia Ejemplo, C.B.");
  await pagina.fill("#cif", "E12345674");
  await pagina.selectOption("#sector", { index: 1 });
  await pagina.fill("#email", "ana@ejemplo.es");
  await pagina.fill("#movil", "612 345 678");
  await pagina.fill("#comercial", "Farmacia Ejemplo");
  await pagina.fill("#direccion", "C/ Mayor, 1");
  await pagina.selectOption("#provincia", "05");
  await pagina.fill("#localidad", "Arévalo");
  await pagina.fill("#cp", "47001");
  await pagina.check("#declaracion");
  await pagina.click("#form-colaborador button[type=submit]");
  const mensajes = await pagina.$$eval("#resumen-errores li", (els) => els.map((e) => e.textContent));
  ok(mensajes.some((m) => /letra/.test(m)), "Detecta una letra de DNI incorrecta");
  ok(mensajes.some((m) => /47001 es de Valladolid, pero has elegido Ávila/.test(m)), "Detecta un CP que no coincide con la provincia");

  await pagina.fill("#dni", "12345678Z");
  await pagina.fill("#cp", "05200");
  await pagina.click("#form-colaborador button[type=submit]");
  ok(await pagina.isVisible("#confirmacion"), "Con los datos correctos se muestra la confirmación");
  ok(await pagina.evaluate(() => document.activeElement.id === "confirmacion"), "El foco va a la confirmación");
  const enlace = await pagina.getAttribute("#enlace-correo", "href");
  ok(enlace.startsWith("mailto:conciliacion.gss@jcyl.es?subject=") && decodeURIComponent(enlace).includes("Nombre del establecimiento: Farmacia Ejemplo"), "El correo preparado lleva los datos del formulario");
  await pagina.context().close();
}

// ---- 5. Aviso «sin PIN» con la cita oficial ------------------------------------------------
console.log("\nAviso «sin PIN»");
{
  const pagina = await nuevaPagina(1280);
  for (const ruta of ["familias/pagar.html", "familias/problemas.html", "comercios/como-cobrar.html"]) {
    await pagina.goto(BASE + ruta);
    const cita = await pagina.$$eval(".sin-pin blockquote", (els) => els.map((e) => e.textContent));
    const fuente = await pagina.$$eval(".sin-pin a[href$='condiciones-de-uso-2026-10-16.pdf']", (els) => els.length);
    ok(cita.length === 1 && /no requiere PIN/.test(cita[0]) && fuente === 1, `${ruta} muestra la cita oficial sobre el PIN con su fuente`);
  }
  await pagina.context().close();
}

// ---- 6. Sectores ---------------------------------------------------------------------------
console.log("\nSectores");
{
  const pagina = await nuevaPagina(1280);
  await pagina.goto(BASE + "comercios/sectores.html");
  await pagina.fill("#filtro-sector", "zapateria");
  await pagina.waitForFunction(() => /coincide/.test(document.querySelector("[data-recuento]").textContent));
  const visibles = await pagina.$$eval("[data-texto]:not([hidden])", (els) => els.map((e) => e.textContent));
  ok(visibles.length > 0 && visibles.every((t) => /Zapater/i.test(t)), `El filtro sin tildes encuentra zapaterías (${visibles.length})`);
  await pagina.context().close();
}

await navegador.close();
servidor.close();
console.log(fallos ? `\n${fallos} comprobaciones fallidas` : "\nTodas las comprobaciones han pasado");
process.exit(fallos ? 1 : 0);
