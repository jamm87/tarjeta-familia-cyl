// Comportamientos comunes a todas las páginas. El contenido funciona sin JavaScript:
// los botones que lo necesitan empiezan ocultos y se muestran aquí.
document.querySelectorAll("[data-imprimir]").forEach((boton) => {
  boton.hidden = false;
  boton.addEventListener("click", () => window.print());
});
