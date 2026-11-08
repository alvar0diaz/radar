/* =====================================================================
 * PROXY DE RESPALDO EN GOOGLE APPS SCRIPT
 * ---------------------------------------------------------------------
 * Hace lo mismo que proxy/worker.js (Cloudflare), pero en los servidores
 * de Google. Sirve para cuando los operadores españoles bloquean
 * direcciones de Cloudflare durante los partidos de fútbol (bloqueos de
 * LaLiga): la app detecta que el proxy de Cloudflare no responde y usa este.
 *
 * Se llama así:  .../exec?p=/adsblol/v2/point/40.28/-3.79/30
 * Solo reenvía consultas "/v2/point/lat/lon/radio" a airplanes.live y
 * adsb.lol: no es un proxy abierto.
 *
 * Límite gratuito de Google: unas 20.000 consultas al día. Como solo se usa
 * mientras el proxy principal está bloqueado, sobra.
 *
 * Cómo publicarlo: ver README.md, "Proxy de respaldo (Google)".
 * ===================================================================== */

var DESTINOS = {
  airplanes: 'https://api.airplanes.live',
  adsblol: 'https://api.adsb.lol'
};

var PATRON = /^\/(airplanes|adsblol)(\/v2\/point\/-?\d{1,3}(?:\.\d+)?\/-?\d{1,3}(?:\.\d+)?\/\d{1,3})$/;

function json(texto) {
  return ContentService.createTextOutput(texto).setMimeType(ContentService.MimeType.JSON);
}

function doGet(e) {
  var p = (e && e.parameter && e.parameter.p) || '';
  if (!p) return json('{"ok":"Proxy del radar: OK"}');
  var m = p.match(PATRON);
  if (!m) return json('{"error":"Ruta no permitida"}');
  try {
    var r = UrlFetchApp.fetch(DESTINOS[m[1]] + m[2], {
      muteHttpExceptions: true,
      headers: { 'Accept': 'application/json' }
    });
    if (r.getResponseCode() !== 200) return json('{"error":"HTTP ' + r.getResponseCode() + '"}');
    return json(r.getContentText());
  } catch (err) {
    return json(JSON.stringify({ error: String(err) }));
  }
}

// Para probar desde el editor: Ejecutar → probar
function probar() {
  Logger.log(doGet({ parameter: { p: '/adsblol/v2/point/40.2842/-3.7942/10' } }).getContent().slice(0, 200));
}
