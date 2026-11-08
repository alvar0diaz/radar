/* =====================================================================
 * RADAR DE VUELOS — lógica principal
 * ---------------------------------------------------------------------
 * Partes:
 *   1. Utilidades (distancias, proyección, formato)
 *   2. Ajustes guardados en el navegador
 *   3. Mapa (Leaflet) y encuadre del radar
 *   4. Dibujo del fondo del radar (anillos, rosa, aeropuertos)
 *   5. Aviones: descarga, interpolación y dibujo
 *   6. Tarjeta de información (toque y rotación automática)
 *   7. Meteorología (RainViewer, OpenWeatherMap, Open-Meteo)
 *   8. Kiosco: reloj, Wake Lock, modo noche, recarga diaria, conexión
 *   9. Panel de ajustes y arranque
 * ===================================================================== */
(() => {
  'use strict';
  const C = window.CONFIG;
  const $ = (id) => document.getElementById(id);

  /* ===================== 1. UTILIDADES ===================== */
  const RAD = Math.PI / 180;
  const M_POR_NM = 1852;
  const ahoraS = () => performance.now() / 1000;   // reloj monotónico en segundos

  // Distancia en NM entre dos puntos (fórmula del haversine)
  function distanciaNM(lat1, lon1, lat2, lon2) {
    const dLat = (lat2 - lat1) * RAD, dLon = (lon2 - lon1) * RAD;
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * RAD) * Math.cos(lat2 * RAD) * Math.sin(dLon / 2) ** 2;
    return 2 * 6371000 * Math.asin(Math.sqrt(a)) / M_POR_NM;
  }
  const PUNTOS = ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO'];
  const cardinal = (g) => PUNTOS[Math.round(((g % 360) + 360) % 360 / 45) % 8];
  const miles = (n) => Math.round(n).toLocaleString('es-ES');
  // Primer valor que no sea null/undefined (equivale a "a ?? b", que no existe en navegadores
  // anteriores a 2020; así la app funciona también en tablets antiguas)
  function primero() {
    for (let i = 0; i < arguments.length; i++) if (arguments[i] != null) return arguments[i];
    return null;
  }

  // Proyección Mercator propia (más rápida que pedírsela a Leaflet para cada punto).
  // 'origen' es la esquina superior izquierda de la pantalla en píxeles de mundo.
  const proy = { escala: 0, ox: 0, oy: 0 };
  function mundo(lat, lon) {
    const s = Math.sin(lat * RAD);
    return [
      (lon + 180) / 360 * proy.escala,
      (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * proy.escala,
    ];
  }
  // Devuelve la posición en pantalla (píxeles CSS) de una coordenada
  function aPantalla(lat, lon) {
    const p = mundo(lat, lon);
    return [p[0] - proy.ox, p[1] - proy.oy];
  }
  // Píxeles por milla náutica en la latitud del centro
  function pxPorNM() {
    return proy.escala / (40075016.686 * Math.cos(C.centro.lat * RAD)) * M_POR_NM;
  }

  /* ===================== 2. AJUSTES GUARDADOS ===================== */
  // Se guardan en el propio navegador de la tablet. Si falla (modo privado), se usan los de config.js
  const ajustes = {
    lluvia: C.lluvia.activa,
    opacidad: C.lluvia.opacidad,
    nubes: !!C.openWeatherMapKey,
    noche: C.modoNoche.activo,
    zoomManual: false,
  };
  try { Object.assign(ajustes, JSON.parse(localStorage.getItem('radar.ajustes') || '{}')); } catch (e) { /* sin almacenamiento */ }
  ajustes.zoomManual = false;  // al arrancar, siempre encuadre fijo
  function guardarAjustes() {
    try { localStorage.setItem('radar.ajustes', JSON.stringify(ajustes)); } catch (e) { /* sin almacenamiento */ }
  }

  /* ===================== 3. MAPA Y ENCUADRE ===================== */
  const mapa = L.map('mapa', {
    zoomControl: false, attributionControl: true,
    // Sin interacción por defecto: el radar no se mueve si alguien roza la pantalla
    dragging: false, touchZoom: false, doubleClickZoom: false, scrollWheelZoom: false,
    boxZoom: false, keyboard: false, tap: false,
    zoomSnap: 0, zoomDelta: 0.5,        // zoom fraccionario para encajar el radio exacto
    zoomAnimation: false, fadeAnimation: false, markerZoomAnimation: false, // menos trabajo para la tablet
    inertia: false,
  });
  mapa.attributionControl.setPrefix(false);

  // Mapa base oscuro: CARTO si hay clave en config.js; si no, Esri "Dark Gray" (sin clave).
  // (CARTO pone la marca "API KEY REQUIRED" en sus teselas si no se pasa la clave.)
  if (C.cartoKey) {
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png?key=' + encodeURIComponent(C.cartoKey), {
      subdomains: 'abcd', maxZoom: 19, className: 'capa-base',
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> · © <a href="https://carto.com/attributions">CARTO</a>',
    }).addTo(mapa);
  } else {
    const esri = 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/';
    L.tileLayer(esri + 'World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}', {
      maxZoom: 19, maxNativeZoom: 16, className: 'capa-base',
      attribution: 'Mapa © <a href="https://www.esri.com/">Esri</a>, HERE, Garmin, © <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(mapa);
    // Nombres de lugares (capa transparente encima del mapa base)
    L.tileLayer(esri + 'World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}', {
      maxZoom: 19, maxNativeZoom: 16, className: 'capa-base', zIndex: 2,
    }).addTo(mapa);
  }

  // Geometría del radar en pantalla: centro (cx, cy) y radio R en píxeles
  const geo = { w: 0, h: 0, cx: 0, cy: 0, R: 0, dpr: 1 };

  // Calcula zoom y centro para que el círculo del radio configurado llene la pantalla.
  // Se reserva arriba el hueco del reloj; en vertical también abajo el de los paneles,
  // para que ningún texto tape el anillo exterior. El círculo es lo más grande posible.
  function encuadrar() {
    const w = window.innerWidth, h = window.innerHeight;
    const horizontal = w > h;
    const reservaArriba = Math.ceil($('reloj').getBoundingClientRect().bottom) + 4;
    const reservaAbajo = horizontal ? 0 : h - Math.floor(Math.min(
      $('tiempo').getBoundingClientRect().top, $('tarjeta').getBoundingClientRect().top)) + 4;
    const alto = h - reservaArriba - reservaAbajo;
    const R = Math.max(50, Math.min(w / 2 - 6, alto / 2 - 4));
    const cyDeseado = reservaArriba + alto / 2;
    // zoom tal que radioNM ocupe R píxeles
    const mPorPx = (C.radioNM * M_POR_NM) / R;
    const zoom = Math.log2(156543.03392 * Math.cos(C.centro.lat * RAD) / mPorPx);
    // Desplazamos el centro del mapa para que Fuenlabrada quede en cyDeseado
    const pCentro = mapa.project([C.centro.lat, C.centro.lon], zoom);
    const centroMapa = mapa.unproject(pCentro.add([0, h / 2 - cyDeseado]), zoom);
    mapa.setView(centroMapa, zoom, { animate: false });
  }

  // Actualiza la proyección propia y la geometría a partir del estado real del mapa
  function actualizarGeometria() {
    const t = mapa.getSize();
    geo.w = t.x; geo.h = t.y;
    geo.dpr = Math.min(window.devicePixelRatio || 1, 2);
    proy.escala = 256 * Math.pow(2, mapa.getZoom());
    const c = mapa.getCenter();
    const pc = mundo(c.lat, c.lng);
    proy.ox = pc[0] - t.x / 2; proy.oy = pc[1] - t.y / 2;
    const p = aPantalla(C.centro.lat, C.centro.lon);
    geo.cx = p[0]; geo.cy = p[1];
    geo.R = C.radioNM * pxPorNM();
    // Coloca el barrido (div que gira con CSS) sobre el círculo
    const b = $('barrido').style;
    b.width = b.height = (geo.R * 2) + 'px';
    b.left = (geo.cx - geo.R) + 'px'; b.top = (geo.cy - geo.R) + 'px';
    dimensionarLienzo(lienzoFondo, ctxFondo);
    dimensionarLienzo(lienzoAviones, ctxAviones);
    dibujarFondo();
  }

  /* ===================== 4. FONDO DEL RADAR ===================== */
  const lienzoFondo = $('fondo'), ctxFondo = lienzoFondo.getContext('2d');
  const lienzoAviones = $('aviones'), ctxAviones = lienzoAviones.getContext('2d');

  function dimensionarLienzo(lz, ctx) {
    lz.width = Math.round(geo.w * geo.dpr); lz.height = Math.round(geo.h * geo.dpr);
    ctx.setTransform(geo.dpr, 0, 0, geo.dpr, 0, 0);   // dibujamos en píxeles CSS
  }

  // Tamaño de letra base para el lienzo, igual que --u en CSS (3,4 % del lado corto)
  const u = () => Math.max(16, Math.min(32, Math.min(geo.w, geo.h) * 0.034));

  function dibujarFondo() {
    const ctx = ctxFondo, { cx, cy, R } = geo, U = u();
    ctx.clearRect(0, 0, geo.w, geo.h);
    const verde = 'rgba(57,255,136,';

    // Oscurece ligeramente fuera del círculo para enfocar la vista en el radar
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath(); ctx.rect(0, 0, geo.w, geo.h); ctx.arc(cx, cy, R, 0, Math.PI * 2, true); ctx.fill();

    // Anillos de distancia con etiqueta
    const pnm = pxPorNM();
    ctx.lineWidth = 1.2;
    ctx.font = `600 ${Math.round(U * 0.72)}px system-ui, sans-serif`;
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    for (let nm = C.anilloCadaNM; nm <= C.radioNM + 0.01; nm += C.anilloCadaNM) {
      const r = nm * pnm;
      const exterior = Math.abs(nm - C.radioNM) < 0.01;
      ctx.strokeStyle = verde + (exterior ? '0.75)' : '0.32)');
      ctx.lineWidth = exterior ? 2 : 1.2;
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
      // etiqueta en diagonal (abajo a la derecha, 45°) donde estorba menos
      const a = 45 * RAD;
      const tx = cx + Math.sin(a) * r + 4, ty = cy + Math.cos(a) * r - 4;
      ctx.fillStyle = verde + '0.85)';
      ctx.strokeStyle = 'rgba(0,0,0,0.8)'; ctx.lineWidth = 3;
      ctx.strokeText(nm + ' NM', tx, ty); ctx.fillText(nm + ' NM', tx, ty);
    }

    // Ejes en cruz y marcas cada 10° en el borde
    ctx.strokeStyle = verde + '0.18)'; ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cx - R, cy); ctx.lineTo(cx + R, cy);
    ctx.moveTo(cx, cy - R); ctx.lineTo(cx, cy + R);
    ctx.stroke();
    ctx.strokeStyle = verde + '0.6)';
    ctx.beginPath();
    for (let g = 0; g < 360; g += 10) {
      const largo = g % 30 === 0 ? U * 0.7 : U * 0.35;
      const s = Math.sin(g * RAD), c = -Math.cos(g * RAD);
      ctx.moveTo(cx + s * R, cy + c * R); ctx.lineTo(cx + s * (R - largo), cy + c * (R - largo));
    }
    ctx.stroke();

    // Rosa de los vientos (N, E, S, O) dentro del anillo exterior
    ctx.font = `700 ${Math.round(U * 1.15)}px system-ui, sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const rl = R - U * 1.45;
    [['N', 0], ['E', 90], ['S', 180], ['O', 270]].forEach(([t, g]) => {
      const x = cx + Math.sin(g * RAD) * rl, y = cy - Math.cos(g * RAD) * rl;
      ctx.strokeStyle = 'rgba(0,0,0,0.85)'; ctx.lineWidth = 4; ctx.strokeText(t, x, y);
      ctx.fillStyle = t === 'N' ? '#ffffff' : verde + '0.95)'; ctx.fillText(t, x, y);
    });

    // Aeropuertos de referencia (cuadrado + código ICAO)
    ctx.font = `600 ${Math.round(U * 0.72)}px system-ui, sans-serif`;
    ctx.textAlign = 'left';
    for (const ap of C.aeropuertos) {
      const [x, y] = aPantalla(ap.lat, ap.lon);
      const l = U * 0.45;
      ctx.strokeStyle = '#7fd6ff'; ctx.lineWidth = 2;
      ctx.strokeRect(x - l / 2, y - l / 2, l, l);
      ctx.strokeStyle = 'rgba(0,0,0,0.85)'; ctx.lineWidth = 3;
      ctx.strokeText(ap.icao, x + l, y + l * 0.9);
      ctx.fillStyle = '#7fd6ff'; ctx.fillText(ap.icao, x + l, y + l * 0.9);
    }

    // Centro (Fuenlabrada)
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.arc(cx, cy, U * 0.18, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(cx, cy, U * 0.42, 0, Math.PI * 2); ctx.stroke();
  }

  /* ===================== 5. AVIONES ===================== */
  // Diccionario hex -> avión. Cada avión guarda su último dato y una estela.
  const aviones = new Map();
  const conexion = { ultimoOk: 0, fuenteIdx: 0, reintentarPrincipalEn: 0, fallos: 0, fuenteNombre: '' };

  // Silueta del avión apuntando al norte, en una caja de ±12 unidades
  const SILUETA = new Path2D('M0,-12 L1.8,-8 L1.8,-3 L11,3 L11,5.2 L1.8,2.4 L1.6,8 L5,10.3 L5,12 L0,10.8 L-5,12 L-5,10.3 L-1.6,8 L-1.8,2.4 L-11,5.2 L-11,3 L-1.8,-3 L-1.8,-8 Z');

  // Dónde está la API: con proxy configurado se usa el proxy; en el ordenador (localhost)
  // se usa el proxy local de pruebas; si no, se intenta directo (por si un día permiten CORS).
  const esLocal = ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
  const DIRECTO = { airplanes: 'https://api.airplanes.live', adsblol: 'https://api.adsb.lol' };
  function urlFuente(f) {
    const ruta = f.ruta.replace('{lat}', C.centro.lat).replace('{lon}', C.centro.lon).replace('{r}', Math.round(C.radioNM));
    const base = (C.proxy || '').replace(/\/+$/, '') || (esLocal ? 'http://localhost:8781' : '');
    if (base) return base + ruta;
    const [, pref, resto] = ruta.match(/^\/([^/]+)(\/.*)$/);
    return DIRECTO[pref] + resto;
  }

  // Petición con tiempo límite (en tablets viejas una petición colgada bloquearía el ciclo)
  async function pedirJSON(url, msLimite) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), msLimite);
    try {
      const r = await fetch(url, { signal: ctrl.signal, cache: 'no-store' });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return await r.json();
    } finally { clearTimeout(t); }
  }

  // Pide los aviones probando las fuentes en orden. Si la principal falla, se usa la
  // alternativa durante 10 minutos antes de volver a probar la principal.
  async function pedirAviones() {
    const n = C.fuentes.length;
    const inicio = Date.now() >= conexion.reintentarPrincipalEn ? 0 : conexion.fuenteIdx;
    let ultimoError;
    for (let k = 0; k < n; k++) {
      const i = (inicio + k) % n;
      try {
        const datos = await pedirJSON(urlFuente(C.fuentes[i]), 4500);
        if (!datos || !Array.isArray(datos.ac)) throw new Error('respuesta sin aviones');
        // Si ha funcionado una alternativa tras probar la principal, no volver a la principal en 10 min
        if (i !== 0 && inicio === 0) conexion.reintentarPrincipalEn = Date.now() + 10 * 60 * 1000;
        conexion.fuenteIdx = i; conexion.fuenteNombre = C.fuentes[i].nombre;
        return datos;
      } catch (e) { ultimoError = e; }
    }
    throw ultimoError;
  }

  // Posición estimada de un avión en el instante t, avanzando según velocidad y rumbo
  function estimar(a, t) {
    if (a.tierra || !a.gs || a.track == null) return [a.lat, a.lon];
    const dt = Math.min(Math.max(t - a.t0, 0), 20);           // como mucho 20 s de extrapolación
    const d = a.gs * 0.514444 * dt;                             // metros recorridos (kt → m/s)
    const dLat = d * Math.cos(a.track * RAD) / 111320;
    const dLon = d * Math.sin(a.track * RAD) / (111320 * Math.cos(a.lat * RAD));
    return [a.lat + dLat, a.lon + dLon];
  }
  // Posición a dibujar: la estimada más una corrección que se desvanece en 1,5 s
  // (así, cuando llega un dato nuevo, el avión no "salta")
  function posicionDibujo(a, t) {
    const p = estimar(a, t);
    const f = 1 - (t - a.tCorr) / 1.5;
    if (f > 0) { p[0] += a.corrLat * f; p[1] += a.corrLon * f; }
    return p;
  }

  // Incorpora una respuesta de la API al diccionario de aviones
  function procesarAviones(datos) {
    const t = ahoraS();
    const vistos = new Set();
    for (const d of datos.ac) {
      if (d.lat == null || d.lon == null || !d.hex) continue;
      vistos.add(d.hex);
      const tierra = d.alt_baro === 'ground';
      const sq = d.squawk || '';
      const nuevo = {
        hex: d.hex,
        indicativo: (d.flight || '').trim() || (d.r || '').trim() || d.hex.toUpperCase(),
        tipo: d.t || '', matricula: d.r || '', desc: d.desc || '',
        alt: tierra ? 0 : (typeof d.alt_baro === 'number' ? d.alt_baro : primero(d.alt_geom)),
        tierra, gs: primero(d.gs), track: primero(d.track, d.true_heading),
        vr: primero(d.baro_rate, d.geom_rate), squawk: sq,
        militar: ((d.dbFlags || 0) & 1) === 1,
        emergencia: sq === '7500' || sq === '7600' || sq === '7700' || (d.emergency && d.emergency !== 'none'),
        lat: d.lat, lon: d.lon,
        t0: t - (d.seen_pos || 0),
        visto: t,
      };
      const viejo = aviones.get(d.hex);
      if (viejo) {
        // corrección suave entre donde lo estábamos dibujando y donde está ahora
        const antes = posicionDibujo(viejo, t), ahora = estimar(nuevo, t);
        const salto = Math.abs(antes[0] - ahora[0]) + Math.abs(antes[1] - ahora[1]);
        nuevo.corrLat = salto < 0.05 ? antes[0] - ahora[0] : 0;
        nuevo.corrLon = salto < 0.05 ? antes[1] - ahora[1] : 0;
        nuevo.tCorr = t;
        nuevo.estela = viejo.estela;
      } else {
        nuevo.corrLat = nuevo.corrLon = 0; nuevo.tCorr = 0;
        nuevo.estela = [];
      }
      // estela: guardamos posiciones reales recibidas y descartamos las de más de 60 s
      const e = nuevo.estela;
      const ult = e[e.length - 1];
      if (!ult || ult.lat !== d.lat || ult.lon !== d.lon) e.push({ t: nuevo.t0, lat: d.lat, lon: d.lon });
      while (e.length && t - e[0].t > C.estelaSeg) e.shift();
      nuevo.dist = distanciaNM(C.centro.lat, C.centro.lon, d.lat, d.lon);
      aviones.set(d.hex, nuevo);
    }
    // Quitamos los que llevan más de 15 s sin aparecer en la respuesta
    for (const [hex, a] of aviones) if (!vistos.has(hex) && t - a.visto > 15) aviones.delete(hex);
    $('numAviones').textContent = [...aviones.values()].filter((a) => a.dist <= C.radioNM).length;
  }

  // Ciclo de descarga: cada 5 s; si falla, espera cada vez más (máx. 30 s)
  // Nunca hay más de una petición en curso: si se llama mientras otra está en marcha
  // (al volver a primer plano, al recuperar internet...) simplemente se ignora.
  // Así se respeta el límite de las APIs (adsb.lol responde 429 si se le pide demasiado).
  let temporizadorAviones = 0, avionesEnCurso = false;
  async function cicloAviones() {
    if (avionesEnCurso) return;
    avionesEnCurso = true;
    clearTimeout(temporizadorAviones);
    let espera = C.refrescoAvionesSeg * 1000;
    try {
      const datos = await pedirAviones();
      procesarAviones(datos);
      conexion.ultimoOk = Date.now(); conexion.fallos = 0;
    } catch (e) {
      conexion.fallos++;
      espera = Math.min(30000, C.refrescoAvionesSeg * 1000 * Math.pow(1.6, conexion.fallos));
      if (/429/.test(e && e.message)) espera = 30000;   // "demasiadas peticiones": esperar más
      console.warn('Aviones: fallo', e);
    }
    pintarEstado();
    avionesEnCurso = false;
    temporizadorAviones = setTimeout(cicloAviones, espera);
  }

  // Colores por tipo de avión
  const COLOR = { civil: '#39ff88', militar: '#ffb020', tierra: '#8fa39a', emergencia: '#ff3b3b' };
  function colorDe(a) {
    if (a.emergencia) return COLOR.emergencia;
    if (a.tierra) return COLOR.tierra;
    if (a.militar) return COLOR.militar;
    return COLOR.civil;
  }
  function textoAltCorto(a) {
    if (a.tierra) return 'TIERRA';
    if (a.alt == null) return '';
    return a.alt >= 6000 ? 'FL' + String(Math.round(a.alt / 100)).padStart(3, '0') : miles(a.alt) + ' ft';
  }

  // Dibujo de aviones: se llama con requestAnimationFrame, limitado a fpsMax
  let ultimoFrame = 0;
  const intervaloFrame = 1000 / C.fpsMax;
  function bucleDibujo(ms) {
    requestAnimationFrame(bucleDibujo);
    if (ms - ultimoFrame < intervaloFrame - 2) return;
    ultimoFrame = ms;
    dibujarAviones();
  }

  function dibujarAviones() {
    const ctx = ctxAviones, t = ahoraS(), U = u();
    ctx.clearRect(0, 0, geo.w, geo.h);
    const parpadeo = Math.floor(t * 2.5) % 2 === 0;     // para emergencias
    const datosViejos = Date.now() - conexion.ultimoOk > 60000;
    const escala = U / 18;                        // tamaño del icono
    ctx.globalAlpha = datosViejos ? 0.45 : 1;

    // Primero las estelas (debajo), luego iconos y etiquetas (encima)
    ctx.lineCap = 'round'; ctx.lineWidth = Math.max(1.5, U * 0.12);
    for (const a of aviones.values()) {
      const e = a.estela;
      if (a.tierra || e.length === 0) continue;
      const pa = posicionDibujo(a, t);
      let [x0, y0] = aPantalla(pa[0], pa[1]);
      const col = colorDe(a);
      ctx.strokeStyle = col;
      // segmentos de más nuevo a más viejo, cada vez más transparentes
      for (let i = e.length - 1; i >= 0; i--) {
        const [x1, y1] = aPantalla(e[i].lat, e[i].lon);
        const edad = t - e[i].t;
        ctx.globalAlpha = (datosViejos ? 0.3 : 0.7) * Math.max(0, 1 - edad / C.estelaSeg);
        ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
        x0 = x1; y0 = y1;
      }
    }
    ctx.globalAlpha = datosViejos ? 0.45 : 1;

    const fuenteEtiq = `700 ${Math.round(U * 0.95)}px system-ui, sans-serif`;
    const fuenteAlt = `500 ${Math.round(U * 0.72)}px system-ui, sans-serif`;
    // Aviones en tierra primero para que los que vuelan queden por encima
    const lista = [...aviones.values()].sort((a, b) => (a.tierra === b.tierra ? 0 : a.tierra ? -1 : 1));
    for (const a of lista) {
      const p = posicionDibujo(a, t);
      const [x, y] = aPantalla(p[0], p[1]);
      a.px = x; a.py = y;                                // se guarda para detectar toques
      if (x < -40 || y < -40 || x > geo.w + 40 || y > geo.h + 40) continue;
      if (a.emergencia && !parpadeo) continue;
      const col = colorDe(a);
      const k = a.tierra ? escala * 0.7 : escala;

      // icono rotado según rumbo
      ctx.save();
      ctx.translate(x, y);
      if (a.track != null) ctx.rotate(a.track * RAD);
      ctx.scale(k, k);
      ctx.fillStyle = col; ctx.strokeStyle = 'rgba(0,0,0,0.9)'; ctx.lineWidth = 2.2 / k;  // contorno negro de ~2 px
      ctx.stroke(SILUETA); ctx.fill(SILUETA);
      ctx.restore();

      // selección actual: anillo blanco
      if (seleccion.hex === a.hex) {
        ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(x, y, U * 1.15, 0, Math.PI * 2); ctx.stroke();
      }

      // etiqueta: indicativo y altitud
      if (a.tierra && !C.etiquetasEnTierra && seleccion.hex !== a.hex) continue;
      const lx = x + U * 0.85, ly = y - U * 0.35;
      ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      ctx.lineJoin = 'round';
      ctx.font = fuenteEtiq;
      ctx.strokeStyle = 'rgba(0,0,0,0.85)'; ctx.lineWidth = 4;
      ctx.strokeText(a.indicativo, lx, ly);
      ctx.fillStyle = a.emergencia ? COLOR.emergencia : '#ffffff';
      ctx.fillText(a.indicativo, lx, ly);
      const ta = textoAltCorto(a);
      if (ta) {
        ctx.font = fuenteAlt;
        ctx.strokeText(ta, lx, ly + U * 0.85);
        ctx.fillStyle = col; ctx.fillText(ta, lx, ly + U * 0.85);
      }
    }
    ctx.globalAlpha = 1;
  }

  /* ===================== 6. TARJETA DE INFORMACIÓN ===================== */
  const seleccion = { hex: null, manualHasta: 0, indice: 0, ultimoCambio: 0 };

  // Toque en el mapa: selecciona el avión más cercano (radio de 2,5 letras)
  mapa.on('click', (ev) => {
    const { x, y } = ev.containerPoint;
    let mejor = null, dMejor = (u() * 2.5) ** 2;
    for (const a of aviones.values()) {
      if (a.px == null) continue;
      const d = (a.px - x) ** 2 + (a.py - y) ** 2;
      if (d < dMejor) { dMejor = d; mejor = a; }
    }
    if (mejor) {
      seleccion.hex = mejor.hex;
      seleccion.manualHasta = Date.now() + 30000;   // 30 s antes de volver a la rotación
    } else {
      seleccion.manualHasta = 0;                    // tocar en vacío reanuda la rotación
      seleccion.ultimoCambio = 0;
    }
    actualizarTarjeta(true);
  });

  // Elige el siguiente avión para la rotación automática (en vuelo, dentro del radio, por distancia)
  function siguienteAutomatico() {
    const candidatos = [...aviones.values()]
      .filter((a) => !a.tierra && a.dist <= C.radioNM)
      .sort((a, b) => a.dist - b.dist);
    if (!candidatos.length) return null;
    seleccion.indice = (seleccion.indice + 1) % candidatos.length;
    return candidatos[seleccion.indice].hex;
  }

  // Reduce la letra de los valores que no caben en su casilla (paneles estrechos en vertical)
  function encajar(panel) {
    panel.querySelectorAll('.rejilla b').forEach((b) => {
      b.style.fontSize = '';
      let f = 1.15;
      while (b.scrollWidth > b.clientWidth + 1 && f > 0.7) { f -= 0.05; b.style.fontSize = f + 'em'; }
    });
  }

  function actualizarTarjeta(forzar) {
    const ahora = Date.now();
    const manual = ahora < seleccion.manualHasta;
    if (!manual && (forzar || ahora - seleccion.ultimoCambio >= C.rotacionTarjetaSeg * 1000 || !aviones.has(seleccion.hex))) {
      seleccion.hex = siguienteAutomatico();
      seleccion.ultimoCambio = ahora;
    }
    const a = aviones.get(seleccion.hex);
    const tar = $('tarjeta');
    tar.classList.toggle('vacia', !a);
    tar.classList.toggle('militar', !!(a && a.militar));
    tar.classList.toggle('emergencia', !!(a && a.emergencia));
    $('cModo').textContent = a ? (manual ? 'seleccionado' : 'auto') : '';
    if (!a) {
      $('cIndicativo').textContent = aviones.size ? 'Toca un avión' : 'Sin aviones';
      ['cDesc', 'cTipo', 'cMatricula', 'cAltitud', 'cVert', 'cVel', 'cRumbo', 'cDist'].forEach((id) => { $(id).textContent = id === 'cDesc' || id === 'cDist' ? '' : '–'; });
      return;
    }
    $('cIndicativo').textContent = a.indicativo;
    $('cDesc').textContent = a.emergencia ? `⚠ EMERGENCIA · squawk ${a.squawk}` : (a.militar ? 'Militar · ' : '') + (a.desc || '');
    $('cTipo').textContent = a.tipo || '–';
    $('cMatricula').textContent = a.matricula || '–';
    $('cAltitud').textContent = a.tierra ? 'En tierra' : a.alt == null ? '–'
      : a.alt >= 6000 ? `FL${String(Math.round(a.alt / 100)).padStart(3, '0')}` + ` · ${miles(a.alt)} ft` : `${miles(a.alt)} ft`;
    // Para que quepa, en altitudes altas mostramos solo FL si el panel es estrecho
    if ($('cAltitud').scrollWidth > $('cAltitud').clientWidth + 2 && a.alt >= 6000) $('cAltitud').textContent = `FL${String(Math.round(a.alt / 100)).padStart(3, '0')}`;
    $('cVert').textContent = a.vr == null ? '–' : Math.abs(a.vr) < 64 ? '→ nivelado' : `${a.vr > 0 ? '↑' : '↓'} ${miles(Math.abs(a.vr))} ft/min`;
    $('cVel').textContent = a.gs == null ? '–' : `${Math.round(a.gs)} kt · ${Math.round(a.gs * 1.852)} km/h`;
    if ($('cVel').scrollWidth > $('cVel').clientWidth + 2 && a.gs != null) $('cVel').textContent = `${Math.round(a.gs)} kt`;
    $('cRumbo').textContent = a.track == null ? '–' : `${Math.round(a.track)}° ${cardinal(a.track)}`;
    encajar($('tarjeta'));
    $('cDist').textContent = `A ${a.dist.toFixed(1).replace('.', ',')} NM (${miles(a.dist * 1.852)} km) de ${C.centro.nombre}`;
  }

  /* ===================== 7. METEOROLOGÍA ===================== */
  // --- Radar de lluvia de RainViewer ---
  // Límites comprobados en noviembre de 2026: zoom máximo 7 (por encima devuelve "Zoom Level
  // Not Supported"), 13 fotogramas de las últimas 2 h cada 10 min, sin predicción (nowcast) y
  // sin satélite infrarrojo. Por eso usamos maxNativeZoom: 7 (Leaflet amplía las teselas).
  const lluvia = { capas: [], tiempos: [], idx: 0, temporizador: 0, pausa: 0 };

  async function cargarLluvia() {
    try {
      const d = await pedirJSON('https://api.rainviewer.com/public/weather-maps.json', 8000);
      const fotos = (d.radar && d.radar.past || []).slice(-C.lluvia.fotogramas);
      // Reutilizamos capas existentes con la misma ruta y quitamos las viejas
      const antiguas = new Map(lluvia.capas.map((c, i) => [c.options.ruta, c]));
      const nuevas = fotos.map((f) => {
        const c = antiguas.get(f.path) || L.tileLayer(`${d.host}${f.path}/256/{z}/{x}/{y}/2/1_1.png`, {
          ruta: f.path, opacity: 0, maxNativeZoom: 7, maxZoom: 19, zIndex: 10,
          attribution: '<a href="https://www.rainviewer.com/">RainViewer</a>',
        });
        antiguas.delete(f.path);
        return c;
      });
      antiguas.forEach((c) => mapa.removeLayer(c));
      lluvia.capas = nuevas;
      lluvia.tiempos = fotos.map((f) => f.time * 1000);
      lluvia.idx = nuevas.length - 1;
      aplicarCapasTiempo();
    } catch (e) {
      console.warn('RainViewer: fallo', e);
      $('tRadar').textContent = 'Radar de lluvia no disponible';
    }
  }

  // Avanza un fotograma de la animación de lluvia (se detiene un rato en el más reciente)
  function pasoLluvia() {
    const n = lluvia.capas.length;
    if (!n || !ajustes.lluvia) return;
    if (lluvia.idx === n - 1 && lluvia.pausa < 4) { lluvia.pausa++; return; }
    lluvia.pausa = 0;
    lluvia.capas[lluvia.idx].setOpacity(0);
    lluvia.idx = (lluvia.idx + 1) % n;
    lluvia.capas[lluvia.idx].setOpacity(ajustes.opacidad);
    const hora = new Intl.DateTimeFormat('es-ES', { hour: '2-digit', minute: '2-digit', timeZone: C.zonaHoraria }).format(lluvia.tiempos[lluvia.idx]);
    $('tRadar').textContent = `Radar de lluvia ${hora}${lluvia.idx === n - 1 ? ' (último)' : ''}`;
  }

  // --- Nubes (OpenWeatherMap, opcional con clave) ---
  const capaNubes = C.openWeatherMapKey
    ? L.tileLayer(`https://tile.openweathermap.org/map/clouds_new/{z}/{x}/{y}.png?appid=${encodeURIComponent(C.openWeatherMapKey)}`, {
      opacity: C.nubesOpacidad, zIndex: 5, maxZoom: 19, attribution: '© OpenWeatherMap',
    }) : null;

  // Activa o quita las capas de tiempo según los ajustes
  function aplicarCapasTiempo() {
    lluvia.capas.forEach((c, i) => {
      if (ajustes.lluvia) {
        if (!mapa.hasLayer(c)) c.addTo(mapa);
        c.setOpacity(i === lluvia.idx ? ajustes.opacidad : 0);
      } else if (mapa.hasLayer(c)) mapa.removeLayer(c);
    });
    if (!ajustes.lluvia) $('tRadar').textContent = '';
    if (capaNubes) {
      if (ajustes.nubes) { capaNubes.setOpacity(Math.min(1, ajustes.opacidad * 0.9)); if (!mapa.hasLayer(capaNubes)) capaNubes.addTo(mapa); }
      else if (mapa.hasLayer(capaNubes)) mapa.removeLayer(capaNubes);
    }
  }

  // --- Datos actuales de Open-Meteo ---
  const CIELO = {
    0: 'Despejado', 1: 'Casi despejado', 2: 'Parcialmente nuboso', 3: 'Cubierto',
    45: 'Niebla', 48: 'Niebla helada', 51: 'Llovizna', 53: 'Llovizna', 55: 'Llovizna intensa',
    56: 'Llovizna helada', 57: 'Llovizna helada', 61: 'Lluvia débil', 63: 'Lluvia', 65: 'Lluvia fuerte',
    66: 'Lluvia helada', 67: 'Lluvia helada', 71: 'Nieve débil', 73: 'Nieve', 75: 'Nieve fuerte', 77: 'Granizo fino',
    80: 'Chubascos', 81: 'Chubascos', 82: 'Chubascos fuertes', 85: 'Chubascos de nieve', 86: 'Chubascos de nieve',
    95: 'Tormenta', 96: 'Tormenta con granizo', 99: 'Tormenta con granizo',
  };
  async function cargarTiempo() {
    const url = 'https://api.open-meteo.com/v1/forecast?latitude=' + C.centro.lat + '&longitude=' + C.centro.lon +
      '&current=temperature_2m,apparent_temperature,cloud_cover,wind_speed_10m,wind_direction_10m,wind_gusts_10m,pressure_msl,weather_code' +
      '&hourly=precipitation_probability&forecast_days=2&wind_speed_unit=kmh&timezone=' + encodeURIComponent(C.zonaHoraria);
    try {
      const d = await pedirJSON(url, 10000);
      const c = d.current;
      $('tTemp').textContent = Math.round(c.temperature_2m) + '°';
      $('tCielo').textContent = CIELO[c.weather_code] || '';
      $('tSens').textContent = Math.round(c.apparent_temperature) + '°';
      $('tNubes').textContent = Math.round(c.cloud_cover) + ' %';
      $('tViento').textContent = `${cardinal(c.wind_direction_10m)} ${Math.round(c.wind_speed_10m)} km/h`;
      // La flecha apunta hacia donde VA el viento (la dirección indica de dónde viene)
      $('tFlecha').style.transform = `rotate(${c.wind_direction_10m + 180}deg)`;
      $('tRafagas').textContent = Math.round(c.wind_gusts_10m) + ' km/h';
      $('tPresion').textContent = Math.round(c.pressure_msl) + ' hPa';
      const i = d.hourly.time.indexOf(c.time.slice(0, 13) + ':00');
      const p = i >= 0 ? d.hourly.precipitation_probability[i] : null;
      $('tLluvia').textContent = p == null ? '–' : p + ' %';
      encajar($('tiempo'));
    } catch (e) {
      console.warn('Open-Meteo: fallo', e);   // se conserva el último dato mostrado
    }
  }

  /* ===================== 8. KIOSCO ===================== */
  // Reloj (hora de Madrid)
  const fmtHora = new Intl.DateTimeFormat('es-ES', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false, timeZone: C.zonaHoraria });
  const fmtFecha = new Intl.DateTimeFormat('es-ES', { weekday: 'long', day: 'numeric', month: 'long', timeZone: C.zonaHoraria });
  const fmtH = new Intl.DateTimeFormat('es-ES', { hour: 'numeric', hour12: false, timeZone: C.zonaHoraria });
  function tic() {
    const d = new Date();
    $('hora').textContent = fmtHora.format(d);
    $('fecha').textContent = fmtFecha.format(d);
    pintarEstado();
    actualizarTarjeta(false);
  }

  // Indicador de conexión: discreto cuando todo va bien, ámbar si falta el dato
  function pintarEstado() {
    const el = $('estado'), txt = $('estadoTxt');
    const sinDatos = Date.now() - conexion.ultimoOk;
    el.className = '';
    if (conexion.ultimoOk && sinDatos < 20000) {
      el.classList.add('vivo'); txt.textContent = 'En vivo';
      el.title = 'Fuente: ' + conexion.fuenteNombre;
    } else if (!navigator.onLine || conexion.ultimoOk) {
      el.classList.add('aviso');
      const min = Math.floor(sinDatos / 60000);
      // Texto corto en dos líneas para que no choque con el reloj
      txt.innerHTML = (navigator.onLine ? 'Sin datos' : 'Sin conexión') +
        (conexion.ultimoOk ? `<br>hace ${min < 1 ? Math.round(sinDatos / 1000) + ' s' : min + ' min'}` : '');
    } else if (conexion.fallos > 0) {
      el.classList.add('error');
      txt.textContent = !C.proxy && !esLocal ? 'Falta proxy' : 'Sin respuesta';
      el.title = !C.proxy && !esLocal ? 'Falta configurar el proxy en config.js (ver README)' : 'Las APIs de aviones no responden; se reintenta solo';
    } else {
      txt.textContent = 'Conectando…';
    }
  }

  // Wake Lock: mantiene la pantalla encendida; hay que pedirlo otra vez al volver a primer plano
  let candado = null;
  async function pedirWakeLock() {
    if (!('wakeLock' in navigator) || document.visibilityState !== 'visible') return;
    try {
      candado = await navigator.wakeLock.request('screen');
      candado.addEventListener('release', () => { candado = null; });
    } catch (e) { console.warn('Wake Lock no disponible', e); }
  }
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      if (!candado) pedirWakeLock();
      // al volver, refrescar enseguida si el último dato es viejo
      if (Date.now() - conexion.ultimoOk > C.refrescoAvionesSeg * 1000) cicloAviones();
    }
  });
  // Algunos navegadores solo lo conceden tras un toque
  document.addEventListener('pointerdown', () => { if (!candado) pedirWakeLock(); });

  // Modo noche: velo oscuro entre las horas configuradas
  function comprobarNoche() {
    const h = parseInt(fmtH.format(new Date()), 10);
    const { desde, hasta, atenuacion } = C.modoNoche;
    const esNoche = desde > hasta ? (h >= desde || h < hasta) : (h >= desde && h < hasta);
    $('noche').style.opacity = ajustes.noche && esNoche ? atenuacion : 0;
  }

  // Recarga completa cada 24 h (solo si hay internet; si no, se reintenta en 10 min)
  function programarRecarga(ms) {
    setTimeout(() => { if (navigator.onLine) location.reload(); else programarRecarga(10 * 60 * 1000); }, ms);
  }

  // Al recuperar internet, pedir datos inmediatamente
  window.addEventListener('online', () => { conexion.fallos = 0; cicloAviones(); cargarTiempo(); cargarLluvia(); });
  window.addEventListener('offline', pintarEstado);

  /* ===================== 9. AJUSTES Y ARRANQUE ===================== */
  function abrirAjustes() {
    $('aLluvia').checked = ajustes.lluvia;
    $('aOpacidad').value = ajustes.opacidad;
    $('aNubes').checked = ajustes.nubes && !!capaNubes;
    $('aNubes').disabled = !capaNubes;
    $('notaNubes').textContent = capaNubes ? '' : '(requiere clave en config.js)';
    $('aNoche').checked = ajustes.noche;
    $('aZoom').checked = ajustes.zoomManual;
    $('aInfo').textContent = `Centro: ${C.centro.nombre} (${C.centro.lat}, ${C.centro.lon}) · radio ${C.radioNM} NM · ` +
      `fuente: ${conexion.fuenteNombre || '—'} · proxy: ${C.proxy || (esLocal ? 'local de pruebas' : 'sin configurar')}`;
    $('ajustes').hidden = false;
  }
  $('btnAjustes').addEventListener('click', abrirAjustes);
  $('bCerrar').addEventListener('click', () => { $('ajustes').hidden = true; });
  $('ajustes').addEventListener('click', (e) => { if (e.target.id === 'ajustes') $('ajustes').hidden = true; });
  $('aLluvia').addEventListener('change', (e) => { ajustes.lluvia = e.target.checked; guardarAjustes(); aplicarCapasTiempo(); });
  $('aOpacidad').addEventListener('input', (e) => { ajustes.opacidad = parseFloat(e.target.value); guardarAjustes(); aplicarCapasTiempo(); });
  $('aNubes').addEventListener('change', (e) => { ajustes.nubes = e.target.checked; guardarAjustes(); aplicarCapasTiempo(); });
  $('aNoche').addEventListener('change', (e) => { ajustes.noche = e.target.checked; guardarAjustes(); comprobarNoche(); });
  $('aZoom').addEventListener('change', (e) => {
    // Modo "tocar para ajustar zoom": permite arrastrar y pellizcar el mapa
    ajustes.zoomManual = e.target.checked;
    const h = [mapa.dragging, mapa.touchZoom, mapa.doubleClickZoom, mapa.scrollWheelZoom];
    h.forEach((x) => (ajustes.zoomManual ? x.enable() : x.disable()));
    if (!ajustes.zoomManual) encuadrar();
  });
  $('bCentrar').addEventListener('click', () => { encuadrar(); });
  $('bPantalla').addEventListener('click', () => {
    const el = document.documentElement;
    if (document.fullscreenElement) document.exitFullscreen();
    else if (el.requestFullscreen) el.requestFullscreen().catch(() => {});
  });
  $('bRecargar').addEventListener('click', () => location.reload());

  // Cambio de tamaño u orientación: reencuadrar (con un pequeño retraso para agrupar eventos)
  let tReencuadre = 0;
  function alCambiarTamano() {
    clearTimeout(tReencuadre);
    tReencuadre = setTimeout(() => {
      mapa.invalidateSize({ animate: false });
      if (!ajustes.zoomManual) encuadrar();
      actualizarGeometria();
    }, 150);
  }
  window.addEventListener('resize', alCambiarTamano);
  window.addEventListener('orientationchange', alCambiarTamano);
  mapa.on('move zoom', actualizarGeometria);

  // Service worker: guarda la app para que arranque al instante (solo en https o localhost)
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || esLocal)) {
    navigator.serviceWorker.register('sw.js').catch((e) => console.warn('SW no registrado', e));
  }

  // --- Arranque ---
  encuadrar();
  actualizarGeometria();
  tic(); setInterval(tic, 1000);
  cicloAviones();                                    // primero los aviones: lo más importante
  cargarTiempo(); setInterval(cargarTiempo, C.refrescoTiempoMin * 60 * 1000);
  cargarLluvia(); setInterval(cargarLluvia, 10 * 60 * 1000);
  setInterval(pasoLluvia, C.lluvia.msPorFotograma);
  comprobarNoche(); setInterval(comprobarNoche, 60 * 1000);
  pedirWakeLock();
  programarRecarga(C.recargaCadaHoras * 3600 * 1000);
  requestAnimationFrame(bucleDibujo);
})();
