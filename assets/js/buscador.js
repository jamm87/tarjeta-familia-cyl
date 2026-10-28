// Buscador de comercios colaboradores.
//
// Datos: window.DATOS_ESTABLECIMIENTOS y window.DATOS_LOCALIDADES (data/*.js, generados por
// scripts/geocodificar.mjs). La lista de resultados es la vista principal; el mapa (Leaflet)
// es opcional, se carga solo si se pide y muestra exactamente lo mismo que la lista.

(() => {
  const RAIZ = new URL("../../", document.currentScript.src);
  const POR_PAGINA = 20;
  const DATOS = window.DATOS_ESTABLECIMIENTOS;
  const LOC = window.DATOS_LOCALIDADES;

  const $ = (id) => document.getElementById(id);
  const contenedor = document.querySelector("[data-buscador]");
  const form = $("form-busqueda");
  const q = $("q");
  const listbox = $("sugerencias");
  const selCategoria = $("categoria");
  const selRadio = $("radio");
  const texto = $("texto");
  const titulo = $("titulo-resultados");
  const anuncio = $("anuncio");
  const lista = $("lista");
  const nota = $("nota-resultados");
  const inicio = $("inicio-busqueda");
  const botonMas = $("mas");
  const zonaMas = botonMas.parentElement;
  const grupoVista = document.querySelector(".vista");
  const mapaEl = $("mapa");
  const zona = $("zona-resultados");
  const estadoUbicacion = $("estado-ubicacion");

  const normaliza = (t) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[-']/g, " ").replace(/\s+/g, " ").trim();
  const sinArticulo = (t) => t.replace(/^(el|la|los|las) /, "");
  const formatoKm = (km) => (km < 1 ? "menos de 1 km" : `${km.toLocaleString("es-ES", { maximumFractionDigits: km < 10 ? 1 : 0 })} km`);
  const nombreCategoria = Object.fromEntries(DATOS.categorias.map((c) => [c.id, c.nombre]));

  // ---- Índices ------------------------------------------------------------------------

  // El texto libre busca en el nombre, la dirección y el tipo de comercio (sector).
  const establecimientos = DATOS.establecimientos.map((e) => ({
    ...e,
    claveLocalidad: `${e.provincia}|${normaliza(e.localidad)}`,
    buscable: normaliza(`${e.nombre} ${e.direccion} ${nombreCategoria[e.categoria]}`),
  }));
  const cuenta = (lista, clave) => {
    const c = {};
    for (const e of lista) c[clave(e)] = (c[clave(e)] ?? 0) + 1;
    return c;
  };
  const comerciosPorLocalidad = cuenta(establecimientos, (e) => e.claveLocalidad);
  const comerciosPorMunicipio = cuenta(establecimientos, (e) => e.municipio);
  const comerciosPorCP = cuenta(establecimientos, (e) => e.cp);

  // Municipios (código INE) y códigos postales oficiales (CNIG) de toda Castilla y León.
  const municipios = Object.fromEntries(Object.entries(LOC.municipios).map(([ine, [nombre, lat, lon]]) =>
    [ine, { ine, nombre, lat, lon, provincia: LOC.provincias[ine.slice(0, 2)] }]));

  // Una localidad que es cabecera de su municipio busca en todo el municipio (con sus pedanías).
  const localidades = LOC.localidades.map(([nombre, prov, lat, lon, ine]) => {
    const provincia = LOC.provincias[prov];
    const n = normaliza(nombre);
    const esMunicipio = Boolean(ine && normaliza(municipios[ine]?.nombre ?? "") === n);
    const comercios = esMunicipio ? comerciosPorMunicipio[ine] ?? 0 : comerciosPorLocalidad[`${provincia}|${n}`] ?? 0;
    return { tipo: "localidad", nombre, provincia, lat, lon, ine, esMunicipio, n, sin: sinArticulo(n), comercios };
  });

  const codigosPostales = Object.fromEntries(Object.entries(LOC.codigosPostales).map(([cp, ines]) => {
    const ms = ines.map((i) => municipios[i]);
    return [cp, {
      tipo: "cp", nombre: cp, cp, ines,
      provincia: LOC.provincias[cp.slice(0, 2)],
      descripcion: ms.map((m) => m.nombre).join(", "),
      lat: ms.reduce((t, m) => t + m.lat, 0) / ms.length,
      lon: ms.reduce((t, m) => t + m.lon, 0) / ms.length,
      comercios: comerciosPorCP[cp] ?? 0,
    }];
  }));

  function distanciaKm(a, b) {
    const rad = Math.PI / 180;
    const dLat = (b.lat - a.lat) * rad;
    const dLon = (b.lon - a.lon) * rad;
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
    return 12742 * Math.asin(Math.sqrt(h));
  }

  // ---- Sugerencias (combobox ARIA 1.2) ---------------------------------------------------

  let sugerencias = [];
  let activa = -1;
  let seleccion = null; // lugar elegido de la lista de sugerencias

  function buscaLugares(consulta, max = 8) {
    const c = normaliza(consulta);
    if (!c) return [];
    if (/^\d{1,5}$/.test(c)) {
      return Object.values(codigosPostales).filter((cp) => cp.cp.startsWith(c)).sort((a, b) => a.cp.localeCompare(b.cp)).slice(0, max);
    }
    const sinArt = sinArticulo(c);
    const puntua = (l) => (l.n === c || l.sin === sinArt ? 0 : l.n.startsWith(c) || l.sin.startsWith(sinArt) ? 1 : l.n.includes(c) ? 2 : 9);
    return localidades
      .map((l) => ({ l, p: puntua(l) }))
      .filter((x) => x.p < 9)
      .sort((a, b) => a.p - b.p || b.l.comercios - a.l.comercios || a.l.nombre.localeCompare(b.l.nombre, "es"))
      .slice(0, max)
      .map((x) => x.l);
  }

  function describeLugar(l) {
    const comercios = l.comercios ? ` · ${l.comercios} ${l.comercios === 1 ? "comercio" : "comercios"}` : "";
    if (l.tipo === "cp") return { principal: l.cp, extra: `${l.descripcion} · ${l.provincia}${comercios}` };
    const municipio = !l.esMunicipio && l.ine && municipios[l.ine] ? ` (municipio de ${municipios[l.ine].nombre})` : "";
    return { principal: l.nombre, extra: `${l.provincia}${municipio}${comercios}` };
  }

  function pintaSugerencias() {
    listbox.replaceChildren(...sugerencias.map((l, i) => {
      const { principal, extra } = describeLugar(l);
      const li = document.createElement("li");
      li.id = `sug-${i}`;
      li.setAttribute("role", "option");
      li.setAttribute("aria-selected", String(i === activa));
      li.append(principal, " ");
      const small = document.createElement("small");
      small.textContent = `· ${extra}`;
      li.append(small);
      li.addEventListener("mousedown", (ev) => ev.preventDefault());
      li.addEventListener("click", () => elige(i));
      return li;
    }));
    const abierta = sugerencias.length > 0;
    listbox.hidden = !abierta;
    q.setAttribute("aria-expanded", String(abierta));
    if (activa >= 0) {
      q.setAttribute("aria-activedescendant", `sug-${activa}`);
      $(`sug-${activa}`).scrollIntoView({ block: "nearest" });
    } else {
      q.removeAttribute("aria-activedescendant");
    }
  }

  function cierraSugerencias() {
    sugerencias = [];
    activa = -1;
    pintaSugerencias();
  }

  function elige(i) {
    const l = sugerencias[i];
    seleccion = l;
    q.value = l.tipo === "cp" ? l.cp : l.nombre;
    cierraSugerencias();
    buscar({ lugar: l });
  }

  let esperaSug;
  q.addEventListener("input", () => {
    seleccion = null;
    clearTimeout(esperaSug);
    esperaSug = setTimeout(() => {
      sugerencias = buscaLugares(q.value);
      activa = -1;
      pintaSugerencias();
    }, 120);
  });

  q.addEventListener("keydown", (ev) => {
    const abierta = sugerencias.length > 0;
    if (ev.key === "ArrowDown") {
      ev.preventDefault();
      if (!abierta) sugerencias = buscaLugares(q.value);
      activa = sugerencias.length ? (activa + 1) % sugerencias.length : -1;
      pintaSugerencias();
    } else if (ev.key === "ArrowUp" && abierta) {
      ev.preventDefault();
      activa = activa <= 0 ? sugerencias.length - 1 : activa - 1;
      pintaSugerencias();
    } else if (ev.key === "Enter" && abierta && activa >= 0) {
      ev.preventDefault();
      elige(activa);
    } else if (ev.key === "Escape") {
      if (abierta) {
        ev.preventDefault();
        cierraSugerencias();
      } else {
        q.value = "";
      }
    } else if (ev.key === "Tab") {
      cierraSugerencias();
    }
  });
  q.addEventListener("blur", () => setTimeout(cierraSugerencias, 150));

  // ---- Origen de la búsqueda -------------------------------------------------------------

  let origen = null; // { tipo, nombre, provincia?, lat, lon }

  function resuelveTexto(valor) {
    const c = normaliza(valor);
    if (!c) return null;
    if (/^\d{5}$/.test(c)) return codigosPostales[c] ?? { tipo: "cp-desconocido", nombre: c };
    if (/^\d+$/.test(c)) return { tipo: "cp-incompleto", nombre: c };
    const exactas = localidades.filter((l) => l.n === c || l.sin === sinArticulo(c));
    if (exactas.length) return exactas.sort((a, b) => b.comercios - a.comercios)[0];
    const parecidas = buscaLugares(valor, 1);
    return parecidas[0] ?? { tipo: "desconocido", nombre: valor.trim() };
  }

  function buscar({ lugar, provincia, foco = true } = {}) {
    if (provincia) {
      origen = { tipo: "provincia", nombre: provincia, provincia };
    } else {
      const l = lugar ?? seleccion ?? resuelveTexto(q.value);
      if (!l) {
        anunciar("Escribe una localidad o un código postal, o usa tu ubicación.");
        q.focus();
        return;
      }
      origen = l;
    }
    pagina = 1;
    pinta(foco);
  }

  form.addEventListener("submit", (ev) => {
    ev.preventDefault();
    cierraSugerencias();
    buscar();
  });

  for (const control of [selCategoria, selRadio]) {
    control.addEventListener("change", () => {
      if (origen) {
        pagina = 1;
        pinta(false);
      }
    });
  }
  let esperaTexto;
  texto.addEventListener("input", () => {
    clearTimeout(esperaTexto);
    esperaTexto = setTimeout(() => {
      if (origen) {
        pagina = 1;
        pinta(false);
      }
    }, 300);
  });

  // ---- Geolocalización -------------------------------------------------------------------

  function usarUbicacion() {
    if (!("geolocation" in navigator)) {
      estadoUbicacion.textContent = "Tu navegador no permite conocer tu ubicación. Escribe tu localidad.";
      return;
    }
    estadoUbicacion.textContent = "Buscando tu ubicación… Tu navegador te pedirá permiso. No guardamos tu ubicación.";
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const punto = { lat: pos.coords.latitude, lon: pos.coords.longitude };
        // Si varias localidades están a la misma distancia (pedanías situadas en el centro de
        // su municipio), se elige la que tiene más comercios.
        const cercana = localidades.reduce((mejor, l) => {
          const d = distanciaKm(punto, l);
          const empate = Math.abs(d - mejor.d) < 0.05;
          return (empate ? l.comercios > mejor.l.comercios : d < mejor.d) ? { l, d } : mejor;
        }, { l: null, d: Infinity });
        const fuera = cercana.d > 30;
        estadoUbicacion.textContent = fuera
          ? "Parece que estás fuera de Castilla y León. Te mostramos los comercios más cercanos."
          : `Ubicación encontrada, cerca de ${cercana.l.nombre}.`;
        q.value = "";
        seleccion = null;
        origen = { tipo: "ubicacion", nombre: "tu ubicación", ...punto, cercaDe: cercana.l };
        if (fuera && selRadio.value !== "0") selRadio.value = "0";
        pagina = 1;
        pinta(true);
      },
      (err) => {
        estadoUbicacion.textContent = err.code === err.PERMISSION_DENIED
          ? "No has dado permiso para usar tu ubicación. Escribe tu localidad o código postal."
          : "No hemos podido saber dónde estás. Escribe tu localidad o código postal.";
        q.focus();
      },
      { enableHighAccuracy: false, timeout: 15000, maximumAge: 300000 },
    );
  }
  $("ubicacion").addEventListener("click", usarUbicacion);

  // ---- Resultados ------------------------------------------------------------------------

  let pagina = 1;
  let resultados = [];

  // Zona del propio origen: la misma localidad, el mismo municipio o el mismo código postal.
  function zonaDe(e) {
    if (origen.tipo === "localidad") {
      if (e.claveLocalidad === `${origen.provincia}|${origen.n}`) return "localidad";
      if (origen.esMunicipio && e.municipio === origen.ine) return "municipio";
    }
    if (origen.tipo === "cp") {
      if (e.cp === origen.cp) return "cp";
      if (origen.ines.includes(e.municipio)) return "municipio";
    }
    return null;
  }

  const MAS_CERCANOS = 10;
  let soloCercanos = false; // no hay nada en el radio: se muestran los más cercanos

  function calcula() {
    const cat = selCategoria.value;
    const radio = Number(selRadio.value);
    const palabras = normaliza(texto.value).split(" ").filter(Boolean);
    const filtrados = establecimientos.filter((e) =>
      (!cat || e.categoria === cat) && palabras.every((p) => e.buscable.includes(p)));
    soloCercanos = false;

    if (origen.tipo === "provincia") {
      return filtrados
        .filter((e) => e.provincia === origen.provincia)
        .map((e) => ({ e, d: null }))
        .sort((a, b) => a.e.localidad.localeCompare(b.e.localidad, "es") || a.e.nombre.localeCompare(b.e.nombre, "es"));
    }
    const ordenados = filtrados
      .filter((e) => e.lat != null)
      .map((e) => {
        const z = zonaDe(e);
        return { e, z, d: z ? 0 : distanciaKm(origen, e) };
      })
      .sort((a, b) => a.d - b.d || a.e.localidad.localeCompare(b.e.localidad, "es") || a.e.nombre.localeCompare(b.e.nombre, "es"));
    const enRadio = ordenados.filter((r) => !radio || r.d <= radio);
    if (enRadio.length || !ordenados.length) return enRadio;
    // Aunque no haya ninguno en el radio elegido, se muestran los más cercanos.
    soloCercanos = true;
    return ordenados.slice(0, MAS_CERCANOS);
  }

  function aLugar() {
    if (origen.tipo === "ubicacion") return "a tu ubicación";
    if (origen.tipo === "cp") return `al código postal ${origen.cp} (${origen.descripcion})`;
    return `a ${origen.nombre} (${origen.provincia})`;
  }

  function textoOrigen() {
    if (origen.tipo === "provincia") return `en la provincia de ${origen.nombre}`;
    if (origen.tipo === "ubicacion") return "cerca de tu ubicación";
    if (origen.tipo === "cp") return `cerca del código postal ${origen.cp} (${origen.descripcion})`;
    if (origen.tipo === "localidad" && origen.esMunicipio) return `cerca de ${origen.nombre} y su municipio (${origen.provincia})`;
    return `cerca de ${origen.nombre} (${origen.provincia})`;
  }

  function pinta(moverFoco) {
    inicio.hidden = true;
    nota.replaceChildren();
    actualizaUrl();

    if (["desconocido", "cp-desconocido", "cp-incompleto"].includes(origen.tipo)) {
      resultados = [];
      const deCyL = LOC.provincias[origen.nombre.slice(0, 2)];
      titulo.textContent = {
        "cp-desconocido": deCyL ? `No encontramos el código postal ${origen.nombre}` : `El código postal ${origen.nombre} no es de Castilla y León`,
        "cp-incompleto": "El código postal debe tener 5 cifras",
        desconocido: `No encontramos «${origen.nombre}»`,
      }[origen.tipo];
      const p = document.createElement("p");
      p.textContent = origen.tipo === "desconocido"
        ? "Revisa cómo está escrito o elige una de las sugerencias que aparecen al escribir."
        : deCyL || origen.tipo === "cp-incompleto"
          ? "Revísalo o escribe el nombre de tu localidad o municipio."
          : "La Tarjeta Familia solo se puede usar en comercios de Castilla y León.";
      nota.append(p);
      lista.replaceChildren();
      zonaMas.hidden = true;
      grupoVista.hidden = true;
      actualizaMapa();
      anunciar(titulo.textContent);
      if (moverFoco) q.focus();
      return;
    }

    resultados = calcula();
    const total = resultados.length;
    const radio = Number(selRadio.value);
    const filtroCat = selCategoria.value ? ` de ${nombreCategoria[selCategoria.value].toLowerCase()}` : "";
    const enRadio = origen.tipo !== "provincia" && radio ? ` a menos de ${radio} km` : "";
    titulo.textContent = soloCercanos
      ? `${total === 1 ? "El comercio" : `Los ${total} comercios`}${filtroCat} más ${total === 1 ? "cercano" : "cercanos"} ${aLugar()}`
      : total
        ? `${total.toLocaleString("es-ES")} ${total === 1 ? "comercio" : "comercios"}${filtroCat}${enRadio} ${textoOrigen()}`
        : `No hay comercios colaboradores${filtroCat}${enRadio} ${textoOrigen()}`;

    if (soloCercanos) {
      const p = document.createElement("p");
      p.className = "aviso aviso--info";
      p.textContent = `No hay comercios colaboradores${filtroCat} a menos de ${radio} km. Te mostramos los más cercanos. Recuerda que también puedes pagar en otras tiendas de un sector autorizado.`;
      nota.append(p);
    } else if (!total) {
      const p = document.createElement("p");
      p.append("Recuerda que también puedes pagar en otras tiendas de un ");
      const a = document.createElement("a");
      a.href = `${RAIZ}comercios/sectores.html`;
      a.textContent = "sector autorizado";
      p.append(a, ", aunque no sean colaboradoras.");
      nota.append(p);
      if (radio && radio < 50 && origen.tipo !== "provincia") {
        const ampliar = document.createElement("button");
        ampliar.type = "button";
        ampliar.className = "boton boton--secundario";
        const siguiente = radio < 10 ? 10 : radio < 25 ? 25 : 50;
        ampliar.textContent = `Buscar hasta ${siguiente} km`;
        ampliar.addEventListener("click", () => {
          selRadio.value = String(siguiente);
          pagina = 1;
          pinta(true);
        });
        nota.append(ampliar);
      }
    } else if (origen.tipo !== "provincia") {
      const mismo = resultados.filter((r) => r.d === 0).length;
      if (mismo > POR_PAGINA && !texto.value && !selCategoria.value) {
        const p = document.createElement("p");
        p.className = "aproximada";
        p.textContent = `Hay ${mismo} comercios en ${origen.tipo === "cp" ? "tu zona" : origen.nombre}. Para encontrar uno concreto, elige el tipo de comercio o escribe el nombre, la calle o lo que necesitas (por ejemplo: farmacia, zapatería).`;
        nota.append(p);
      }
    }

    lista.replaceChildren();
    pintaPagina(false);
    grupoVista.hidden = total === 0;
    actualizaMapa();
    anunciar(titulo.textContent);
    if (moverFoco) titulo.focus();
  }

  function pintaPagina(enfocarPrimero) {
    const desde = (pagina - 1) * POR_PAGINA;
    const trozo = resultados.slice(desde, desde + POR_PAGINA);
    const nuevos = trozo.map(({ e, d, z }) => tarjeta(e, d, z));
    lista.append(...nuevos);
    const quedan = resultados.length - desde - trozo.length;
    zonaMas.hidden = quedan <= 0;
    botonMas.textContent = `Mostrar ${Math.min(quedan, POR_PAGINA)} más (quedan ${quedan})`;
    if (enfocarPrimero && nuevos[0]) nuevos[0].querySelector("article").focus();
  }

  botonMas.addEventListener("click", () => {
    pagina++;
    pintaPagina(true);
    actualizaMapa();
    anunciar(`Mostrando ${lista.children.length} de ${resultados.length}.`);
  });

  function enlaceRuta(e) {
    const destino = `${e.nombre}, ${e.direccion}, ${e.cp} ${e.localidad}`;
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(destino)}`;
  }

  const TEXTO_ZONA = { localidad: "En esta localidad", municipio: "En este municipio", cp: "En este código postal" };

  function tarjeta(e, d, z) {
    const li = document.createElement("li");
    const art = document.createElement("article");
    art.className = "establecimiento";
    art.tabIndex = -1;
    art.id = `est-${e.id}`;
    art.setAttribute("aria-labelledby", `nom-${e.id}`);

    const h3 = document.createElement("h3");
    h3.id = `nom-${e.id}`;
    h3.textContent = e.nombre;

    const meta = document.createElement("p");
    meta.className = "meta";
    const cat = document.createElement("span");
    cat.className = "etiqueta-cat";
    cat.textContent = nombreCategoria[e.categoria];
    meta.append(cat);
    if (d != null) {
      const dist = document.createElement("span");
      dist.className = "distancia";
      dist.textContent = z ? TEXTO_ZONA[z] : `A ${formatoKm(d)} aprox.`;
      meta.append(dist);
    }

    const dir = document.createElement("p");
    dir.append(e.direccion, document.createElement("br"), `${e.cp} ${e.localidad} (${e.provincia})`);

    art.append(h3, meta, dir);
    if (e.precision === "municipio" || e.precision === "codigo-postal") {
      const aprox = document.createElement("p");
      aprox.className = "aproximada";
      aprox.textContent = "Ubicación aproximada: se usa el centro del municipio.";
      art.append(aprox);
    }

    const acciones = document.createElement("p");
    acciones.className = "acciones";
    const ruta = document.createElement("a");
    ruta.className = "boton boton--pequeno boton--secundario";
    ruta.href = enlaceRuta(e);
    ruta.innerHTML = 'Cómo llegar<span class="visualmente-oculto"></span>';
    ruta.querySelector("span").textContent = ` a ${e.nombre}`;
    acciones.append(ruta);
    if (vista === "mapa" && e.lat != null) {
      const ver = document.createElement("button");
      ver.type = "button";
      ver.className = "boton boton--pequeno boton--secundario";
      ver.innerHTML = 'Ver en el mapa<span class="visualmente-oculto"></span>';
      ver.querySelector("span").textContent = `: ${e.nombre}`;
      ver.addEventListener("click", () => enfocaEnMapa(e));
      acciones.append(ver);
    }
    art.append(acciones);
    li.append(art);
    return li;
  }

  let ultimoAnuncio = "";
  function anunciar(mensaje) {
    // Se vacía y se rellena para que el lector de pantalla lo lea aunque se repita.
    anuncio.textContent = "";
    ultimoAnuncio = mensaje;
    setTimeout(() => { anuncio.textContent = ultimoAnuncio; }, 60);
  }

  // ---- Mapa (opcional) ---------------------------------------------------------------------

  let vista = "lista";
  try { vista = localStorage.getItem("tf-vista") === "mapa" ? "mapa" : "lista"; } catch { /* sin almacenamiento */ }
  let mapa = null;
  let capa = null;
  let marcadores = new Map();
  let cargandoLeaflet = null;

  function cargaLeaflet() {
    if (window.L) return Promise.resolve();
    cargandoLeaflet ??= new Promise((ok, mal) => {
      const s = document.createElement("script");
      s.src = `${RAIZ}vendor/leaflet/leaflet.js`;
      s.onload = ok;
      s.onerror = mal;
      document.head.append(s);
    });
    return cargandoLeaflet;
  }

  function cambiaVista(nueva) {
    vista = nueva;
    try { localStorage.setItem("tf-vista", vista); } catch { /* sin almacenamiento */ }
    for (const b of grupoVista.querySelectorAll("button")) b.setAttribute("aria-pressed", String(b.dataset.vista === vista));
    if (origen) {
      lista.replaceChildren();
      const paginas = pagina;
      for (pagina = 1; pagina <= paginas; pagina++) pintaPagina(false);
      pagina = paginas;
    }
    actualizaMapa();
  }
  for (const b of grupoVista.querySelectorAll("button")) b.addEventListener("click", () => cambiaVista(b.dataset.vista));
  for (const b of grupoVista.querySelectorAll("button")) b.setAttribute("aria-pressed", String(b.dataset.vista === vista));

  async function actualizaMapa() {
    const mostrar = vista === "mapa" && resultados.length > 0;
    mapaEl.hidden = !mostrar;
    zona.classList.toggle("con-mapa", mostrar);
    if (!mostrar) return;
    try {
      await cargaLeaflet();
    } catch {
      mapaEl.textContent = "No se ha podido cargar el mapa. La lista tiene toda la información.";
      return;
    }
    if (!mapa) {
      mapa = L.map(mapaEl, { scrollWheelZoom: false }).setView([41.65, -4.72], 7);
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 18,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">colaboradores de OpenStreetMap</a>',
      }).addTo(mapa);
    }
    mapa.invalidateSize();
    capa?.remove();
    capa = L.layerGroup().addTo(mapa);
    marcadores = new Map();

    // Los comercios de una misma localidad comparten coordenadas: un marcador por punto.
    const visibles = resultados.slice(0, lista.children.length).filter((r) => r.e.lat != null);
    const grupos = new Map();
    for (const { e } of visibles) {
      const k = `${e.lat},${e.lon}`;
      if (!grupos.has(k)) grupos.set(k, []);
      grupos.get(k).push(e);
    }
    const limites = [];
    for (const [k, comercios] of grupos) {
      const [lat, lon] = k.split(",").map(Number);
      const n = comercios.length;
      const icono = L.divIcon({
        className: "",
        html: `<span style="display:grid;place-items:center;width:34px;height:34px;border-radius:50%;background:#b0141d;color:#fff;font:700 14px system-ui;border:3px solid #fff;box-shadow:0 1px 4px rgb(0 0 0 / 40%)">${n}</span>`,
        iconSize: [34, 34],
        iconAnchor: [17, 17],
      });
      const etiqueta = `${comercios[0].localidad}: ${n} ${n === 1 ? "comercio" : "comercios"}`;
      const m = L.marker([lat, lon], { icon: icono, title: etiqueta, alt: etiqueta, keyboard: true }).addTo(capa);
      const cont = document.createElement("div");
      const h = document.createElement("strong");
      h.textContent = etiqueta;
      const ul = document.createElement("ul");
      ul.style.paddingLeft = "1.1rem";
      ul.style.margin = "0.4rem 0 0";
      for (const e of comercios.slice(0, 8)) {
        const li = document.createElement("li");
        const a = document.createElement("a");
        a.href = `#est-${e.id}`;
        a.textContent = e.nombre;
        a.addEventListener("click", (ev) => {
          ev.preventDefault();
          const art = document.getElementById(`est-${e.id}`);
          art?.focus();
          art?.scrollIntoView({ block: "center" });
        });
        li.append(a);
        ul.append(li);
      }
      if (n > 8) {
        const li = document.createElement("li");
        li.textContent = `y ${n - 8} más en la lista`;
        ul.append(li);
      }
      cont.append(h, ul);
      m.bindPopup(cont);
      for (const e of comercios) marcadores.set(e.id, m);
      limites.push([lat, lon]);
    }
    if (origen.lat != null) {
      L.circleMarker([origen.lat, origen.lon], { radius: 8, color: "#0b57d0", weight: 3, fillColor: "#fff", fillOpacity: 1 })
        .bindTooltip(origen.tipo === "ubicacion" ? "Tu ubicación" : origen.nombre)
        .addTo(capa);
      limites.push([origen.lat, origen.lon]);
    }
    if (limites.length) mapa.fitBounds(limites, { padding: [30, 30], maxZoom: 13 });
  }

  function enfocaEnMapa(e) {
    const m = marcadores.get(e.id);
    if (!m) return;
    mapa.setView(m.getLatLng(), Math.max(mapa.getZoom(), 13));
    m.openPopup();
    mapaEl.scrollIntoView({ block: "nearest" });
    document.querySelectorAll(".establecimiento.activo").forEach((x) => x.classList.remove("activo"));
    document.getElementById(`est-${e.id}`)?.classList.add("activo");
  }

  // ---- Estado en la URL ----------------------------------------------------------------------

  function actualizaUrl() {
    const p = new URLSearchParams();
    if (origen.tipo === "provincia") p.set("provincia", origen.provincia);
    else if (origen.tipo !== "ubicacion") p.set("q", origen.tipo === "cp" ? origen.cp : origen.nombre);
    if (selCategoria.value) p.set("cat", selCategoria.value);
    if (selRadio.value !== "25") p.set("km", selRadio.value);
    if (texto.value.trim()) p.set("texto", texto.value.trim());
    history.replaceState(null, "", `${location.pathname}${p.size ? `?${p}` : ""}`);
  }

  // ---- Arranque --------------------------------------------------------------------------------

  const opcionTodas = new Option(`Todos (${DATOS.total.toLocaleString("es-ES")})`, "");
  selCategoria.append(opcionTodas, ...DATOS.categorias.map((c) => new Option(`${c.nombre} (${c.total})`, c.id)));

  const provincias = Object.values(LOC.provincias).sort((a, b) => a.localeCompare(b, "es"));
  $("provincias").append(...provincias.map((prov) => {
    const li = document.createElement("li");
    const b = document.createElement("button");
    b.type = "button";
    b.className = "boton boton--pequeno boton--secundario";
    const n = establecimientos.filter((e) => e.provincia === prov).length;
    b.textContent = `${prov} (${n})`;
    b.addEventListener("click", () => buscar({ provincia: prov }));
    li.append(b);
    return li;
  }));

  contenedor.hidden = false;

  const params = new URLSearchParams(location.search);
  if (params.get("cat") && nombreCategoria[params.get("cat")]) selCategoria.value = params.get("cat");
  if (["5", "10", "25", "50", "0"].includes(params.get("km"))) selRadio.value = params.get("km");
  if (params.get("texto")) texto.value = params.get("texto");
  if (params.get("provincia") && provincias.includes(params.get("provincia"))) {
    buscar({ provincia: params.get("provincia"), foco: false });
  } else if (params.get("q")) {
    q.value = params.get("q");
    buscar({ foco: false });
  } else if (params.get("cerca") === "1") {
    // Viene del botón «Usar mi ubicación» de la portada: la persona ya lo ha pedido.
    usarUbicacion();
  }
})();
