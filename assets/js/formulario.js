// Formulario «Hazte colaborador».
// Sin JavaScript, el formulario se envía con mailto: (action del <form>). Con JavaScript:
// valida campo a campo, muestra un resumen de errores con enlaces a cada campo y, si todo
// está bien, prepara un correo con los datos para que la persona solo tenga que enviarlo.

const DESTINO = "conciliacion.gss@jcyl.es";
const ASUNTO = "Alta de establecimiento colaborador con la Tarjeta Familia";
const PROVINCIAS = { "05": "Ávila", "09": "Burgos", "24": "León", "34": "Palencia", "37": "Salamanca", "40": "Segovia", "42": "Soria", "47": "Valladolid", "49": "Zamora" };

// Mensajes en el idioma de la página (assets/js/i18n.js).
const MENSAJES_VACIO = TF.textos.form_vacio;

const LETRAS_DNI = "TRWAGMYFPDXBNJZSQVHLCKE";
const limpia = (v) => v.toUpperCase().replace(/[\s.-]/g, "");

function dniValido(valor) {
  const v = limpia(valor).replace(/^X/, "0").replace(/^Y/, "1").replace(/^Z/, "2");
  const m = v.match(/^(\d{8})([A-Z])$/);
  return Boolean(m) && LETRAS_DNI[Number(m[1]) % 23] === m[2];
}

function cifValido(valor) {
  const v = limpia(valor);
  if (dniValido(v)) return true; // autónomos: NIF o NIE
  const m = v.match(/^([ABCDEFGHJNPQRSUVW])(\d{7})([0-9A-J])$/);
  if (!m) return false;
  let suma = 0;
  [...m[2]].forEach((c, i) => {
    const n = Number(c);
    if (i % 2 === 0) {
      const doble = n * 2;
      suma += Math.floor(doble / 10) + (doble % 10);
    } else {
      suma += n;
    }
  });
  const digito = (10 - (suma % 10)) % 10;
  return m[3] === String(digito) || m[3] === "JABCDEFGHI"[digito];
}

const soloDigitos = (v) => v.replace(/[\s.-]/g, "").replace(/^(\+34|0034)/, "");

const VALIDADORES = {
  dni: (v) => dniValido(v) || TF.t("form_dni"),
  cif: (v) => cifValido(v) || TF.t("form_cif"),
  email: (v) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim()) || TF.t("form_email"),
  movil: (v) => /^[67]\d{8}$/.test(soloDigitos(v)) || TF.t("form_movil"),
  telefono: (v) => /^[6-9]\d{8}$/.test(soloDigitos(v)) || TF.t("form_telefono"),
  cp: (v, form) => {
    const cp = v.trim();
    if (!/^\d{5}$/.test(cp)) return TF.t("form_cp_cifras");
    const prov = PROVINCIAS[cp.slice(0, 2)];
    if (!prov) return TF.t("form_cp_fuera");
    const elegida = form.elements.provincia.value;
    if (elegida && elegida !== cp.slice(0, 2)) {
      return TF.t("form_cp_provincia", { cp, p: prov, e: PROVINCIAS[elegida] });
    }
    return true;
  },
};

const form = document.getElementById("form-colaborador");
const resumen = document.getElementById("resumen-errores");
const confirmacion = document.getElementById("confirmacion");
let intentado = false;
const tituloOriginal = document.title;

function error(campo) {
  const valor = campo.type === "checkbox" ? campo.checked : campo.value.trim();
  if (!valor) return campo.required ? MENSAJES_VACIO[campo.id] : "";
  const validador = VALIDADORES[campo.dataset.validar];
  if (!validador) return "";
  const resultado = validador(campo.value, form);
  return resultado === true ? "" : resultado;
}

function marca(campo, mensaje) {
  const caja = document.getElementById(`error-${campo.id}`);
  if (!caja) return;
  caja.textContent = mensaje;
  if (mensaje) campo.setAttribute("aria-invalid", "true");
  else campo.removeAttribute("aria-invalid");
  campo.closest(".campo")?.classList.toggle("campo--error", Boolean(mensaje));
}

