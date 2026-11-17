# Control Electoral

El acceso está limitado al rol `coordinador` mediante la navegación y los guards existentes. Las reglas preparadas en `firestore.rules` aplican el mismo permiso a la nueva colección `controlElectoralSecciones`.

Cada documento usa como identificador el número de sección y contiene su número de ruta y una lista de casillas. Cada casilla guarda tipo, número y número de contigua cuando corresponde. Una ruta agrupa varias secciones, cada una con todas sus casillas; por ejemplo, la Ruta 1 puede contener 10 u 11 secciones. Esa cantidad es un ejemplo, no un límite del registro.

El número de ruta se captura una vez por sección y se conserva al guardar para agilizar el registro de las siguientes secciones de la misma ruta. La lista muestra agrupaciones por ruta con sus totales de secciones y casillas.

El guardado usa una transacción para impedir que una nueva sección sobrescriba otra existente. Para agregar casillas a una sección registrada se utiliza Editar. Se conservan los datos del formulario si el guardado falla y se pide confirmación antes de eliminar.

La colección es propia de Control Electoral. El registro de rutas no crea ni modifica las secciones del catálogo de Promoción al Voto. La asignación de RG está disponible en la pestaña **RG y rutas**; los formatos impresos quedan para una siguiente etapa.

## RG y rutas

La ruta `/control-electoral/asignar-rutas` permite al coordinador consultar los RG capturados, buscar por nombre, teléfono o sección, filtrar por ruta o pendientes y vincular una ruta existente. Cada ruta se obtiene agrupando las secciones registradas por su número, con sus totales de secciones y casillas. Los detalles desplegables muestran los RG vinculados y las casillas de cada sección.

Cada RG conserva una sola `numeroRutaAsignada` en su documento de `controlElectoralRg` y cada ruta admite un solo RG por ahora. Las rutas ocupadas se muestran deshabilitadas para otros RG. Cambiar la ruta existente o quitarla requiere confirmación. Quitar la asignación conserva el registro y sus datos personales y libera la ruta para otro RG.

El guardado comprueba que la ruta aún tenga una sección registrada. Una transacción verifica que esa sección todavía pertenece a la ruta y que la asignación del RG no fue modificada en otra sesión. Solo actualiza la ruta y los metadatos de la asignación. Si una ruta se queda sin secciones, la interfaz señala que ya no está disponible y permite reasignar o quitar el vínculo.

Una reserva por ruta en `controlElectoralRutasRg` evita asignaciones simultáneas a diferentes RG. La reserva se crea, cambia o libera en la misma transacción que actualiza el RG, con acceso exclusivo del coordinador. Se comprueban también las asignaciones anteriores para respetar los registros previos y se avisa si existen duplicados antiguos, sin eliminarlos automáticamente. Las pruebas se hacen con datos simulados, sin cambiar asignaciones reales.

### Imprimir la hoja de una ruta

Cada ruta en **Rutas creadas** tiene un botón **Imprimir ruta**, disponible cuando existe exactamente un RG asignado. Abre el diálogo de impresión del navegador con un documento independiente, sin menús, filtros ni otras rutas.

La hoja incluye el número de ruta, los totales, el nombre y los datos registrados del RG, y una tabla de dos columnas con la sección a la izquierda y sus casillas a la derecha, separadas por una línea vertical azul. Los datos que falten se indican como no registrados. Se usa papel carta vertical; las filas se mantienen juntas si la lista requiere más páginas.

El documento se prepara localmente en un iframe y se retira al terminar de imprimir o al salir de la pantalla. No se guarda una copia ni se envía el documento a otro servicio. La plantilla escapa los datos personales como texto. Se verificó visualmente una hoja de 11 secciones y 22 casillas con datos de ejemplo, renderizando el PDF generado por Chrome.

## Registrar RG

La ruta `/control-electoral/registrar-rg` reutiliza el formulario de registro de simpatizantes y su servicio existente de extracción de INE. Conserva los campos personales, sin los selectores de delegado ni movilizador responsable. Se registra el coordinador que captura los datos. No incorpora campos nuevos de asignación a rutas en esta etapa.

El destino se configura mediante `REGISTRO_PERSONA_DESTINO`: el formulario original conserva el guardado en `votantes` y la base de pendientes `promocion-voto-ine-offline`; la sección RG guarda en `controlElectoralRg` y usa `control-electoral-rg-ine-offline`. Así se comparten la interfaz y la extracción sin mezclar registros ni pendientes. Registrar un RG no crea una cuenta de acceso en Authentication.

El alta de RG usa una transacción con la clave de elector normalizada como identificador, para detectar duplicados dentro de su propia colección sin sobrescribirlos. La captura manual de RG necesita conexión; sin conexión se puede preparar y guardar la foto como pendiente para procesarla con el flujo existente cuando vuelva internet. Las correcciones manuales de pendientes también usan el destino RG.

Las reglas de `controlElectoralRg` ya están publicadas, con acceso exclusivo del coordinador. Se respaldó la versión anterior en `recovery/firestore.rules.before-registrar-rg`. La verificación de interfaz y extracción se hizo con datos y respuestas OCR simulados, sin enviar INE reales ni crear registros de prueba en Firebase.

La copia de las reglas anteriores está en `recovery/firestore.rules.before-control-electoral`. La corrección de permisos ya fue publicada en Firebase y se verificó que coincide con `firestore.rules`: añade únicamente acceso de coordinador para la colección nueva y conserva los permisos existentes. La copia inmediatamente anterior a esa publicación está en `recovery/firestore.rules.before-permission-fix`. No se crearon registros reales durante las pruebas.

Tipos de casilla: [documentación de identificación de casillas del INE](https://ayuda.ine.mx/2024/assets/docs/computos/mas-temas/manual-base-datos-computos.pdf).
