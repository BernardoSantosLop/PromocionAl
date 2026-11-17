# Catálogo de Tuxtepec

`catalogo-tuxtepec.json` se obtuvo del archivo `tuxtepec_colonias_localidades_ordenadas_por_seccion.xlsx` proporcionado por el usuario: 141 colonias, 76 localidades, 81 secciones y 239 relaciones entre asentamientos y secciones.

Los nombres y las asociaciones se conservan como aparecen en el Excel. La colonia LA UNIÓN (1018) y la localidad LA UNION (1076) tienen identificadores distintos.

Para regenerarlo: `node scripts/preparar-catalogo-tuxtepec.cjs RUTA_AL_EXCEL`.

Para consultar y respaldar los catálogos de Firebase: `node scripts/reemplazar-catalogo-tuxtepec.cjs`. Para sustituirlos, añadir `--aplicar`. Requiere Firebase CLI instalado y una sesión con permiso sobre el proyecto. El script respalda las colecciones en `tmp/catalogos`, utiliza precondiciones para evitar sobrescribir cambios concurrentes y aplica la sustitución en una operación atómica. Solo modifica `colonias` y `seccionesElectorales`.

Los documentos de `colonias` incluyen `tipo` (`COLONIA` o `LOCALIDAD`) y `secciones` (lista de números). Se conserva el nombre de la colección para mantener la compatibilidad con los registros existentes. Los documentos de sección contienen la referencia a todos sus asentamientos.

Validación de datos: `node --test scripts/catalogo-tuxtepec.test.cjs`.
