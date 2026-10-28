// Normaliza el listado extraído del PDF y le añade coordenadas.
//
//   node scripts/geocodificar.mjs               -> coordenadas por localidad (sin conexión)
//   node scripts/geocodificar.mjs --cartociudad -> además, por dirección con CartoCiudad (IGN)
//
// Entrada:  data/establecimientos-base.json (scripts/extraer_establecimientos.py)
// Salida:   data/establecimientos.json, data/localidades.json, data/incidencias-listado.json
//
// Fuentes de coordenadas, de más a menos precisa:
//   1. "direccion": CartoCiudad (geocodificador oficial del IGN). Se guarda en
//      data/cache-cartociudad.json para no repetir consultas.
//   2. "localidad": punto del núcleo urbano según GeoNames (paquete cities.json, CC BY 4.0).
//   3. "municipio": centroide del término municipal del IGN (paquete es-atlas) o, para
//      pedanías, el del municipio al que pertenecen.
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
import { feature } from "topojson-client";

const require = createRequire(import.meta.url);
const raiz = new URL("../", import.meta.url);
const leer = (ruta) => JSON.parse(readFileSync(new URL(ruta, raiz), "utf8"));
const escribir = (ruta, datos, sangria) =>
  writeFileSync(new URL(ruta, raiz), JSON.stringify(datos, null, sangria) + "\n");
// Copia en .js para que el buscador funcione también abriendo los HTML sin servidor (file://).
const escribirJs = (ruta, variable, datos) =>
  writeFileSync(new URL(ruta, raiz), `window.${variable} = ${JSON.stringify(datos)};\n`);

const PROVINCIAS = {
  "05": { nombre: "Ávila", geonames: "AV" },
  "09": { nombre: "Burgos", geonames: "BU" },
  "24": { nombre: "León", geonames: "LE" },
  "34": { nombre: "Palencia", geonames: "P" },
  "37": { nombre: "Salamanca", geonames: "SA" },
  "40": { nombre: "Segovia", geonames: "SG" },
  "42": { nombre: "Soria", geonames: "SO" },
  "47": { nombre: "Valladolid", geonames: "VA" },
  "49": { nombre: "Zamora", geonames: "ZA" },
};
const codigoProvincia = Object.fromEntries(
  Object.entries(PROVINCIAS).map(([codigo, p]) => [p.nombre, codigo]),
);

// Erratas y abreviaturas del PDF que no se resuelven solo quitando tildes.
const ERRATAS = {
  "bugos": "Burgos",
  "alar de lrey": "Alar del Rey",
  "cisternica": "La Cistérniga",
  "corrales del viuno": "Corrales del Vino",
  "san justo de l a vega": "San Justo de la Vega",
  "valencia don juan": "Valencia de Don Juan",
  "villarcayo de m. c.v.": "Villarcayo de Merindad de Castilla la Vieja",
  "villarcayo": "Villarcayo de Merindad de Castilla la Vieja",
  "roa de duero": "Roa",
  "arcos de la llana": "Arcos",
  "villalvilla de burgos": "Villalbilla de Burgos",
  "benavides de orbigo": "Benavides",
  "osorno": "Osorno la Mayor",
  "carpio del campo": "Carpio",
  "carrizo": "Carrizo de la Ribera",
  "virgen del camino": "La Virgen del Camino",
  "mayorga de campos": "Mayorga",
  "trevino": "Condado de Treviño",
  "pedraja de portillo": "La Pedraja de Portillo",
  "barco de avila": "El Barco de Ávila",
  "santa ma del berrocal": "Santa María del Berrocal",
};

// Nombres del IGN que se muestran mejor con su artículo.
const CON_ARTICULO = { "Cistérniga": "La Cistérniga" };

// Núcleos que no son municipio: se sitúan en el municipio al que pertenecen.
const PEDANIAS = {
  "Trobajo del Camino": "San Andrés del Rabanedo",
  "Navatejera": "Villaquilambre",
  "Villaobispo de las Regueras": "Villaquilambre",
  "La Virgen del Camino": "Valverde de la Virgen",
  "Ciñera": "La Pola de Gordón",
  "Caboalles de Abajo": "Villablino",
  "Villaseca de Laciana": "Villablino",
  "Veguellina de Órbigo": "Villarejo de Órbigo",
  "La Magdalena": "Soto y Amío",
  "Puente Duero": "Valladolid",
  "Arrabal de Portillo": "Portillo",
  "San Rafael": "El Espinar",
  "Quintanadueñas": "Alfoz de Quintanadueñas",
  "Toral de los Vados": "Villafranca del Bierzo",
  "Lorenzana": "Cuadros",
  "Carrizo de la Ribera": "Carrizo",
  "La Cañada": "Herradón de Pinares",
  "Jiménez de Jamuz": "Santa Elena de Jamuz",
  "Puente Almuhey": "Valderrueda",
  "San Miguel de las Dueñas": "Congosto",
  "Villafañe": "Villasabariego",
  "Valdeperdices": "Cubillos",
};

