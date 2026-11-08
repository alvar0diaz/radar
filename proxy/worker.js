/* =====================================================================
 * PROXY MÍNIMO PARA CLOUDFLARE WORKERS
 * ---------------------------------------------------------------------
 * Las APIs de aviones (airplanes.live y adsb.lol) no envían la cabecera
 * CORS, así que el navegador de la tablet no puede leerlas directamente.
 * Este Worker hace la petición por la app y le añade esa cabecera.
 *
 * Solo reenvía consultas de tipo "/v2/point/lat/lon/radio" a esas dos
 * APIs: no es un proxy abierto que cualquiera pueda usar para otra cosa.
 *
 * Cómo publicarlo: ver README.md, paso 3 (copiar y pegar en Cloudflare).
 * ===================================================================== */

// Destinos permitidos: prefijo de la ruta -> servidor real
const DESTINOS = {
  airplanes: 'https://api.airplanes.live',
  adsblol: 'https://api.adsb.lol',
};

// Solo se aceptan rutas con este formato exacto (números con decimales)
const PATRON = /^\/(airplanes|adsblol)(\/v2\/point\/-?\d{1,3}(?:\.\d+)?\/-?\d{1,3}(?:\.\d+)?\/\d{1,3})$/;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Cache-Control': 'no-store',
};

export default {
  async fetch(request) {
    // Respuesta a la "pre-consulta" CORS del navegador
    if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });
    if (request.method !== 'GET') return new Response('Método no permitido', { status: 405, headers: CORS });

    const url = new URL(request.url);
    const m = url.pathname.match(PATRON);
    if (!m) return new Response('Ruta no permitida', { status: 404, headers: CORS });

    try {
      const destino = DESTINOS[m[1]] + m[2];
      const r = await fetch(destino, {
        headers: { 'Accept': 'application/json', 'User-Agent': 'radar-tablet-pwa (proxy Cloudflare Worker)' },
        cf: { cacheTtl: 2 }, // pequeña caché: si varias tablets piden lo mismo, una sola consulta
      });
      return new Response(r.body, {
        status: r.status,
        headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    } catch (e) {
      return new Response(JSON.stringify({ error: String(e) }), { status: 502, headers: { ...CORS, 'Content-Type': 'application/json' } });
    }
  },
};
