# Radar de vuelos para tablet

Aplicación web que convierte una tablet en un radar de aviones a pantalla completa,
centrado en Fuenlabrada (radio ajustable de 5 a 50 NM), con lluvia, viento y temperatura. Se instala en la tablet
como si fuera una app y funciona las 24 horas.

## Tu instalación (ya hecha)

Los pasos 1 a 4 ya están hechos con tus cuentas:

- **App publicada:** <https://alvar0diaz.github.io/radar/> (repositorio: <https://github.com/alvar0diaz/radar>)
- **Puente de datos (Cloudflare Worker):** `https://radar-proxy.alvarods92.workers.dev`, ya puesto en `config.js`.

Solo te queda instalarla en la tablet. **Tu tablet tiene Android 5.1: usa Firefox, no Chrome**
(ve a [Tablets con Android 5, 6 o 7](#tablets-con-android-5-6-o-7-usa-firefox)). Para tablets
modernas, el **paso 6**. El resto de la guía sirve por si algún día hay que repetirlo desde cero.

---

Esta guía no da nada por sabido. Sigue los pasos en orden: la primera vez se tarda
unos 30-40 minutos. No hay que instalar nada en el ordenador.

---

## Qué necesitas

- Un ordenador con navegador (para publicar la app).
- La tablet Android con Chrome.
- Una dirección de correo electrónico (para crear dos cuentas gratuitas: GitHub y Cloudflare).

## Qué hay en esta carpeta

| Archivo / carpeta | Para qué sirve |
|---|---|
| `index.html`, `app.js`, `style.css` | La aplicación. No hace falta tocarlos. |
| `config.js` | **Los ajustes**: ubicación, radio, horario nocturno, claves… Es el único archivo que tendrás que editar. |
| `manifest.webmanifest`, `sw.js`, `icons/` | Lo que permite instalarla en la tablet y que arranque al instante. |
| `vendor/leaflet/` | La librería del mapa (copiada aquí para que funcione aunque falle internet). |
| `proxy/worker.js` | El "puente" para los datos de aviones (paso 3). |
| `proxy/proxy_local.py` | Solo para probar la app en el ordenador (opcional). |

---

## Paso 1 · Crear una cuenta en GitHub

GitHub es un servicio gratuito donde se guarda y se publica la app.

1. Entra en <https://github.com/signup>.
2. Escribe tu correo, una contraseña y un nombre de usuario. **Apunta el nombre de usuario**:
   formará parte de la dirección de la app (por ejemplo, si eres `alvaro92`, la app
   estará en `https://alvaro92.github.io/radar/`).
3. Confirma el correo que te envían.

## Paso 2 · Subir la app y publicarla con GitHub Pages

1. Con la sesión iniciada, abre <https://github.com/new>.
2. En **Repository name** escribe `radar` (en minúsculas).
3. Marca **Public** (GitHub Pages gratis solo funciona con repositorios públicos).
4. Pulsa el botón verde **Create repository**.
5. En la página que aparece, pulsa el enlace **uploading an existing file**
   (en la frase "…or upload an existing file").
6. Abre en tu ordenador la carpeta de este proyecto, selecciona **todo su contenido**
   (archivos y carpetas: `index.html`, `app.js`, `config.js`, `icons`, `vendor`, `proxy`…)
   y arrástralo a la ventana del navegador.
   - Arrastra el *contenido* de la carpeta, no la carpeta entera: `index.html` tiene que
     quedar en la raíz, no dentro de otra carpeta.
   - Si ves una carpeta `.claude` u otras que empiezan por punto, no hace falta subirlas.
7. Espera a que termine de cargar la lista y pulsa **Commit changes** (abajo).
8. Ve a la pestaña **Settings** (arriba, con un engranaje) → en el menú de la izquierda,
   **Pages**.
9. En **Build and deployment** → **Source**, elige **Deploy from a branch**.
   En **Branch**, elige `main` y carpeta `/ (root)`. Pulsa **Save**.
10. Espera 1-2 minutos y recarga esa página. Arriba aparecerá
    **"Your site is live at https://TU-USUARIO.github.io/radar/"**. Esa es la dirección de tu app.

Si la abres ahora verás el mapa, el reloj y el tiempo, pero arriba a la derecha pondrá
**"Falta proxy"** y no habrá aviones. Es normal: falta el paso 3.

## Paso 3 · Crear el "puente" para los datos de aviones (Cloudflare Worker)

**Por qué hace falta:** las webs que dan las posiciones de los aviones (airplanes.live y
adsb.lol) no dejan que otra web les pida datos directamente desde el navegador
(una protección llamada *CORS*). Un pequeño programa gratuito en Cloudflare hace la
consulta por nosotros y se la pasa a la app. Solo reenvía consultas de aviones; no sirve
para nada más.

1. Crea una cuenta gratuita en <https://dash.cloudflare.com/sign-up> y confirma el correo.
2. Dentro del panel, en el menú de la izquierda, entra en **Workers & Pages**
   (puede estar dentro de **Compute**).
3. Pulsa **Create** (o **Create application**) → **Start with Hello World!** (o **Create Worker**).
4. En el nombre escribe `radar-proxy` y pulsa **Deploy**.
5. Cuando termine, pulsa **Edit code** (o **Continue to project** → **Edit code**).
6. Verás un editor con código de ejemplo. Bórralo todo (clic dentro, `Ctrl+A` o `Cmd+A`, y `Supr`).
7. Abre el archivo `proxy/worker.js` de esta carpeta (con doble clic se abre en un editor de
   texto; también puedes verlo en GitHub), copia **todo** su contenido y pégalo en el editor de Cloudflare.
8. Pulsa **Deploy** (arriba a la derecha) y confirma.
9. Copia la dirección del Worker. Se parece a `https://radar-proxy.TU-NOMBRE.workers.dev`.
10. **Comprueba que funciona**: abre en el navegador esa dirección añadiendo al final
    `/adsblol/v2/point/40.2842/-3.7942/40`, por ejemplo:
    `https://radar-proxy.TU-NOMBRE.workers.dev/adsblol/v2/point/40.2842/-3.7942/40`
    Debe salir mucho texto que empieza por `{"ac":[`. Si sale eso, el puente funciona.

El plan gratuito de Cloudflare permite 100.000 consultas al día; la tablet hace unas
17.300 (una cada 5 segundos), así que sobra incluso para varias tablets.

## Paso 4 · Decirle a la app dónde está el puente

1. En GitHub, abre tu repositorio `radar` y pulsa el archivo **config.js**.
2. Pulsa el icono del **lápiz** (Edit this file), arriba a la derecha del contenido.
3. Busca la línea `proxy: '',` y pon tu dirección entre las comillas, **sin barra al final**:
   ```js
   proxy: 'https://radar-proxy.TU-NOMBRE.workers.dev',
   ```
   Respeta las comillas simples y la coma final.
4. Pulsa **Commit changes…** y otra vez **Commit changes**.
5. Espera 1-2 minutos y abre tu app (`https://TU-USUARIO.github.io/radar/`).
   Arriba a la derecha debe poner **EN VIVO** con un punto verde, y aparecer los aviones.

> Si ya la tenías abierta, recárgala **dos veces**: la primera descarga la versión nueva y
> la segunda la muestra.

## Paso 5 (opcional) · Claves gratuitas para mejorar el mapa

Se ponen en `config.js` igual que el proxy (lápiz → editar → Commit changes).

- **Mapa CARTO** (`cartoKey`): sin clave la app usa el mapa oscuro de Esri, que funciona
  bien. Si prefieres el mapa oscuro de CARTO, pide una clave gratis (no hace falta cuenta)
  en <https://carto.com/basemaps/apikey> y pégala en `cartoKey: '...'`.
  Es gratuita para uso no comercial hasta 5 millones de teselas al mes.
- **Nubes** (`openWeatherMapKey`): RainViewer ya no ofrece imagen de satélite de nubes.
  Si quieres una capa de nubes, crea una cuenta gratuita en <https://openweathermap.org/api>,
  copia tu "API key" y pégala en `openWeatherMapKey: '...'`. (La clave nueva puede tardar
  unas horas en activarse.) El porcentaje de nubes del panel del tiempo funciona sin clave.

Ten en cuenta que el repositorio es público: cualquiera podría ver estas claves. Son
gratuitas y solo dan acceso a mapas, pero no pongas aquí contraseñas ni nada privado.

---

## Tablets con Android 5, 6 o 7: usa Firefox

**Por qué:** casi todas las webs que usa la app (GitHub, Cloudflare, Open-Meteo, RainViewer)
tienen certificados de seguridad de *Let's Encrypt*. Android anterior a 7.1 no los reconoce y
Chrome usa los del sistema, así que en esas tablets Chrome mostraría **"La conexión no es privada"**
y no cargaría nada. Además, Chrome dejó de actualizarse en Android 5 (última versión: 95).
Firefox lleva sus propios certificados, así que no tiene ese problema. La última versión para
Android 5 es la 143, y ya incluye lo necesario para mantener la pantalla encendida.

1. En la tablet, abre **Google Play**, busca **Firefox** (de Mozilla) e instálalo.
   Play instalará sola la última versión compatible con tu tablet.
   - Si Play no funciona en la tablet, descarga el instalador oficial de Mozilla:
     <https://archive.mozilla.org/pub/fenix/releases/143.0/android/> → carpeta
     `fenix-143.0-android-arm64-v8a` (o `armeabi-v7a` si la tablet es de 32 bits) → archivo `.apk`.
     Para instalarlo tendrás que permitir "Orígenes desconocidos" en Ajustes → Seguridad.
2. Abre Firefox y escribe `https://alvar0diaz.github.io/radar/`. Espera a que salgan los aviones.
3. Toca el menú **⋮** → **Añadir a pantalla de inicio** (o **Instalar**) → **Añadir**.
4. Abre la app desde el nuevo icono **Radar** de la pantalla de inicio.
   Si se ven barras arriba o abajo, toca ⚙ → **Pantalla completa**.
5. Haz los ajustes del **paso 7**, cambiando "Chrome" por **Firefox** en el punto 4
   (batería sin restricciones).

> **Si prefieres Chrome** en una tablet antigua: hay que instalar en Android los certificados
> raíz de Let's Encrypt (*ISRG Root X1* y *X2*, de <https://letsencrypt.org/certificates/>) en
> Ajustes → Seguridad → *Instalar desde almacenamiento*. Android obliga a tener un PIN o patrón
> de bloqueo para ello y muestra siempre un aviso de "red supervisada". Por eso es más sencillo
> Firefox. Esto también afecta a Fully Kiosk Browser, que usa los certificados del sistema.

## Paso 6 · Instalar la app en la tablet (Chrome, Android 8 o posterior)

1. Conecta la tablet a la wifi y abre **Chrome**.
2. Escribe la dirección de tu app (`https://TU-USUARIO.github.io/radar/`) y espera a que
   carguen los aviones.
3. Toca el menú **⋮** (tres puntos, arriba a la derecha).
4. Toca **Instalar aplicación** o **Añadir a pantalla de inicio** (según la versión de Chrome)
   y confirma con **Instalar** / **Añadir**.
5. Aparecerá el icono **Radar** en la pantalla de inicio. Ábrela siempre desde ese icono:
   así se abre a pantalla completa, sin barras.
6. Funciona en horizontal y en vertical: gira la tablet como quede mejor en el marco.

## Paso 7 · Ajustes de Android para tenerla encendida 24 h

Los nombres exactos cambian un poco según la marca de la tablet.

1. **Cargador siempre conectado.**
2. **Que la pantalla no se apague mientras carga** (la app ya lo pide, esto es una garantía extra):
   - Ajustes → **Información del dispositivo** (o *Acerca de la tablet*) → **Información de software**
     → toca **7 veces** seguidas en **Número de compilación**. Saldrá "Ya eres desarrollador".
   - Vuelve a Ajustes → **Opciones de desarrollador** → activa **Pantalla activa**
     (o *Mantener pantalla encendida* / *Stay awake*).
3. **Brillo fijo:** Ajustes → Pantalla → desactiva **Brillo automático / adaptable** y deja el
   brillo a tu gusto. (La app oscurece la pantalla sola de 23:00 a 07:00.)
4. **Que Android no cierre Chrome:** Ajustes → Aplicaciones → **Chrome** → **Batería** →
   **Sin restricciones** (o *No optimizar*).
5. **Desactiva el bloqueo de pantalla** si quieres que no pida PIN tras un corte de luz:
   Ajustes → Seguridad / Pantalla de bloqueo → Ninguno.

### Opcional: modo quiosco

Si quieres que nadie pueda salir de la app, instala **Fully Kiosk Browser** desde Google Play,
pon tu dirección como *Start URL* y activa *Kiosk mode*. Hay una versión gratuita y una de pago
con más opciones. **No funciona en Android 5-7** sin instalar antes los certificados (ver
"Tablets con Android 5, 6 o 7").

---

## Uso diario

- **Arriba a la izquierda:** número de aviones dentro del radio.
- **Arriba al centro:** hora de Madrid y fecha.
- **Arriba a la derecha:** estado de la conexión (**EN VIVO** en verde; **SIN DATOS** o
  **SIN CONEXIÓN** en ámbar, con el tiempo desde el último dato) y el botón ⚙ de ajustes.
- **Abajo a la izquierda:** el tiempo en Fuenlabrada (se actualiza cada 10 minutos) y la hora
  del fotograma del radar de lluvia.
- **Origen y destino:** la ficha muestra la aerolínea y la ruta en grande (códigos de aeropuerto,
  p. ej. `MAD → UIO`) con las ciudades debajo; el avión de la ficha la lleva también en su
  etiqueta del radar. Sale de adsbdb.com a partir del indicativo del vuelo, así que es muy fiable en
  vuelos regulares pero puede fallar en chárter o desvíos. Los vuelos privados (con matrícula
  como indicativo) no tienen ruta. La primera vez tarda unos segundos en aparecer.
- **Abajo a la derecha:** ficha de un avión. Cambia sola cada 8 segundos; si **tocas un avión**,
  se queda fija en ese durante 30 segundos. Tocar en una zona vacía vuelve al modo automático.
- **Colores:** verde = civil; ámbar = militar; gris = en tierra; **rojo parpadeante** = emergencia
  (códigos 7500, 7600 o 7700).
- **Cuadrados azules:** aeropuertos de Barajas (LEMD), Getafe (LEGT) y Cuatro Vientos (LECU).
- **Radio del radar:** botón ⚙ → **Radio**, con los botones **−** / **+** o la barra, de
  **5 a 50 NM** (de 5 en 5; 1 NM = 1,85 km). El mapa se reencuadra al momento, los anillos se
  reparten solos y la tablet recuerda tu elección aunque se reinicie.
- **Botón ⚙:** activar/desactivar la lluvia y su opacidad, las nubes, el modo noche, y
  "Tocar para ajustar zoom" (permite mover y ampliar el mapa con los dedos; al desactivarlo
  vuelve al encuadre normal).

La app se recarga sola una vez al día para evitar que se ralentice, y si se corta internet
sigue mostrando los últimos datos y se reconecta sola.

## Cambiar la ubicación, el radio u otros ajustes

Edita `config.js` en GitHub (lápiz → cambiar → **Commit changes**). Por ejemplo:

```js
centro: { lat: 40.2842, lon: -3.7942, nombre: 'Fuenlabrada' },
radioNM: 20,          // radio inicial; en la tablet se cambia desde ⚙ → Radio
radioMinNM: 5, radioMaxNM: 50, radioPasoNM: 5,
```

Para saber la latitud y longitud de un sitio: en Google Maps, mantén pulsado el punto y
aparecerán los dos números arriba (el primero es la latitud).

La tablet recoge los cambios sola en la siguiente recarga diaria. Para verlos al momento,
cierra la app y ábrela dos veces. Si alguna vez no se actualiza, edita también `sw.js` y
cambia el número de `const VERSION = 'v11';` (por ejemplo a `'v12'`).

---

## Problemas frecuentes

| Qué ves | Qué hacer |
|---|---|
| "Falta proxy" arriba a la derecha | No has puesto la dirección del Worker en `config.js` (paso 4), o falta la coma o una comilla. |
| "Sin respuesta" | Comprueba el puente con la prueba del paso 3.10. Si la prueba falla, entra en Cloudflare y vuelve a pegar `worker.js` y pulsar Deploy. |
| "Sin datos · hace X min" | Ha fallado internet o la web de aviones. Se reconecta sola; si dura horas, revisa la wifi de la tablet. |
| No aparece "Instalar aplicación" en Chrome | La dirección debe empezar por `https://`. Espera a que la página cargue del todo y vuelve a abrir el menú ⋮. |
| El mapa muestra "API KEY REQUIRED" | Has puesto una clave de CARTO incorrecta. Revísala o déjala vacía (`cartoKey: ''`). |
| La pantalla se apaga | Revisa el paso 7 (Pantalla activa y batería del navegador sin restricciones). |
| "La conexión no es privada" / `NET::ERR_CERT_AUTHORITY_INVALID` | Tablet con Android 7 o anterior: usa Firefox (ver "Tablets con Android 5, 6 o 7"). |

## Probar en el ordenador (opcional, para quien quiera)

En un Mac, abre la app Terminal, entra en la carpeta del proyecto y ejecuta, cada uno en
una ventana distinta de Terminal:

```bash
python3 proxy/proxy_local.py
```

```bash
python3 -m http.server 8000
```

Luego abre <http://localhost:8000> en Chrome. En el ordenador la app usa sola el proxy
local de pruebas, sin tocar `config.js`.

---

## Notas técnicas (estado comprobado en noviembre de 2026)

| Servicio | Estado | Límites |
|---|---|---|
| **airplanes.live** (principal) | Responde **403**: ahora pide escribirles para dar acceso a la API. La app lo intenta y, si falla, pasa sola a adsb.lol y no lo reintenta hasta 10 minutos después. | 1 consulta/s según su documentación. |
| **adsb.lol** (alternativa) | Funciona. Sin cabecera CORS → necesita el proxy. | Devuelve **429** si se le pide demasiado seguido; la app nunca hace más de una consulta a la vez y espera 30 s si recibe un 429. |
| **RainViewer** | Funciona, con CORS. | Zoom máximo **7** (la app amplía esas teselas), 13 fotogramas (últimas 2 h, cada 10 min), sin predicción, **sin satélite infrarrojo**, un solo esquema de color. 500 peticiones/min por IP. |
| **adsbdb.com** (rutas) | Funciona, con CORS (sin proxy), sin clave. Responde 404 si no conoce el indicativo. | No publica límites: la app hace como mucho 1 consulta cada 2 s, solo de vuelos comerciales, y guarda cada ruta 12 h en la tablet. |
| **Open-Meteo** | Funciona, con CORS, sin clave. | 600 peticiones/min; la app hace una cada 10 min. |
| **CARTO dark_all** | **Ahora exige clave** (sin ella, marca "API KEY REQUIRED"). | Gratis para uso no comercial con clave. Sin clave se usa Esri Dark Gray. |

- Para pedir acceso a airplanes.live, escribe a contact@airplanes.live explicando el proyecto;
  no hay que cambiar nada en la app, el Worker ya lo intenta primero.
- La app es web estática (sin servidor propio): se puede empaquetar más adelante como APK
  con Capacitor sin cambios.
- Tipografía: **B612** y **B612 Mono**, diseñadas por Airbus para las pantallas de cabina
  (licencia SIL OFL, en `vendor/fonts/`).
- Rendimiento: unos 220 elementos en la página; el barrido gira solo con `transform` de CSS
  (lo mueve la GPU); los aviones se dibujan en un `canvas` limitado a 30 fotogramas por segundo
  (`fpsMax` en `config.js`).
