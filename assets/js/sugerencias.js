// Sugerencias de localidad, municipio o código postal (patrón combobox de ARIA 1.2).
// Lo usan la portada y el buscador. Datos: window.DATOS_LOCALIDADES (data/localidades.js).
//
//   const indices = Sugerencias.indices(window.DATOS_LOCALIDADES);
//   const combo = Sugerencias.crear({ input, listbox, indices, alElegir: (lugar) => … });

window.Sugerencias = (() => {
  const normaliza = (t) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[-']/g, " ").replace(/\s+/g, " ").trim();
  const sinArticulo = (t) => t.replace(/^(el|la|los|las) /, "");
  const plural = (n) => `${n} ${n === 1 ? "comercio" : "comercios"}`;

  function indices(LOC) {
    // Municipios (código INE) y códigos postales oficiales (CNIG) de toda Castilla y León.
    const municipios = Object.fromEntries(Object.entries(LOC.municipios).map(([ine, [nombre, lat, lon]]) =>
      [ine, { ine, nombre, lat, lon, provincia: LOC.provincias[ine.slice(0, 2)] }]));

    // Una localidad que es cabecera de su municipio busca en todo el municipio (con sus pedanías).
    // Las aldeas y pedanías sin coordenadas propias se sitúan en el punto de su municipio.
    const localidades = LOC.localidades.map(([nombre, prov, lat, lon, ine, enLocalidad]) => {
      const n = normaliza(nombre);
      const municipio = municipios[ine];
      const esMunicipio = Boolean(municipio && normaliza(municipio.nombre) === n);
      const comercios = esMunicipio ? LOC.comerciosPorMunicipio[ine] ?? 0 : enLocalidad;
      const aproximada = lat == null && Boolean(municipio);
      return {
        tipo: "localidad", nombre, provincia: LOC.provincias[prov], ine, esMunicipio, n, sin: sinArticulo(n), comercios,
        lat: lat ?? municipio?.lat, lon: lon ?? municipio?.lon, aproximada,
      };
    }).filter((l) => l.lat != null);

    const codigosPostales = Object.fromEntries(Object.entries(LOC.codigosPostales).map(([cp, ines]) => {
      const ms = ines.map((i) => municipios[i]);
      return [cp, {
        tipo: "cp", nombre: cp, cp, ines,
        provincia: LOC.provincias[cp.slice(0, 2)],
        descripcion: ms.map((m) => m.nombre).join(", "),
        lat: ms.reduce((t, m) => t + m.lat, 0) / ms.length,
        lon: ms.reduce((t, m) => t + m.lon, 0) / ms.length,
        comercios: LOC.comerciosPorCP[cp] ?? 0,
      }];
    }));

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

    // Texto escrito sin elegir sugerencia -> lugar (o el motivo por el que no se encuentra).
    function resuelve(valor) {
      const c = normaliza(valor);
      if (!c) return null;
      if (/^\d{5}$/.test(c)) return codigosPostales[c] ?? { tipo: "cp-desconocido", nombre: c };
      if (/^\d+$/.test(c)) return { tipo: "cp-incompleto", nombre: c };
      const exactas = localidades.filter((l) => l.n === c || l.sin === sinArticulo(c));
      if (exactas.length) return exactas.sort((a, b) => b.comercios - a.comercios)[0];
      return buscaLugares(valor, 1)[0] ?? { tipo: "desconocido", nombre: valor.trim() };
    }

    function describe(l) {
      const comercios = l.comercios ? ` · ${plural(l.comercios)}` : "";
      if (l.tipo === "cp") return { principal: l.cp, extra: `${l.descripcion} · ${l.provincia}${comercios}` };
      const municipio = !l.esMunicipio && l.ine && municipios[l.ine] ? ` (municipio de ${municipios[l.ine].nombre})` : "";
      return { principal: l.nombre, extra: `${l.provincia}${municipio}${comercios}` };
    }

    return { municipios, localidades, codigosPostales, buscaLugares, resuelve, describe };
  }

  function crear({ input, listbox, indices: idx, alElegir }) {
    let sugerencias = [];
    let activa = -1;
    let seleccion = null; // lugar elegido de la lista

    function pinta() {
      listbox.replaceChildren(...sugerencias.map((l, i) => {
        const { principal, extra } = idx.describe(l);
        const li = document.createElement("li");
        li.id = `${listbox.id}-${i}`;
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
      input.setAttribute("aria-expanded", String(abierta));
      if (activa >= 0) {
        input.setAttribute("aria-activedescendant", `${listbox.id}-${activa}`);
        document.getElementById(`${listbox.id}-${activa}`).scrollIntoView({ block: "nearest" });
      } else {
        input.removeAttribute("aria-activedescendant");
      }
    }

    function cerrar() {
      sugerencias = [];
      activa = -1;
      pinta();
    }

    function elige(i) {
      const l = sugerencias[i];
      seleccion = l;
      input.value = l.tipo === "cp" ? l.cp : l.nombre;
      cerrar();
      alElegir(l);
    }

    function actualiza() {
      sugerencias = idx.buscaLugares(input.value);
      activa = -1;
      pinta();
    }

    let espera;
    input.addEventListener("input", () => {
      seleccion = null;
      clearTimeout(espera);
      espera = setTimeout(actualiza, 120);
    });

    input.addEventListener("keydown", (ev) => {
      const abierta = sugerencias.length > 0;
      if (ev.key === "ArrowDown") {
        ev.preventDefault();
        if (!abierta) sugerencias = idx.buscaLugares(input.value);
        activa = sugerencias.length ? (activa + 1) % sugerencias.length : -1;
        pinta();
      } else if (ev.key === "ArrowUp" && abierta) {
        ev.preventDefault();
        activa = activa <= 0 ? sugerencias.length - 1 : activa - 1;
        pinta();
      } else if (ev.key === "Enter" && abierta && activa >= 0) {
        ev.preventDefault();
        elige(activa);
      } else if (ev.key === "Escape") {
        if (abierta) {
          ev.preventDefault();
          cerrar();
        } else {
          input.value = "";
        }
      } else if (ev.key === "Tab") {
        cerrar();
      }
    });
    input.addEventListener("blur", () => setTimeout(cerrar, 150));

    // Si ya había texto escrito antes de cargar los datos, se muestran sus sugerencias.
    if (input.value.trim() && document.activeElement === input) actualiza();

    return {
      cerrar,
      seleccion: () => seleccion,
      olvidar: () => { seleccion = null; },
    };
  }

  return { normaliza, sinArticulo, indices, crear };
})();
