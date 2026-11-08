# Radar de vuelos para tablet (PWA a pantalla completa)

## Objetivo
Aplicación web instalable (PWA) que muestre de forma permanente, a pantalla completa, un radar con los aviones alrededor de Fuenlabrada, más información meteorológica (nubes, lluvia, viento). Pensada para una tablet Android de 7" fija en un marco en un despacho, encendida 24/7.

## Dispositivo objetivo y alcance
- Tablet Android de 7" antigua (probablemente Android 12 o 13), usada con Chrome.
- Esta fase es solo la PWA. El APK (Capacitor + GitHub Actions) queda fuera de alcance, pero no escribas nada que lo impida: mantén la app como web estática sin backend.
- Prioriza rendimiento en hardware modesto: pocos elementos en el DOM, animaciones con `transform`/canvas, sin librerías pesadas.

## Requisitos funcionales

### Ubicación y alcance
- Centro: Fuenlabrada, lat 40.2842, lon -3.7942 (configurable en `config.js`).
- Radio: 40 NM (~74 km), configurable.
- Anillos de distancia cada 10 NM con etiqueta, rosa de los vientos (N/E/S/W) y barrido de radar animado (estilo de la imagen de referencia).

### Aviones
- Fuente de datos: API ADS-B pública y gratuita, sin clave. Principal: `https://api.airplanes.live/v2/point/{lat}/{lon}/{radio_nm}`. Alternativa automática si falla: `https://api.adsb.lol/v2/point/{lat}/{lon}/{radio_nm}`.
- Refresco cada 5 s. Interpolar la posición entre actualizaciones para que el movimiento sea suave.
- Icono de avión rotado según rumbo (`track`). Distinguir por color: civil, militar (campo `dbFlags` bit 1), en tierra, emergencia (squawk 7500/7600/7700 en rojo parpadeante).
- Estela corta (últimos ~60 s) detrás de cada avión.
- Etiqueta con indicativo (`flight`). Al tocar un avión o automáticamente en rotación cada ~8 s: tarjeta con indicativo, tipo (`t`), matrícula (`r`), altitud (ft/FL), velocidad (kt), rumbo, velocidad vertical, distancia desde Fuenlabrada.
- Contador de aviones visibles arriba a la izquierda y hora local (Europe/Madrid) arriba al centro.
- Marcar el aeropuerto de Getafe (LEGT), Cuatro Vientos (LECU) y Barajas (LEMD) como referencias en el mapa.

### Mapa
- Leaflet con teselas oscuras gratuitas de CARTO (`dark_all`) con atribución visible.
- Sin interacción accidental: pan/zoom desactivados por defecto, salvo un modo "tocar para ajustar zoom" opcional.

### Meteorología
- Capa de radar de lluvia: RainViewer (`https://api.rainviewer.com/public/weather-maps.json`) con animación de los últimos fotogramas. Verificar en el momento de construir los límites actuales de zoom y fotogramas de la API.
- Capa de nubes: usar satélite infrarrojo de RainViewer si sigue disponible; si no, alternativa con teselas de OpenWeatherMap (`clouds_new`, requiere clave gratuita en `config.js`, opcional).
- Panel de datos actuales con Open-Meteo (sin clave): temperatura, sensación térmica, nubosidad %, viento (dirección y velocidad), presión, probabilidad de precipitación. Refresco cada 10 min.
- Botón/ajuste para activar o desactivar la capa meteorológica y su opacidad.

## Requisitos de pantalla y kiosco
- Mapa y radar ocupan el 100 % de la pantalla (landscape y portrait), sin barras ni márgenes. Diseño responsive para 7".
- Superposiciones (HUD) semitransparentes en los bordes, texto grande y legible a 1-2 m de distancia.
- Wake Lock API para que la pantalla no se apague; reintentar al recuperar visibilidad.
- Manifest con `display: fullscreen`, `orientation: any`, iconos y `theme_color` oscuro.
- Service worker: cachea la app shell para arranque instantáneo; los datos siempre en vivo.
- Reconexión automática si cae internet, con indicador discreto "sin conexión" y último dato conocido.
- Modo noche: atenuar brillo de la interfaz entre 23:00 y 07:00 (configurable).
- Recarga completa automática cada 24 h para evitar fugas de memoria.

## Stack
- HTML + JavaScript vanilla (o Vite si simplifica), Leaflet. Sin backend.
- Si alguna API bloquea por CORS, añadir un proxy mínimo (Cloudflare Worker o Node) y documentarlo.
- Estructura sugerida:
  - `index.html`, `app.js`, `config.js`, `style.css`
  - `manifest.webmanifest`, `sw.js`, `icons/`
  - `README.md` con instrucciones de uso

## Despliegue y uso en la tablet
1. Publicar en GitHub Pages o Netlify (HTTPS obligatorio para PWA y Wake Lock).
2. En la tablet: abrir la URL en Chrome, "Añadir a pantalla de inicio".
3. Ajustes de Android: pantalla siempre encendida mientras carga, brillo fijo, cargador conectado, desactivar optimización de batería para Chrome.
4. Opcional: app de kiosco (por ejemplo Fully Kiosk Browser) para bloquear la tablet en la URL.

## Criterios de aceptación
- Arranca y muestra aviones reales en menos de 5 s.
- Fluido a 30+ fps en una tablet modesta.
- Funciona 24 h seguidas sin congelarse.
- Cambiar ubicación o radio solo requiere editar `config.js`.
- Todo el código comentado en español.

## Ideas futuras
- Alarma sonora al entrar un avión concreto (por matrícula o tipo).
- Histórico del día: máximo de aviones, tipos más vistos.
- Lista lateral de vuelos con origen y destino.
