# Recuperación desde Firebase

Se descargaron 51 archivos publicados de https://promocion-al-voto.web.app y el código fuente de las cuatro Cloud Functions.

## Ejecutar la interfaz publicada en local

Desde la raíz: `npm run start:recuperado`. Abrir http://127.0.0.1:4300.

Esta copia usa el Firebase real: iniciar sesión y guardar información afecta los datos del proyecto remoto.

`npm start` ejecuta el proyecto Angular editable, con los cambios publicados reconstruidos dentro de `src/`. La copia compilada se conserva como referencia y puede abrirse con `npm run start:recuperado`.

## Integración al código Angular

Se reconstruyeron el rol `enlace`, la navegación y los permisos de estructura; el alta automática de cuentas sin reemplazar la sesión del administrador; la creación y edición de perfiles vinculados a delegados y enlaces; la eliminación de usuarios mediante la función protegida; la recuperación de cuentas sin perfil; y la jerarquía completa con búsqueda y conteos del servidor.

El listado de simpatizantes incluye el filtro por enlace. Se conserva el filtro por coordinador y se consideran las asignaciones explícitas, además de los capturistas. El registro permite buscar o escribir colonias, comprobar catálogos y confirmar altas antes de guardar. Se conserva el guardado sin conexión.

El service worker se mantiene desactivado, como en la versión publicada, y se retiran registros y cachés anteriores de Angular sin borrar IndexedDB. Las rutas internas y los valores de roles y colecciones existentes se conservan. Los textos visibles usan “Delegado” y “Simpatizante”.

Se conserva una copia previa de `src/` en `src-local-original/`. La implementación es una reconstrucción funcional a partir de los archivos publicados, no una recuperación de los TypeScript originales: Hosting no publicó mapas de código fuente. Los scripts `integrar-angular.cjs` y `terminologia.cjs` documentan los pasos iniciales de reconstrucción y no deben volver a ejecutarse sobre los archivos ya integrados.

Se verificaron la compilación de producción y 31 pruebas locales con servicios simulados. No se hicieron altas, eliminaciones ni cambios de datos para las pruebas. La verificación con una sesión real del usuario puede hacerse desde la aplicación local.

## Funciones integradas

`functions/administracion.js` recupera `eliminarUsuario`, `asegurarCatalogos` y `gestionarJerarquia` del paquete más reciente. `functions/index.js` las exporta junto con `leerIne`, cuyo contenido local coincide con el desplegado. Se conserva el archivo original en `functions-local-original.js`.

Las carpetas `functions-*` contienen los paquetes de cada función. No se ejecutó ningún despliegue ni se modificaron datos, usuarios o reglas remotas.

La comprobación SHA-1 coincide con el manifiesto publicado para 50 de 51 archivos. `registro-movilizador.js` difiere del manifiesto, pero no es un script de entrada del HTML actual. La entrada actual carga `main-ENLACE-FILTRO.js` y `registro-usuarios-v30.js`.