function redondea(n) {
  return Math.round(n * 1e5) / 1e5;
}

const sinTildes = (t) => t.normalize("NFD").replace(/[̀-ͯ]/g, "");
// Clave de comparación: sin tildes, en minúsculas, sin artículo inicial ni "(La)" final.
function clave(t) {
  let k = sinTildes(t).toLowerCase().replace(/ª/g, "a").replace(/[’']/g, "").replace(/-/g, " ").replace(/\s+/g, " ").trim();
  k = k.replace(/^(.*), (el|la|los|las)$/, "$2 $1").replace(/^(.*) \((el|la|los|las)\)$/, "$2 $1");
  return k.replace(/^(el|la|los|las) /, "");
}

// ---- Índices de lugares ---------------------------------------------------------------

const atlas = JSON.parse(readFileSync(require.resolve("es-atlas/es/municipalities.json"), "utf8"));
const municipios = feature(atlas, atlas.objects.municipalities).features
  .filter((f) => PROVINCIAS[String(f.id).slice(0, 2)])
  .map((f) => ({
    nombre: nombreOficial(f.properties.name),
    provincia: PROVINCIAS[String(f.id).slice(0, 2)].nombre,
    ine: String(f.id),
    ...centroide(f.geometry),
  }));

// "Cistérniga, La" -> "La Cistérniga"
function nombreOficial(n) {
  if (CON_ARTICULO[n]) return CON_ARTICULO[n];
  const m = n.match(/^(.*), (El|La|Los|Las)$/);
  return m ? `${m[2]} ${m[1]}` : n;
}

// Centroide de área del polígono más grande (en grados: suficiente a esta escala).
function centroide(geom) {
  const poligonos = geom.type === "Polygon" ? [geom.coordinates] : geom.coordinates;
  let mejor = null;
  for (const [anillo] of poligonos) {
    let a = 0, cx = 0, cy = 0;
    for (let i = 0, j = anillo.length - 1; i < anillo.length; j = i++) {
      const [x0, y0] = anillo[j], [x1, y1] = anillo[i];
      const f = x0 * y1 - x1 * y0;
      a += f; cx += (x0 + x1) * f; cy += (y0 + y1) * f;
    }
    if (!mejor || Math.abs(a) > Math.abs(mejor.a)) mejor = { a, lon: cx / (3 * a), lat: cy / (3 * a) };
  }
  return { lat: redondea(mejor.lat), lon: redondea(mejor.lon) };
}


const nucleos = JSON.parse(readFileSync(require.resolve("cities.json/cities.json"), "utf8"))
  .filter((c) => c.country === "ES" && c.admin1 === "55")
  .map((c) => ({
    nombre: c.name,
    provincia: Object.values(PROVINCIAS).find((p) => p.geonames === c.admin2)?.nombre,
    lat: redondea(+c.lat),
    lon: redondea(+c.lng),
  }));

const indice = (lista) => {
  const m = new Map();
  for (const l of lista) m.set(`${l.provincia}|${clave(l.nombre)}`, l);
  return m;
};
const porMunicipio = indice(municipios);
const porNucleo = indice(nucleos);

function busca(nombre, provincia) {
  const k = `${provincia}|${clave(nombre)}`;
  const municipio = porMunicipio.get(k);
  const nucleo = porNucleo.get(k);
  if (nucleo) return { nombre: municipio?.nombre ?? nucleo.nombre, lat: nucleo.lat, lon: nucleo.lon, precision: "localidad" };
  if (municipio) return { nombre: municipio.nombre, lat: municipio.lat, lon: municipio.lon, precision: "municipio" };
  return null;
}

function localiza(localidadPdf, provincia) {
  const corregida = ERRATAS[clave(localidadPdf)] ?? localidadPdf;
  const directa = busca(corregida, provincia);
  if (directa && !(directa.nombre in PEDANIAS && PEDANIAS[directa.nombre] !== directa.nombre)) return directa;
  const nombre = directa?.nombre ?? Object.keys(PEDANIAS).find((p) => clave(p) === clave(corregida)) ?? corregida;
  const padre = PEDANIAS[nombre] && busca(PEDANIAS[nombre], provincia);
  if (padre) return { nombre, lat: padre.lat, lon: padre.lon, precision: "municipio", municipio: padre.nombre };
  return directa;
}

// ---- Texto legible --------------------------------------------------------------------

const MINUSCULAS = new Set(["de", "del", "la", "las", "el", "los", "y", "e", "en", "a"]);
const SIGLAS = /^(S\.?L\.?U?\.?|S\.?A\.?|C\.?B\.?|S\.?C\.?|SL|SA|CB|SLU|IT|CMP|LED|BM|DIA|H&M|C&A|II|III|IV|VI|VII|XIII|C\.C\.|M&T|LDA\.?|LCDA\.?)$/;

// "FARMACIA Mª CARMEN GUERRAS S.L." -> "Farmacia Mª Carmen Guerras S.L."
function legible(texto) {
  return texto.split(" ").map((palabra, i) => {
    if (!palabra) return palabra;
    if (SIGLAS.test(palabra.replace(/[,()]/g, ""))) return palabra.replace("LDA", "Lda").replace("LCDA", "Lcda");
    if (/^(C\/|CL|AV|AVDA\.?|PZ|PZA\.?|PLZA\.?|CR|CTRA\.?|CRTA\.?|PS|Nº|S\/N)$/.test(palabra)) return palabra;
    if (/^\d/.test(palabra)) return palabra;
    const minus = palabra.toLocaleLowerCase("es");
    if (i > 0 && MINUSCULAS.has(minus)) return minus;
    return minus.replace(/(^|[-("/.])(\p{L})/gu, (_, sep, letra) => sep + letra.toLocaleUpperCase("es"));
  }).join(" ");
}

// ---- CartoCiudad (opcional) -----------------------------------------------------------

const RUTA_CACHE = "data/cache-cartociudad.json";
const cache = existsSync(new URL(RUTA_CACHE, raiz)) ? leer(RUTA_CACHE) : {};

async function cartociudad(e, aprox) {
  const consulta = `${e.direccion}, ${e.cp} ${e.localidad}`;
  if (!(consulta in cache)) {
    const url = `https://www.cartociudad.es/geocoder/api/geocoder/find?q=${encodeURIComponent(consulta)}`;
    try {
      const r = await fetch(url, { headers: { "User-Agent": "tarjeta-familia-cyl (prototipo)" } });
      const texto = await r.text();
      const json = JSON.parse(texto.replace(/^[^(]*\(|\)\s*;?\s*$/g, ""));
      cache[consulta] = json && json.lat ? { lat: redondea(+json.lat), lon: redondea(+json.lng), tipo: json.type } : null;
    } catch (err) {
      console.warn(`  CartoCiudad no responde (${err.message}). Se sigue sin conexión.`);
      return "sin-conexion";
    }
    await new Promise((ok) => setTimeout(ok, 150));
  }
  const res = cache[consulta];
  // Se descarta si cae a más de 20 km de la localidad: suele ser un homónimo.
  if (!res || (aprox && distanciaKm(res, aprox) > 20)) return null;
  return res;
}

function distanciaKm(a, b) {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad, dLon = (b.lon - a.lon) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(h));
}

// ---- Proceso --------------------------------------------------------------------------

const base = leer("data/establecimientos-base.json");
const incidencias = { duplicados: [], provinciaDistintaDelCP: [], sinCoordenadas: [], nombresCorregidos: {} };
const usarCartociudad = process.argv.includes("--cartociudad");
let conexion = usarCartociudad;
const vistos = new Map();
const salida = [];

for (const e of base.establecimientos) {
  const provCP = PROVINCIAS[e.cp.slice(0, 2)]?.nombre;
  // Se busca la localidad primero en la provincia de la sección del PDF y, si no está,
  // en la provincia que indica el código postal.
  let provincia = e.provincia;
  let lugar = localiza(e.localidad, provincia);
  if (!lugar && provCP && provCP !== provincia) {
    lugar = localiza(e.localidad, provCP);
    if (lugar) provincia = provCP;
  }
  if (provCP !== provincia) {
    incidencias.provinciaDistintaDelCP.push({ nombre: e.nombre, localidad: e.localidad, seccion: e.provincia, cp: e.cp });
  }

  const firma = `${clave(e.nombre)}|${clave(e.direccion)}|${e.cp}`;
  if (vistos.has(firma)) {
    vistos.get(firma).secciones.push(e.provincia);
    continue;
  }

  const localidad = lugar?.nombre ?? e.localidad;
  if (localidad !== e.localidad) incidencias.nombresCorregidos[e.localidad] = localidad;
  const registro = {
    id: e.id,
    nombre: legible(e.nombre),
    direccion: legible(e.direccion),
    cp: e.cp,
    localidad,
    provincia,
    categoria: e.categoria,
    lat: lugar?.lat ?? null,
    lon: lugar?.lon ?? null,
    precision: lugar?.precision ?? null,
  };
  if (conexion) {
    const punto = await cartociudad({ ...e, localidad }, lugar);
    if (punto === "sin-conexion") conexion = false;
    else if (punto) Object.assign(registro, { lat: punto.lat, lon: punto.lon, precision: "direccion" });
  }
  if (registro.lat == null) incidencias.sinCoordenadas.push({ id: e.id, nombre: e.nombre, localidad: e.localidad, cp: e.cp, provincia });
  vistos.set(firma, { registro, secciones: [e.provincia] });
  salida.push(registro);
}

// Respaldo: si la localidad no aparece en ningún índice, se usa la posición media de los
// otros establecimientos del mismo código postal.
const porCP = {};
for (const e of salida) if (e.lat != null) (porCP[e.cp] ??= []).push(e);
for (const e of salida) {
  if (e.lat != null || !porCP[e.cp]) continue;
  const mismos = porCP[e.cp];
  e.lat = redondea(mismos.reduce((s, x) => s + x.lat, 0) / mismos.length);
  e.lon = redondea(mismos.reduce((s, x) => s + x.lon, 0) / mismos.length);
  e.precision = "codigo-postal";
}
incidencias.sinCoordenadas = incidencias.sinCoordenadas.filter((i) => salida.some((e) => e.id === i.id && e.lat == null));

for (const { registro, secciones } of vistos.values()) {
  if (secciones.length > 1) incidencias.duplicados.push({ nombre: registro.nombre, direccion: registro.direccion, seccionesDelPdf: secciones });
}

const CATEGORIAS = {};
for (const e of base.establecimientos) CATEGORIAS[e.categoria] = e.categoriaNombre;
const categorias = Object.entries(CATEGORIAS)
  .map(([id, nombre]) => ({ id, nombre, total: salida.filter((e) => e.categoria === id).length }))
  .sort((a, b) => (a.id === "otros") - (b.id === "otros") || b.total - a.total);

const datosEstablecimientos = {
  fuente: base.fuente,
  fechaListado: base.fechaListado,
  total: salida.length,
  categorias,
  establecimientos: salida,
};
escribir("data/establecimientos.json", datosEstablecimientos);
escribirJs("data/establecimientos.js", "DATOS_ESTABLECIMIENTOS", datosEstablecimientos);

// Todas las localidades de CyL (aunque no tengan comercios colaboradores), para poder
// buscar "cerca de mi pueblo".
const localidades = new Map();
for (const m of municipios) localidades.set(`${m.provincia}|${clave(m.nombre)}`, { nombre: m.nombre, provincia: m.provincia, lat: m.lat, lon: m.lon });
for (const n of nucleos) {
  const k = `${n.provincia}|${clave(n.nombre)}`;
  const previo = localidades.get(k);
  localidades.set(k, { nombre: previo?.nombre ?? n.nombre, provincia: n.provincia, lat: n.lat, lon: n.lon });
}
for (const e of salida) {
  const k = `${e.provincia}|${clave(e.localidad)}`;
  if (!localidades.has(k) && e.lat != null) localidades.set(k, { nombre: e.localidad, provincia: e.provincia, lat: e.lat, lon: e.lon });
}
const listaLocalidades = [...localidades.values()]
  .map((l) => [l.nombre, codigoProvincia[l.provincia], l.lat, l.lon])
  .sort((a, b) => a[0].localeCompare(b[0], "es"));
const datosLocalidades = {
  campos: ["nombre", "provincia", "lat", "lon"],
  provincias: Object.fromEntries(Object.entries(PROVINCIAS).map(([c, p]) => [c, p.nombre])),
  localidades: listaLocalidades,
};
escribir("data/localidades.json", datosLocalidades);
escribirJs("data/localidades.js", "DATOS_LOCALIDADES", datosLocalidades);

escribir("data/incidencias-listado.json", incidencias, 1);
if (usarCartociudad) escribir(RUTA_CACHE, cache, 1);

const precisiones = {};
for (const e of salida) precisiones[e.precision] = (precisiones[e.precision] ?? 0) + 1;
console.log(`${salida.length} establecimientos (de ${base.total} filas del PDF; ${base.total - salida.length} duplicados)`);
console.log("Precisión de las coordenadas:", precisiones);
console.log(`${listaLocalidades.length} localidades en el índice de búsqueda`);
console.log(`Incidencias: ${incidencias.duplicados.length} duplicados, ${incidencias.provinciaDistintaDelCP.length} con provincia distinta del CP, ${incidencias.sinCoordenadas.length} sin coordenadas`);
