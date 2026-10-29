// Textos de la interfaz en el idioma de la página (window.TF_TEXTOS, assets/i18n/<idioma>.js).
//   TF.t("clave", { n: 3 })        texto con {variables}
//   TF.p("comercios", 3)           plural según el idioma (en árabe hay seis formas)
//   TF.num(1234)                   número con el formato del idioma
window.TF = (() => {
  const textos = window.TF_TEXTOS || {};
  const locale = textos.locale || document.documentElement.lang || "es";
  const plurales = new Intl.PluralRules(locale);
  const num = (n, opciones) => Number(n).toLocaleString(locale, opciones);
  const rellena = (texto, vars = {}) =>
    String(texto).replace(/\{(\w+)\}/g, (_, k) => (k in vars ? (typeof vars[k] === "number" ? num(vars[k]) : vars[k]) : `{${k}}`));
  const t = (clave, vars) => rellena(textos[clave] ?? clave, vars);
  const p = (clave, n, vars = {}) => {
    const formas = textos[clave] || {};
    const forma = formas[n === 0 && formas.zero ? "zero" : plurales.select(n)] ?? formas.other ?? clave;
    return rellena(forma, { n, ...vars });
  };
  return { t, p, num, locale, textos, rellena, categoria: (id) => textos.categorias?.[id] ?? id };
})();