const campos = () => [...form.querySelectorAll("input, select")].filter((c) => c.id);

function valida() {
  const errores = [];
  for (const campo of campos()) {
    const mensaje = error(campo);
    marca(campo, mensaje);
    if (mensaje) errores.push({ campo, mensaje });
  }
  return errores;
}

function muestraResumen(errores) {
  const lista = resumen.querySelector("ul");
  lista.replaceChildren(...errores.map(({ campo, mensaje }) => {
    const li = document.createElement("li");
    const a = document.createElement("a");
    a.href = `#${campo.id}`;
    a.textContent = mensaje;
    a.addEventListener("click", (ev) => {
      ev.preventDefault();
      campo.focus();
      campo.scrollIntoView({ block: "center" });
    });
    li.append(a);
    return li;
  }));
  resumen.hidden = false;
  resumen.focus();
  document.title = `${TF.p("form_errores", errores.length)} ${tituloOriginal}`;
}

// El correo va a la Junta de Castilla y León: se redacta siempre en español, con el nombre
// en español de cada campo (atributo name) y de cada bloque (data-seccion del fieldset).
function textoCorreo() {
  const lineas = ["Solicito que el siguiente establecimiento sea colaborador con la Tarjeta Familia.", ""];
  let seccion = null;
  for (const campo of campos()) {
    const bloque = campo.closest("fieldset")?.dataset.seccion;
    if (bloque !== seccion) {
      lineas.push("", bloque.toUpperCase());
      seccion = bloque;
    }
    let valor;
    if (campo.type === "checkbox") valor = campo.checked ? "Sí" : "No";
    else if (campo.id === "provincia") valor = PROVINCIAS[campo.value] ?? "";
    else valor = campo.value.trim();
    if (valor) lineas.push(`${campo.name}: ${valor}`);
  }
  const hoy = new Date().toLocaleDateString("es-ES", { day: "numeric", month: "long", year: "numeric" });
  lineas.push("", `En ${form.elements.localidad.value.trim()}, a ${hoy}.`);
  return lineas.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

form.addEventListener("submit", (ev) => {
  ev.preventDefault();
  intentado = true;
  const errores = valida();
  if (errores.length) {
    muestraResumen(errores);
    return;
  }
  resumen.hidden = true;
  document.title = tituloOriginal;
  const cuerpo = textoCorreo();
  document.getElementById("resumen-envio").textContent = cuerpo;
  document.getElementById("enlace-correo").href =
    `mailto:${DESTINO}?subject=${encodeURIComponent(ASUNTO)}&body=${encodeURIComponent(cuerpo)}`;
  form.hidden = true;
  confirmacion.hidden = false;
  confirmacion.focus();
});

// Tras el primer intento, el error de un campo desaparece en cuanto se corrige. Los errores
// nuevos solo se muestran al enviar: así el contenido no se desplaza al salir de un campo
// (un clic en el campo siguiente podría caer en otro sitio).
function quitaSiCorrecto(campo) {
  if (intentado && campo.id && campo.getAttribute("aria-invalid") && !error(campo)) marca(campo, "");
}
form.addEventListener("input", (ev) => quitaSiCorrecto(ev.target));
form.addEventListener("change", (ev) => {
  quitaSiCorrecto(ev.target);
  if (ev.target.id === "provincia") quitaSiCorrecto(form.elements.cp);
});

document.getElementById("volver-formulario").addEventListener("click", () => {
  confirmacion.hidden = true;
  form.hidden = false;
  form.elements.nombre.focus();
});

document.getElementById("copiar-datos").addEventListener("click", async () => {
  const estado = document.getElementById("estado-copia");
  try {
    await navigator.clipboard.writeText(`Para: ${DESTINO}\nAsunto: ${ASUNTO}\n\n${textoCorreo()}`);
    estado.textContent = TF.t("form_copiado", { destino: DESTINO });
  } catch {
    estado.textContent = TF.t("form_no_copiado");
  }
});
