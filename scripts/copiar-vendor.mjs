// Copia Leaflet desde node_modules a vendor/ para no depender de un CDN.
import { cpSync, mkdirSync } from "node:fs";

const destino = new URL("../vendor/leaflet/", import.meta.url);
mkdirSync(destino, { recursive: true });
for (const f of ["leaflet.js", "leaflet.css", "images", "LICENSE"]) {
  const origen = f === "LICENSE" ? `../node_modules/leaflet/${f}` : `../node_modules/leaflet/dist/${f}`;
  cpSync(new URL(origen, import.meta.url), new URL(f, destino), { recursive: true });
}
console.log("Leaflet copiado en vendor/leaflet/");
