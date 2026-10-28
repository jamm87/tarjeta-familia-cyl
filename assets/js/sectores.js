// Filtro de la lista de sectores autorizados. Sin JavaScript se ve la lista completa.
const formFiltro = document.querySelector("[data-filtro-sectores]");
const entrada = document.getElementById("filtro-sector");
const recuento = formFiltro.querySelector("[data-recuento]");
const grupos = [...document.querySelectorAll("[data-grupo]")];
const total = document.querySelectorAll("[data-texto]").length;

const normaliza = (t) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

function filtra() {
  const palabras = normaliza(entrada.value).split(/\s+/).filter(Boolean);
  let visibles = 0;
  for (const grupo of grupos) {
    let enGrupo = 0;
    for (const li of grupo.querySelectorAll("[data-texto]")) {
      const texto = normaliza(li.dataset.texto + " " + grupo.querySelector("h2").textContent);
      const coincide = palabras.every((p) => texto.includes(p));
      li.hidden = !coincide;
      if (coincide) enGrupo++;
    }
    grupo.hidden = enGrupo === 0;
    visibles += enGrupo;
  }
  if (!palabras.length) recuento.textContent = `${total} sectores autorizados.`;
  else if (visibles) recuento.textContent = `${visibles} ${visibles === 1 ? "sector coincide" : "sectores coinciden"} con «${entrada.value.trim()}».`;
  else recuento.textContent = `Ningún sector coincide con «${entrada.value.trim()}». Prueba con otra palabra o consulta a tu banco.`;
}

let espera;
entrada.addEventListener("input", () => {
  clearTimeout(espera);
  espera = setTimeout(filtra, 250);
});
formFiltro.addEventListener("submit", (ev) => {
  ev.preventDefault();
  filtra();
});
formFiltro.hidden = false;
filtra();
