/* =====================================================================
 * CONFIGURACIÓN DEL RADAR
 * ---------------------------------------------------------------------
 * Este es el ÚNICO archivo que necesitas tocar para cambiar la ubicación,
 * el radio, el proxy o los horarios. Guarda el archivo y recarga la app.
 * ===================================================================== */
window.CONFIG = {
  // --- Ubicación y alcance -------------------------------------------
  centro: { lat: 40.2842, lon: -3.7942, nombre: 'Fuenlabrada' },
  radioNM: 20,              // radio inicial en millas náuticas (1 NM = 1,852 km). Se puede
                            // cambiar en la tablet: ⚙ → Radio (de 5 a 50 NM); se recuerda.
  radioMinNM: 5, radioMaxNM: 50, radioPasoNM: 5,  // límites y salto del selector de radio
  anilloCadaNM: 0,          // separación entre anillos; 0 = automática según el radio

  // --- Mapa base -----------------------------------------------------
  // CARTO (dark_all) exige desde 2026 una clave gratuita; sin ella sus teselas salen
  // con la marca "API KEY REQUIRED". Pídela gratis y sin cuenta en
  // https://carto.com/basemaps/apikey y pégala aquí (ver README).
  // Si la dejas vacía se usa el mapa oscuro de Esri, que no necesita clave.
  cartoKey: '',

  // --- Proxy para los datos de aviones -------------------------------
  // Las APIs de aviones no permiten que un navegador las consulte directamente
  // (bloqueo CORS), así que hace falta un pequeño "puente" (Cloudflare Worker).
  // Pega aquí la dirección de tu Worker (ver README, paso 3). Ejemplo:
  //   proxy: 'https://radar-proxy.tu-usuario.workers.dev',
  // Si lo dejas vacío y abres la app en tu ordenador (localhost), se usa el
  // proxy local de pruebas (proxy/proxy_local.py) en el puerto 8781.
  proxy: 'https://radar-proxy.alvarods92.workers.dev',
  // Proxy de respaldo fuera de Cloudflare (Google Apps Script, ver README). Termina en
  // "exec?p=". Se usa solo si el
  // principal no responde, por ejemplo cuando los operadores bloquean Cloudflare
  // durante los partidos de fútbol. Vacío = sin respaldo.
  proxyRespaldo: 'https://script.google.com/macros/s/AKfycbwvavCkYnnLtBnF6EO4_XJ6KM2Sy8OtFQZaP3CZV0fAqmlWigC-cNVDENm7sw4GDE_8/exec?p=',

  // Fuentes ADS-B en orden de preferencia. Si la primera falla se usa la
  // siguiente automáticamente. {lat} {lon} {r} se sustituyen solos.
  fuentes: [
    // airplanes.live exige desde 2026 pedir permiso por correo (responde 403), así que
    // está desactivada. Si te dan acceso, quita las dos barras de la línea siguiente.
    // { nombre: 'airplanes.live', ruta: '/airplanes/v2/point/{lat}/{lon}/{r}' },
    { nombre: 'adsb.lol',       ruta: '/adsblol/v2/point/{lat}/{lon}/{r}' },
  ],
  refrescoAvionesSeg: 5,    // cada cuántos segundos se piden los aviones
  estelaSeg: 60,            // duración de la estela detrás de cada avión
  rotacionTarjetaSeg: 8,    // cada cuántos segundos cambia la tarjeta automática
  etiquetasEnTierra: false, // mostrar el indicativo de los aviones en tierra (suele saturar Barajas)

  // --- Aeropuertos de referencia -------------------------------------
  aeropuertos: [
    { icao: 'LEMD', nombre: 'Barajas',        lat: 40.4719, lon: -3.5626 },
    { icao: 'LEGT', nombre: 'Getafe',         lat: 40.2941, lon: -3.7238 },
    { icao: 'LECU', nombre: 'Cuatro Vientos', lat: 40.3706, lon: -3.7851 },
  ],

  // --- Meteorología ---------------------------------------------------
  refrescoTiempoMin: 10,    // panel de Open-Meteo
  lluvia: {
    activa: true,           // capa de radar de lluvia (RainViewer)
    opacidad: 0.6,
    fotogramas: 8,          // RainViewer gratuito ofrece hasta 13 (últimas 2 h, cada 10 min)
    msPorFotograma: 600,
  },
  // Capa de nubes: RainViewer ya no ofrece satélite infrarrojo (comprobado
  // en noviembre de 2026), así que se usa OpenWeatherMap si pones una clave
  // gratuita aquí (https://openweathermap.org/api). Vacío = sin capa de nubes.
  openWeatherMapKey: '',
  nubesOpacidad: 0.5,

  // --- Pantalla / kiosco ---------------------------------------------
  modoNoche: { activo: true, desde: 23, hasta: 7, atenuacion: 0.55 }, // 0 = nada, 1 = negro
  recargaCadaHoras: 24,     // recarga completa para evitar fugas de memoria
  fpsMax: 30,               // límite de fotogramas por segundo (ahorra batería/CPU)
  zonaHoraria: 'Europe/Madrid',
};
