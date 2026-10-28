// Sugerencias en el buscador de la portada. Los datos de localidades (data/localidades.js)
// solo se descargan cuando la persona usa el campo. Sin JavaScript, el formulario lleva
// igualmente al buscador con lo escrito.
(() => {
  const RAIZ = new URL("../../", document.currentScript.src);
  const input = document.getElementById("q-portada");
  const listbox = document.getElementById("sugerencias-portada");
  let cargando = null;

  function carga() {
    cargando ??= new Promise((ok, mal) => {
      if (window.DATOS_LOCALIDADES) return ok();
      const s = document.createElement("script");
      s.src = `${RAIZ}data/localidades.js`;
      s.onload = ok;
      s.onerror = mal;
      document.head.append(s);
    }).then(() => {
      const indices = Sugerencias.indices(window.DATOS_LOCALIDADES);
      Sugerencias.crear({
        input,
        listbox,
        indices,
        alElegir: (lugar) => {
          const p = new URLSearchParams({ q: lugar.tipo === "cp" ? lugar.cp : lugar.nombre });
          if (lugar.tipo === "localidad") p.set("en", lugar.provincia);
          location.href = `${RAIZ}buscar/index.html?${p}`;
        },
      });
    });
    return cargando;
  }

  input.addEventListener("focus", carga, { once: true });
  input.addEventListener("input", carga, { once: true });
})();
