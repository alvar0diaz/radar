/* =====================================================================
 * PROXY DE RESPALDO EN GOOGLE APPS SCRIPT
 * ---------------------------------------------------------------------
 * Hace lo mismo que proxy/worker.js (Cloudflare), pero en los servidores
 * de Google. Sirve para cuando los operadores españoles bloquean
 * direcciones de Cloudflare durante los partidos de fútbol (bloqueos de
 * LaLiga): la app detecta que el proxy de Cloudflare no responde y usa este.
 *
 * Se llama así:  .../exec?p=/adsblol/v2/point/40.28/-3.79/30
 * Solo reenvía consultas "/v2/point/lat/lon/radio": no es un proxy abierto.
 *
 * Como muchos usan los servidores de Google, adsb.lol a veces responde
 * "demasiadas peticiones" (429). Por eso se reintenta y, si sigue
 * fallando, se pregunta a adsb.fi (mismos datos, mismo formato).
 *
 * Límite gratuito de Google: unas 20.000 consultas al día. Como solo se usa
 * mientras el proxy principal está bloqueado, sobra.
 *
 * Cómo publicarlo: ver README.md, "Paso 4 bis".
 * ===================================================================== */

var PATRON = /^\/(airplanes|adsblol)\/v2\/point\/(-?\d{1,3}(?:\.\d+)?)\/(-?\d{1,3}(?:\.\d+)?)\/(\d{1,3})$/;

function json(texto) {
  return ContentService.createTextOutput(texto).setMimeType(ContentService.MimeType.JSON);
}

// Pide una URL; si contesta 429 (demasiadas peticiones) lo reintenta un par de veces
function pedir(url, intentos) {
  var r;
  for (var k = 0; k < intentos; k++) {
    r = UrlFetchApp.fetch(url, { muteHttpExceptions: true, headers: { 'Accept': 'application/json' } });
    if (r.getResponseCode() !== 429) return r;
    Utilities.sleep(600 + 600 * k);
  }
  return r;
}

function doGet(e) {
  var p = (e && e.parameter && e.parameter.p) || '';
  if (!p) return json('{"ok":"Proxy del radar: OK"}');
  var m = p.match(PATRON);
  if (!m) return json('{"error":"Ruta no permitida"}');
  var lat = m[2], lon = m[3], radio = m[4];
  var codigos = [];
  try {
    // 1) adsb.lol (o airplanes.live si se pide esa ruta)
    var base = m[1] === 'airplanes' ? 'https://api.airplanes.live' : 'https://api.adsb.lol';
    var r = pedir(base + '/v2/point/' + lat + '/' + lon + '/' + radio, 3);
    if (r.getResponseCode() === 200) return json(r.getContentText());
    codigos.push(r.getResponseCode());

    // 2) adsb.fi: mismos datos; su lista se llama "aircraft" en vez de "ac"
    var f = pedir('https://opendata.adsb.fi/api/v2/lat/' + lat + '/lon/' + lon + '/dist/' + radio, 2);
    if (f.getResponseCode() === 200) {
      var d = JSON.parse(f.getContentText());
      return json(JSON.stringify({ ac: d.aircraft || [], now: d.now, fuente: 'adsb.fi' }));
    }
    codigos.push(f.getResponseCode());
    return json('{"error":"HTTP ' + codigos.join('/') + '"}');
  } catch (err) {
    return json(JSON.stringify({ error: String(err) }));
  }
}

// Para probar desde el editor: Ejecutar → probar
function probar() {
  Logger.log(doGet({ parameter: { p: '/adsblol/v2/point/40.2842/-3.7942/10' } }).getContent().slice(0, 200));
}
