// Asistente de búsqueda: entiende frases como «pañales cerca de Villafranca» o
// «nappies near León» y las convierte en una búsqueda (lugar + tipos de comercio).
//
// No usa ningún servicio externo: un diccionario de productos (en español, inglés y árabe)
// dice en qué tipos de comercio suele encontrarse cada cosa, y el lugar se busca en el mismo
// índice de localidades que las sugerencias (assets/js/sugerencias.js).
//
//   const r = Asistente.interpreta("pañales cerca de villafranca", indices);
//   // → { producto: {id, cats, nombre}, lugar: {…}, cerca: false }

window.Asistente = (() => {
  const { normaliza, sinArticulo } = Sugerencias;

  // Las categorías son las de data/establecimientos.json. El primer nombre de cada idioma es
  // el que se muestra.
  const PRODUCTOS = [
    { id: "panales", cats: ["farmacia", "supermercado", "drogueria", "puericultura"],
      es: ["pañales", "pañal", "toallitas"], en: ["nappies", "nappy", "diapers", "diaper", "wipes"], ar: ["حفاضات", "حفاض", "مناديل مبللة"] },
    { id: "alimentacion", cats: ["supermercado", "farmacia", "puericultura"],
      es: ["alimentación infantil", "leche infantil", "leche de continuación", "leche", "potitos", "potito", "papillas", "papilla", "cereales", "comida", "alimentación", "alimentacion"],
      en: ["baby food", "formula milk", "formula", "baby milk", "milk", "cereal", "food"], ar: ["أغذية الأطفال", "حليب", "طعام", "حبوب"] },
    { id: "higiene", cats: ["farmacia", "drogueria", "supermercado", "puericultura"],
      es: ["productos de higiene", "higiene", "champú", "gel", "crema", "cremas", "colonia", "jabón"],
      en: ["toiletries", "hygiene", "shampoo", "soap", "cream"], ar: ["منتجات النظافة", "نظافة", "شامبو", "صابون", "كريم"] },
    { id: "medicinas", cats: ["farmacia", "salud"],
      es: ["medicamentos", "medicinas", "medicina", "termómetro", "suero", "ortopedia", "plantillas"],
      en: ["medicines", "medicine", "thermometer", "orthopaedics", "orthopedics"], ar: ["أدوية", "دواء", "ميزان حرارة"] },
    { id: "farmacia", cats: ["farmacia"],
      es: ["farmacias", "farmacia", "parafarmacia"], en: ["pharmacies", "pharmacy", "chemist"], ar: ["صيدليات", "صيدلية"] },
    { id: "supermercado", cats: ["supermercado"],
      es: ["supermercados", "supermercado", "tienda de alimentación"], en: ["supermarkets", "supermarket", "grocery"], ar: ["سوبرماركت", "بقالة"] },
    { id: "puericultura", cats: ["puericultura", "farmacia"],
      es: ["artículos de bebé", "biberones", "biberón", "chupetes", "chupete", "tetinas", "sacaleches", "carrito", "silla de coche", "portabebés", "bañera", "puericultura"],
      en: ["baby products", "bottles", "bottle", "dummy", "pacifier", "breast pump", "pushchair", "pram", "stroller", "car seat"],
      ar: ["مستلزمات الرضّع", "رضاعة", "لهاية", "عربة أطفال", "مقعد سيارة"] },
    { id: "ropa", cats: ["ropa"],
      es: ["ropa infantil", "ropa", "bodys", "body", "pijama", "pijamas", "abrigo", "calcetines", "gorro"],
      en: ["children's clothes", "clothes", "clothing", "babygrow", "onesie", "pyjamas", "coat", "socks"], ar: ["ملابس الأطفال", "ملابس", "بيجامة", "معطف"] },
    { id: "calzado", cats: ["calzado"],
      es: ["calzado", "zapatos", "zapatillas", "botas", "sandalias"], en: ["shoes", "trainers", "boots", "sandals"], ar: ["أحذية", "حذاء"] },
    { id: "juguetes", cats: ["juguetes"],
      es: ["juguetes", "juguete", "libros", "cuentos", "material escolar", "cuadernos", "papelería"],
      en: ["toys", "toy", "books", "school supplies", "stationery"], ar: ["ألعاب", "لعبة", "كتب", "قرطاسية"] },
    { id: "gafas", cats: ["optica"],
      es: ["gafas", "óptica", "lentillas", "audífono", "audífonos"], en: ["glasses", "optician", "contact lenses", "hearing aid"], ar: ["نظارات", "عدسات", "سماعة"] },
    { id: "mobiliario", cats: ["hogar", "puericultura"],
      es: ["mobiliario infantil", "muebles", "mueble", "cuna", "cunas", "trona", "colchón", "cambiador"],
      en: ["nursery furniture", "furniture", "cot", "crib", "high chair", "mattress", "changing table"], ar: ["أثاث الأطفال", "أثاث", "سرير", "كرسي طعام", "فرشة"] },
    { id: "salud", cats: ["salud", "farmacia"],
      es: ["dentista", "fisioterapia", "fisioterapeuta", "logopeda", "podólogo"], en: ["dentist", "physiotherapy", "physio", "speech therapy"], ar: ["طبيب أسنان", "علاج طبيعي"] },
  ];

  // Frases para «cerca de mí» (usar la ubicación) y palabras que no forman parte del lugar.
  const CERCA_DE_MI = ["cerca de mi", "cerca de aqui", "por aqui", "near me", "nearby", "around here", "بالقرب مني", "قريب مني"];
  const CERCA = ["cerca", "near", "close", "قريب", "بالقرب"];
  const VACIAS = new Set(("quiero comprar compro donde puedo encontrar encuentro cerca de del en por para un una unos unas mi me necesito " +
    "busco buscar hay tienda tiendas venden vende algo y o con a al el la los las que comprarle " +
    "i want to buy where can find near in at for an the my need some shop shops sell around close of " +
    "أين أريد شراء قرب بالقرب من في عند متجر محل أحتاج").split(" "));

  // Todas las expresiones, de la más larga a la más corta, para que «silla de coche» gane a «coche».
  const expresiones = PRODUCTOS.flatMap((p) => ["es", "en", "ar"].flatMap((l) => p[l].map((x) => ({ p, x: normaliza(x) }))))
    .sort((a, b) => b.x.length - a.x.length);

  const nombre = (p, idioma) => (p[idioma] ?? p.es)[0];
  // En árabe el artículo va unido a la palabra («الحفاضات»).
  const variantes = (x) => [x, `ال${x}`];
  const contiene = (texto, x) => variantes(x).some((v) => ` ${texto} `.includes(` ${v} `));
  const quita = (texto, x) => variantes(x).reduce((t, v) => ` ${t} `.replace(` ${v} `, " ").trim(), texto);

  function producto(id, idioma = document.documentElement.lang) {
    const p = PRODUCTOS.find((x) => x.id === id);
    return p && { id: p.id, cats: p.cats, nombre: nombre(p, idioma) };
  }

  // Separa el producto (si se menciona alguno) del resto del texto.
  function separa(frase) {
    let resto = normaliza(frase);
    let encontrado = null;
    for (const { p, x } of expresiones) {
      if (contiene(resto, x)) {
        encontrado ??= p;
        resto = quita(resto, x);
      }
    }
    return { producto: encontrado && producto(encontrado.id), resto };
  }

  // Busca el lugar en lo que queda de la frase: primero un código postal y, si no, el trozo
  // de palabras seguidas más largo que coincide con una localidad.
  // Si el lugar exacto no tiene comercios y otro que empieza igual sí (por ejemplo,
  // «villafranca» → Villafranca del Bierzo y no Villafranca, en Segovia), se elige este.
  function lugarEn(palabras, indices) {
    const cp = palabras.find((w) => /^\d{5}$/.test(w));
    if (cp) return indices.resuelve(cp);
    for (let largo = Math.min(palabras.length, 6); largo > 0; largo--) {
      let exacto = null;
      let prefijo = null;
      for (let i = 0; i + largo <= palabras.length; i++) {
        const trozo = palabras.slice(i, i + largo);
        if (VACIAS.has(trozo[0]) || VACIAS.has(trozo.at(-1))) continue;
        const c = trozo.join(" ");
        if (c.length < 3) continue;
        for (const l of indices.buscaLugares(c, 8)) {
          if (l.n === c || l.sin === sinArticulo(c)) exacto ??= l;
          else if (c.length >= 4 && (l.n.startsWith(c) || l.sin.startsWith(sinArticulo(c)))) prefijo ??= l;
        }
      }
      if (exacto && (exacto.comercios > 0 || !prefijo?.comercios)) return exacto;
      if (prefijo) return prefijo;
    }
    return null;
  }

  // Nombres en árabe de las capitales y de las ciudades con más comercios.
  const ALIAS = {
    "ليون": "leon", "بورغوس": "burgos", "بلد الوليد": "valladolid", "سلامنكا": "salamanca", "شلمنقة": "salamanca",
    "سمورة": "zamora", "ثامورا": "zamora", "بالنسيا": "palencia", "سيغوفيا": "segovia", "شقوبية": "segovia",
    "سوريا": "soria", "صوريا": "soria", "أبيلا": "avila", "آبلة": "avila", "بونفيرادا": "ponferrada",
    "ميدينا ديل كامبو": "medina del campo", "أراندا دي دويرو": "aranda de duero", "ميراندا دي إبرو": "miranda de ebro",
  };

  function interpreta(frase, indices) {
    let { producto: p, resto } = separa(frase);
    for (const [ar, es] of Object.entries(ALIAS)) if (contiene(resto, normaliza(ar))) resto = ` ${quita(resto, normaliza(ar))} ${es} `.trim();
    const palabras = resto.split(" ").filter(Boolean);
    const lugar = palabras.length ? lugarEn(palabras, indices) : null;
    const todo = normaliza(frase);
    const cerca = !lugar && (CERCA_DE_MI.some((x) => contiene(todo, normaliza(x))) || CERCA.some((x) => contiene(todo, x)));
    return { producto: p, lugar, cerca };
  }

  return { PRODUCTOS, producto, separa, interpreta };
})();
