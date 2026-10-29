// Buscador de comercios colaboradores.
//
// Datos: window.DATOS_ESTABLECIMIENTOS y window.DATOS_LOCALIDADES (data/*.js, generados por
// scripts/geocodificar.mjs). Textos: window.TF (assets/js/i18n.js). La lista de resultados es
// la vista principal; el mapa (Leaflet) es opcional, se carga solo si se pide y muestra
// exactamente lo mismo que la lista.

(() => {
  const RAIZ = new URL("../../", document.currentScript.src);
  const POR_PAGINA = 20;
  const MAS_CERCANOS = 10;
  const DATOS = window.DATOS_ESTABLECIMIENTOS;
  const LOC = window.DATOS_LOCALIDADES;
  const { t, p, num } = TF;
  const { normaliza } = Sugerencias;
  const ordenES = (a, b) => a.localeCompare(b, "es");

  const $ = (id) => document.getElementById(id);
  const form = $("form-busqueda");
  const q = $("q");
  const selCategoria = $("categoria");
  const selRadio = $("radio");
  const texto = $("texto");
  const titulo = $("titulo-resultados");
  const lista = $("lista");
  const nota = $("nota-resultados");
  const botonMas = $("mas");
  const grupoVista = document.querySelector(".vista");
  const mapaEl = $("mapa");
  const estadoUbicacion = $("estado-ubicacion");

  const formatoKm = (km) => (km < 1 ? t("menos_1km") : t("km", { n: num(km, { maximumFractionDigits: km < 10 ? 1 : 0 }) }));
  const crea = (etiqueta, props = {}, ...hijos) => {
    const el = Object.assign(document.createElement(etiqueta), props);
    el.append(...hijos);
    return el;
  };
  const oculto = (textoOculto) => crea("span", { className: "visualmente-oculto", textContent: textoOculto });

  // ---- Índices ------------------------------------------------------------------------

  // El texto libre busca en el nombre, la dirección y el tipo de comercio (en español y
  // en el idioma de la página).
  const establecimientos = DATOS.establecimientos.map((e) => ({
    ...e,
    claveLocalidad: `${e.provincia}|${normaliza(e.localidad)}`,
    buscable: normaliza(`${e.nombre} ${e.direccion} ${DATOS.categorias.find((c) => c.id === e.categoria)?.nombre ?? ""} ${TF.categoria(e.categoria)}`),
  }));
  const lugares = Sugerencias.indices(LOC);
  const { localidades } = lugares;

  function distanciaKm(a, b) {
    const rad = Math.PI / 180;
    const dLat = (b.lat - a.lat) * rad;
    const dLon = (b.lon - a.lon) * rad;
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
    return 12742 * Math.asin(Math.sqrt(h));
  }

  // ---- Origen de la búsqueda -------------------------------------------------------------

  const combo = Sugerencias.crear({ input: q, listbox: $("sugerencias"), indices: lugares, alElegir: (lugar) => buscar({ lugar }) });
  let origen = null; // { tipo, nombre, provincia?, lat, lon, … }
  let pagina = 1;
  let resultados = [];
  let soloCercanos = false; // no hay nada en el radio: se muestran los más cercanos
  let producto = null; // lo que se quiere comprar (asistente): { id, cats, nombre }

  function buscar({ lugar, provincia, foco = true } = {}) {
    if (provincia) {
      origen = { tipo: "provincia", nombre: provincia, provincia };
    } else {
      // Asistente: «pañales cerca de Villafranca» → producto + lugar.
      if (!lugar && !combo.seleccion() && q.value.trim()) {
        const r = Asistente.interpreta(q.value, lugares);
        const valido = r.lugar && ["localidad", "cp"].includes(r.lugar.tipo);
        if (r.producto || r.cerca || (valido && lugares.resuelve(q.value).tipo === "desconocido")) {
          if (r.producto) producto = r.producto;
          if (valido) {
            lugar = r.lugar;
            q.value = lugar.tipo === "cp" ? lugar.cp : lugar.nombre;
          } else {
            q.value = "";
            if (r.cerca) usarUbicacion();
            else pideLugar(foco);
            return;
          }
        }
      }
      origen = lugar ?? combo.seleccion() ?? lugares.resuelve(q.value);
      if (!origen) {
        anunciar(t("escribe_lugar"));
        q.focus();
        return;
      }
    }
    pagina = 1;
    pinta(foco);
  }

  const repinta = () => {
    if (!origen) return;
    pagina = 1;
    pinta(false);
  };
  form.addEventListener("submit", (ev) => {
    ev.preventDefault();
    combo.cerrar();
    buscar();
  });
  selCategoria.addEventListener("change", () => {
    if (selCategoria.value) producto = null;
    repinta();
  });
  selRadio.addEventListener("change", repinta);
  let esperaTexto;
  texto.addEventListener("input", () => {
    clearTimeout(esperaTexto);
    esperaTexto = setTimeout(repinta, 300);
  });

  // ---- Geolocalización -------------------------------------------------------------------

  function usarUbicacion() {
    if (!("geolocation" in navigator)) {
      estadoUbicacion.textContent = t("geo_no_soportado");
      return;
    }
    estadoUbicacion.textContent = t("geo_buscando");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const punto = { lat: pos.coords.latitude, lon: pos.coords.longitude };
        // Si varias localidades están a la misma distancia (pedanías situadas en el centro
        // de su municipio), se elige la que tiene más comercios.
        const cercana = localidades.reduce((mejor, l) => {
          const d = distanciaKm(punto, l);
          const empate = Math.abs(d - mejor.d) < 0.05;
          return (empate ? l.comercios > mejor.l.comercios : d < mejor.d) ? { l, d } : mejor;
        }, { l: null, d: Infinity });
        const fuera = cercana.d > 30;
        estadoUbicacion.textContent = fuera ? t("geo_fuera") : t("geo_encontrada", { lugar: cercana.l.nombre });
        q.value = "";
        combo.olvidar();
        origen = { tipo: "ubicacion", ...punto };
        if (fuera) selRadio.value = "0";
        pagina = 1;
        pinta(true);
      },
      (err) => {
        estadoUbicacion.textContent = t(err.code === err.PERMISSION_DENIED ? "geo_denegada" : "geo_error");
        q.focus();
      },
      { enableHighAccuracy: false, timeout: 15000, maximumAge: 300000 },
    );
  }
  $("ubicacion").addEventListener("click", usarUbicacion);

  // ---- Cálculo de resultados ---------------------------------------------------------------

  // Zona del propio origen: la misma localidad, el mismo municipio o el mismo código postal.
  function zonaDe(e) {
    if (origen.tipo === "localidad") {
      if (e.claveLocalidad === `${origen.provincia}|${origen.n}`) return "localidad";
      if (e.municipio === origen.ine) return "municipio";
    }
    if (origen.tipo === "cp") {
      if (e.cp === origen.cp) return "cp";
      if (origen.ines.includes(e.municipio)) return "municipio";
    }
    return null;
  }

  // Producto activo: el elegido con el asistente o el que se escribe en el texto libre
  // («pañales»). Una categoría elegida en la lista manda sobre el producto.
  function productoActivo() {
    if (selCategoria.value) return null;
    return producto ?? Asistente.separa(texto.value).producto;
  }

  function calcula() {
    const cat = selCategoria.value;
    const prod = productoActivo();
    const radio = Number(selRadio.value);
    const palabras = Asistente.separa(texto.value).resto.split(" ").filter(Boolean);
    const filtrados = establecimientos.filter((e) =>
      (cat ? e.categoria === cat : !prod || prod.cats.includes(e.categoria)) && palabras.every((pal) => e.buscable.includes(pal)));
    soloCercanos = false;

    if (origen.tipo === "provincia") {
      return filtrados
        .filter((e) => e.provincia === origen.provincia)
        .map((e) => ({ e, d: null }))
        .sort((a, b) => ordenES(a.e.localidad, b.e.localidad) || ordenES(a.e.nombre, b.e.nombre));
    }
    const ordenados = filtrados
      .filter((e) => e.lat != null)
      .map((e) => {
        const z = zonaDe(e);
        return { e, z, d: z ? 0 : distanciaKm(origen, e) };
      })
      .sort((a, b) => a.d - b.d || ordenES(a.e.localidad, b.e.localidad) || ordenES(a.e.nombre, b.e.nombre));
    const enRadio = ordenados.filter((r) => !radio || r.d <= radio);
    if (enRadio.length || !ordenados.length) return enRadio;
    // Aunque no haya ninguno en el radio elegido, se muestran los más cercanos.
    soloCercanos = true;
    return ordenados.slice(0, MAS_CERCANOS);
  }

  function textoOrigen() {
    const { tipo, nombre: l, provincia: prov } = origen;
    if (tipo === "provincia") return t("origen_provincia", { p: prov });
    if (tipo === "ubicacion") return t("origen_ubicacion");
    if (tipo === "cp") return t("origen_cp", { cp: origen.cp, desc: origen.descripcion });
    return t(origen.esMunicipio ? "origen_municipio" : "origen_localidad", { l, p: prov });
  }

  function aLugar() {
    if (origen.tipo === "ubicacion") return t("a_ubicacion");
    if (origen.tipo === "cp") return t("a_cp", { cp: origen.cp, desc: origen.descripcion });
    return t("a_localidad", { l: origen.nombre, p: origen.provincia });
  }

  // ---- Pintado -----------------------------------------------------------------------------

  // Qué tipos de comercio se muestran para un producto, con un botón para quitar el filtro.
  function notaProducto(prod) {
    const tipos = crea("ul", { className: "tipos-producto" },
      ...prod.cats.map((c) => crea("li", {}, crea("span", { className: "etiqueta-cat", textContent: TF.categoria(c) }))));
    const quitar = crea("button", { type: "button", className: "boton boton--pequeno boton--secundario", textContent: t("producto_quitar") });
    quitar.addEventListener("click", () => {
      producto = null;
      if (Asistente.separa(texto.value).producto) texto.value = "";
      repinta();
      titulo.focus();
    });
    return crea("div", { className: "aviso aviso--info nota-producto" },
      crea("p", { textContent: t("producto_nota", { p: prod.nombre }) }), tipos, crea("p", {}, quitar));
  }

  // Se sabe qué se quiere comprar pero no dónde: se pide el lugar.
  function pideLugar(moverFoco) {
    titulo.textContent = t("donde_producto", { p: producto.nombre });
    nota.replaceChildren(crea("p", { textContent: t("donde_producto_nota") }));
    actualizaUrl();
    anunciar(`${titulo.textContent} ${t("donde_producto_nota")}`);
    if (moverFoco) q.focus();
  }

  function pintaNoEncontrado(moverFoco) {
    resultados = [];
    const deCyL = Boolean(LOC.provincias[origen.nombre.slice(0, 2)]);
    const claves = {
      "cp-desconocido": [deCyL ? "cp_desconocido" : "cp_fuera", deCyL ? "nota_cp_revisa" : "nota_fuera"],
      "cp-incompleto": ["cp_incompleto", "nota_cp_revisa"],
      desconocido: ["desconocido", "nota_desconocido"],
    }[origen.tipo];
    titulo.textContent = t(claves[0], { cp: origen.nombre, q: origen.nombre });
    nota.append(crea("p", { textContent: t(claves[1]) }));
    lista.replaceChildren();
    botonMas.parentElement.hidden = true;
    grupoVista.hidden = true;
    actualizaMapa();
    anunciar(titulo.textContent);
    if (moverFoco) q.focus();
  }

  function pinta(moverFoco) {
    $("inicio-busqueda").hidden = true;
    nota.replaceChildren();
    actualizaUrl();
    if (["desconocido", "cp-desconocido", "cp-incompleto"].includes(origen.tipo)) {
      pintaNoEncontrado(moverFoco);
      return;
    }

    resultados = calcula();
    const total = resultados.length;
    const radio = Number(selRadio.value);
    let nombreCat = selCategoria.value ? TF.categoria(selCategoria.value) : "";
    if (TF.textos.filtro_cat_minusculas) nombreCat = nombreCat.toLocaleLowerCase(TF.locale);
    const prod = productoActivo();
    const vars = {
      cat: nombreCat ? t("filtro_cat", { cat: nombreCat }) : prod ? t("filtro_producto", { p: prod.nombre }) : "",
      radio: origen.tipo !== "provincia" && radio ? t("filtro_radio", { km: radio }) : "",
      origen: textoOrigen(),
      km: radio,
    };
    if (soloCercanos) titulo.textContent = p("titulo_cercanos", total, { ...vars, a: aLugar() });
    else titulo.textContent = total ? p("titulo_resultados", total, vars) : t("titulo_ninguno", vars);

    if (prod) nota.append(notaProducto(prod));
    if (soloCercanos) {
      nota.append(crea("p", { className: "aviso aviso--info", textContent: t("aviso_cercanos", vars) }));
    } else if (!total) {
      nota.append(parrafoSector());
      if (radio && radio < 50 && origen.tipo !== "provincia") {
        const siguiente = radio < 10 ? 10 : radio < 25 ? 25 : 50;
        const ampliar = crea("button", { type: "button", className: "boton boton--secundario", textContent: t("ampliar", { km: siguiente }) });
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
        const zona = origen.tipo === "cp" ? t("tu_zona") : origen.nombre;
        nota.append(crea("p", { className: "aproximada", textContent: t("muchos_en_zona", { n: mismo, zona }) }));
      }
      if (origen.aproximada) {
        const m = lugares.municipios[origen.ine].nombre;
        nota.append(crea("p", { className: "aproximada", textContent: t("origen_aproximado", { l: origen.nombre, m }) }));
      }
    }

    lista.replaceChildren();
    pintaPagina(false);
    grupoVista.hidden = total === 0;
    actualizaMapa();
    anunciar(titulo.textContent);
    if (moverFoco) titulo.focus();
  }

  // «También puedes pagar en otras tiendas de un [sector autorizado]…»
  function parrafoSector() {
    const [antes, despues] = t("recuerda_sector").split("{enlace}");
    const enlace = crea("a", { href: new URL("../comercios/sectores.html", location.href).href, textContent: t("sector_autorizado") });
    return crea("p", {}, antes, enlace, despues ?? "");
  }

  function pintaPagina(enfocarPrimero) {
    const desde = (pagina - 1) * POR_PAGINA;
    const trozo = resultados.slice(desde, desde + POR_PAGINA);
    const nuevos = trozo.map(({ e, d, z }) => tarjeta(e, d, z));
    lista.append(...nuevos);
    const quedan = resultados.length - desde - trozo.length;
    botonMas.parentElement.hidden = quedan <= 0;
    botonMas.textContent = t("mostrar_mas", { n: Math.min(quedan, POR_PAGINA), q: quedan });
    if (enfocarPrimero && nuevos[0]) nuevos[0].querySelector("article").focus();
  }

  botonMas.addEventListener("click", () => {
    pagina++;
    pintaPagina(true);
    actualizaMapa();
    anunciar(t("mostrando", { n: lista.children.length, t: resultados.length }));
  });

  // Ruta en Google Maps hasta el comercio (por nombre y dirección, que Google reconoce mejor
  // que unas coordenadas aproximadas).
  const enlaceRuta = (e) =>
    `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(`${e.nombre}, ${e.direccion}, ${e.cp} ${e.localidad}`)}`;

  function tarjeta(e, d, z) {
    const meta = crea("p", { className: "meta" }, crea("span", { className: "etiqueta-cat", textContent: TF.categoria(e.categoria) }));
    if (d != null) {
      meta.append(crea("span", { className: "distancia", textContent: z ? t(`zona_${z}`) : t("distancia", { d: formatoKm(d) }) }));
    }
    const direccion = crea("p", { lang: "es" }, e.direccion, document.createElement("br"), `${e.cp} ${e.localidad} (${e.provincia})`);
    const art = crea("article", { className: "establecimiento", tabIndex: -1, id: `est-${e.id}` },
      crea("h3", { id: `nom-${e.id}`, lang: "es", textContent: e.nombre }), meta, direccion);
    art.setAttribute("aria-labelledby", `nom-${e.id}`);
    if (e.precision === "municipio" || e.precision === "codigo-postal") {
      art.append(crea("p", { className: "aproximada", textContent: t("ubicacion_aproximada") }));
    }

    const acciones = crea("p", { className: "acciones" },
      crea("a", { className: "boton boton--pequeno boton--secundario", href: enlaceRuta(e) },
        t("como_llegar"), oculto(t("como_llegar_a", { nombre: e.nombre }))));
    if (vista === "mapa" && e.lat != null) {
      const ver = crea("button", { type: "button", className: "boton boton--pequeno boton--secundario" }, t("ver_mapa"), oculto(`: ${e.nombre}`));
      ver.addEventListener("click", () => enfocaEnMapa(e));
      acciones.append(ver);
    }
    art.append(acciones);
    const enlaceError = crea("a", { href: enlaceErrorComercio(e) }, t("error_comercio"), oculto(`: ${e.nombre}`));
    art.append(crea("p", { className: "error-dato" }, enlaceError));
    return crea("li", {}, art);
  }

  // Aviso de un dato erróneo: por correo si está configurado (src/config.json) y, si no,
  // como incidencia de GitHub con el comercio ya identificado.
  function enlaceErrorComercio(e) {
    const asunto = t("error_comercio_asunto", { nombre: e.nombre, localidad: e.localidad });
    const cuerpo = `${e.nombre}\n${e.direccion}\n${e.cp} ${e.localidad} (${e.provincia})\n\n`;
    const correo = TF.textos.correo_errores;
    if (correo) return `mailto:${correo}?subject=${encodeURIComponent(asunto)}&body=${encodeURIComponent(cuerpo)}`;
    return `https://github.com/${TF.textos.repositorio}/issues/new?title=${encodeURIComponent(asunto)}&body=${encodeURIComponent(cuerpo)}`;
  }

  let ultimoAnuncio = "";
  function anunciar(mensaje) {
    // Se vacía y se rellena para que el lector de pantalla lo lea aunque se repita.
    const anuncio = $("anuncio");
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
      document.head.append(crea("script", { src: `${RAIZ}vendor/leaflet/leaflet.js`, onload: ok, onerror: mal }));
    });
    return cargandoLeaflet;
  }

  function marcaVista() {
    for (const b of grupoVista.querySelectorAll("button")) b.setAttribute("aria-pressed", String(b.dataset.vista === vista));
  }

  function cambiaVista(nueva) {
    vista = nueva;
    try { localStorage.setItem("tf-vista", vista); } catch { /* sin almacenamiento */ }
    marcaVista();
    if (origen) {
      // Se vuelven a pintar las mismas páginas, ahora con (o sin) «Ver en el mapa».
      lista.replaceChildren();
      const paginas = pagina;
      for (pagina = 1; pagina <= paginas; pagina++) pintaPagina(false);
      pagina = paginas;
    }
    actualizaMapa();
  }
  for (const b of grupoVista.querySelectorAll("button")) b.addEventListener("click", () => cambiaVista(b.dataset.vista));
  marcaVista();

  function popup(comercios, etiqueta, variasLocalidades) {
    const ul = crea("ul", { className: "popup-lista" });
    for (const e of comercios.slice(0, 8)) {
      const a = crea("a", { href: `#est-${e.id}`, lang: "es", textContent: variasLocalidades ? `${e.nombre} (${e.localidad})` : e.nombre });
      a.addEventListener("click", (ev) => {
        ev.preventDefault();
        const art = $(`est-${e.id}`);
        art?.focus();
        art?.scrollIntoView({ block: "center" });
      });
      ul.append(crea("li", {}, a));
    }
    if (comercios.length > 8) ul.append(crea("li", { textContent: t("mapa_mas", { n: comercios.length - 8 }) }));
    return crea("div", {}, crea("strong", { textContent: etiqueta }), ul);
  }

  async function actualizaMapa() {
    const mostrar = vista === "mapa" && resultados.length > 0;
    mapaEl.hidden = !mostrar;
    $("zona-resultados").classList.toggle("con-mapa", mostrar);
    if (!mostrar) return;
    try {
      await cargaLeaflet();
    } catch {
      mapaEl.textContent = t("mapa_error");
      return;
    }
    if (!mapa) {
      mapa = L.map(mapaEl).setView([41.65, -4.72], 7);
      // El nivel de zoom queda en el HTML para poder comprobarlo en las pruebas.
      mapa.on("zoomend", () => { mapaEl.dataset.zoom = mapa.getZoom(); });
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 18,
        attribution: `&copy; <a href="https://www.openstreetmap.org/copyright">${t("mapa_atribucion")}</a>`,
      }).addTo(mapa);
    }
    mapa.invalidateSize();
    capa?.remove();
    capa = L.layerGroup().addTo(mapa);
    marcadores = new Map();

    // Varios comercios pueden compartir punto (los situados en el centro de su localidad):
    // un marcador por punto, con el número de comercios.
    const grupos = new Map();
    for (const { e } of resultados.slice(0, lista.children.length)) {
      if (e.lat == null) continue;
      const k = `${e.lat},${e.lon}`;
      if (!grupos.has(k)) grupos.set(k, []);
      grupos.get(k).push(e);
    }
    const limites = [];
    for (const [k, comercios] of grupos) {
      const [lat, lon] = k.split(",").map(Number);
      const n = comercios.length;
      const nombres = [...new Set(comercios.map((e) => e.localidad))];
      const lugar = nombres.length > 2 ? t("mapa_y_otras", { a: nombres[0], b: nombres[1] })
        : nombres.length === 2 ? t("mapa_y", { a: nombres[0], b: nombres[1] }) : nombres[0];
      const etiqueta = `${lugar}: ${p("comercios", n)}`;
      const icono = L.divIcon({ className: "marcador", html: `<span>${n}</span>`, iconSize: [34, 34], iconAnchor: [17, 17] });
      const m = L.marker([lat, lon], { icon: icono, title: etiqueta, alt: etiqueta, keyboard: true }).addTo(capa);
      m.bindPopup(popup(comercios, etiqueta, nombres.length > 1));
      for (const e of comercios) marcadores.set(e.id, m);
      limites.push([lat, lon]);
    }
    if (origen.lat != null) {
      L.circleMarker([origen.lat, origen.lon], { radius: 8, color: "#0b57d0", weight: 3, fillColor: "#fff", fillOpacity: 1 })
        .bindTooltip(origen.tipo === "ubicacion" ? t("tu_ubicacion") : origen.nombre)
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
    $(`est-${e.id}`)?.classList.add("activo");
  }

  // ---- Estado en la URL ----------------------------------------------------------------------

  function actualizaUrl() {
    const params = new URLSearchParams();
    if (origen?.tipo === "provincia") params.set("provincia", origen.provincia);
    else if (origen && origen.tipo !== "ubicacion") params.set("q", origen.tipo === "cp" ? origen.cp : origen.nombre);
    if (selCategoria.value) params.set("cat", selCategoria.value);
    else if (producto) params.set("para", producto.id);
    if (selRadio.value !== "25") params.set("km", selRadio.value);
    if (texto.value.trim()) params.set("texto", texto.value.trim());
    history.replaceState(null, "", `${location.pathname}${params.size ? `?${params}` : ""}`);
  }

  // ---- Arranque --------------------------------------------------------------------------------

  selCategoria.append(new Option(t("todos", { n: DATOS.total }), ""),
    ...DATOS.categorias.map((c) => new Option(`${TF.categoria(c.id)} (${num(c.total)})`, c.id)));

  const provincias = Object.values(LOC.provincias).sort(ordenES);
  $("provincias").append(...provincias.map((prov) => {
    const n = establecimientos.filter((e) => e.provincia === prov).length;
    const b = crea("button", { type: "button", className: "boton boton--pequeno boton--secundario", textContent: `${prov} (${num(n)})` });
    b.addEventListener("click", () => buscar({ provincia: prov }));
    return crea("li", {}, b);
  }));

  document.querySelector("[data-buscador]").hidden = false;

  // Accesos rápidos: «¿Qué necesitas?»
  const rapidos = $("productos-rapidos");
  if (rapidos) {
    rapidos.append(...["panales", "alimentacion", "higiene", "farmacia", "ropa", "calzado", "puericultura", "juguetes"].map((id) => {
      const prod = Asistente.producto(id);
      const b = crea("button", { type: "button", className: "boton boton--pequeno boton--secundario", textContent: prod.nombre });
      b.setAttribute("aria-pressed", "false");
      b.addEventListener("click", () => {
        producto = prod;
        selCategoria.value = "";
        rapidos.querySelectorAll("button").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
        if (origen) repinta();
        else pideLugar(true);
      });
      return crea("li", {}, b);
    }));
  }

  const params = new URLSearchParams(location.search);
  if (DATOS.categorias.some((c) => c.id === params.get("cat"))) selCategoria.value = params.get("cat");
  else if (params.get("para")) producto = Asistente.producto(params.get("para"));
  if (["5", "10", "25", "50", "0"].includes(params.get("km"))) selRadio.value = params.get("km");
  if (params.get("texto")) texto.value = params.get("texto");
  if (provincias.includes(params.get("provincia"))) {
    buscar({ provincia: params.get("provincia"), foco: false });
  } else if (params.get("q")) {
    q.value = params.get("q");
    // «en» indica la provincia cuando se eligió una sugerencia en la portada (hay
    // localidades con el mismo nombre en varias provincias).
    const n = normaliza(q.value);
    buscar({ lugar: localidades.find((l) => l.n === n && l.provincia === params.get("en")), foco: false });
  } else if (params.get("cerca") === "1") {
    // Viene del botón «Usar mi ubicación» de la portada: la persona ya lo ha pedido.
    usarUbicacion();
  } else if (producto) {
    pideLugar(false);
  }
})();
