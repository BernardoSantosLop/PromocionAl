/* eslint-disable */

const { onCall, HttpsError } = require('firebase-functions/v2/https');

let visionClient = null;

function obtenerVisionClient() {
  if (!visionClient) {
    const vision = require('@google-cloud/vision');
    visionClient = new vision.ImageAnnotatorClient();
  }

  return visionClient;
}

exports.leerIne = onCall(
  {
    region: 'us-central1',
    memory: '1GiB',
    timeoutSeconds: 60,
    invoker: 'public',
  },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError(
        'unauthenticated',
        'Debes iniciar sesión para escanear una INE.'
      );
    }

    const imagenBase64 = request.data && request.data.imagenBase64;

    if (!imagenBase64 || typeof imagenBase64 !== 'string') {
      throw new HttpsError(
        'invalid-argument',
        'No se recibió una imagen válida.'
      );
    }

    const base64Limpio = imagenBase64.replace(
      /^data:image\/[a-zA-Z]+;base64,/,
      ''
    );

    const bufferImagen = Buffer.from(base64Limpio, 'base64');

    if (bufferImagen.length > 7 * 1024 * 1024) {
      throw new HttpsError(
        'invalid-argument',
        'La imagen es demasiado grande. Toma una foto más ligera.'
      );
    }

    try {
      const cliente = obtenerVisionClient();

      const [resultado] = await cliente.documentTextDetection({
        image: {
          content: bufferImagen,
        },
        imageContext: {
          languageHints: ['es'],
        },
      });

      const textoDetectado =
        (resultado.fullTextAnnotation && resultado.fullTextAnnotation.text) ||
        (resultado.textAnnotations &&
          resultado.textAnnotations[0] &&
          resultado.textAnnotations[0].description) ||
        '';

      const datos = extraerDatosIne(textoDetectado);

      return {
        ok: true,
        texto: textoDetectado,
        datos,
      };
    } catch (error) {
      console.error('Error al leer INE con Vision:', error);

      const codigo = error && error.code ? String(error.code) : 'sin-codigo';
      const mensaje =
        error && error.message
          ? String(error.message)
          : String(error || 'Error desconocido');

      throw new HttpsError(
        'internal',
        `Error Vision/OCR: ${codigo} - ${mensaje}`
      );
    }
  }
);

function extraerDatosIne(textoOriginal) {
  const lineas = obtenerLineasLimpias(textoOriginal);
  const textoNormalizado = normalizarTextoOCR(textoOriginal).replace(/\n/g, ' ');

  const curp = extraerCurp(textoNormalizado);
  const edad = curp ? calcularEdadDesdeCurp(curp) : null;

  const nombreCompleto = extraerNombre(lineas);
  const direccion = extraerDomicilio(lineas);
  const colonia = extraerColoniaDesdeDomicilio(direccion, lineas);
  const claveElector = extraerClaveElector(textoNormalizado, curp);
  const seccion = extraerSeccion(textoOriginal);

  return {
    nombreCompleto,
    direccion,
    colonia,
    claveElector,
    seccion,
    curp,
    edad,
  };
}

function obtenerLineasLimpias(texto) {
  return normalizarTextoOCR(texto)
    .split(/\r?\n/)
    .map((linea) => linea.replace(/\s+/g, ' ').trim())
    .filter((linea) => linea.length > 0);
}

function normalizarTextoOCR(texto) {
  return String(texto || '')
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[|_]+/g, ' ')
    .replace(/[^A-Z0-9Ñ .#\/\-\n]/g, ' ')
    .replace(/[ ]+/g, ' ')
    .trim();
}

function extraerNombre(lineas) {
  const indiceNombre = lineas.findIndex((linea) =>
    /\bNOMBRE\b|\bNOMBRES\b|\bAPELLIDO\b|\bPATERNO\b|\bMATERNO\b/.test(linea)
  );

  if (indiceNombre === -1) {
    return '';
  }

  const partes = [];

  for (let i = indiceNombre; i < lineas.length && partes.length < 4; i++) {
    let linea = lineas[i];

    if (
      i !== indiceNombre &&
      contieneAlgunaEtiqueta(linea, [
        'DOMICILIO',
        'DIRECCION',
        'CLAVE',
        'ELECTOR',
        'LECTOR',
        'CURP',
        'SECCION',
        'FECHA',
        'SEXO',
        'ANO',
        'AÑO',
        'REGISTRO',
        'VIGENCIA',
        'EMISION',
        'LOCALIDAD',
        'MUNICIPIO',
      ])
    ) {
      break;
    }

    linea = linea
      .replace(/\bNOMBRE\b/g, '')
      .replace(/\bNOMBRES\b/g, '')
      .replace(/\bAPELLIDO\b/g, '')
      .replace(/\bPATERNO\b/g, '')
      .replace(/\bMATERNO\b/g, '')
      .replace(/\bPRIMER\b/g, '')
      .replace(/\bSEGUNDO\b/g, '')
      .trim();

    if (esLineaNombreValida(linea)) {
      partes.push(linea);
    }
  }

  return limpiarTextoFinal(partes.join(' '));
}

function extraerDomicilio(lineas) {
  const indiceDomicilio = lineas.findIndex(
    (linea) =>
      linea.includes('DOMICILIO') ||
      linea.includes('D0MICILIO') ||
      linea.includes('DIRECCION') ||
      linea.includes('DIRECION')
  );

  if (indiceDomicilio === -1) {
    return '';
  }

  const partes = [];

  for (let i = indiceDomicilio; i < lineas.length && partes.length < 5; i++) {
    let linea = lineas[i];

    if (
      i !== indiceDomicilio &&
      contieneAlgunaEtiqueta(linea, [
        'CLAVE',
        'ELECTOR',
        'LECTOR',
        'CURP',
        'SECCION',
        'MUNICIPIO',
        'LOCALIDAD',
        'EMISION',
        'VIGENCIA',
        'FECHA',
        'SEXO',
        'ANO',
        'AÑO',
        'REGISTRO',
      ])
    ) {
      break;
    }

    linea = linea
      .replace(/\bDOMICILIO\b/g, '')
      .replace(/\bD0MICILIO\b/g, '')
      .replace(/\bDIRECCION\b/g, '')
      .replace(/\bDIRECION\b/g, '')
      .replace(/\bMEXICO\b/g, '')
      .trim();

    if (esLineaDomicilioValida(linea)) {
      partes.push(linea);
    }
  }

  return limpiarTextoFinal(partes.join(' '));
}

function extraerColoniaDesdeDomicilio(direccion, lineas) {
  const desdeDireccion = extraerColoniaDesdeTexto(direccion);

  if (desdeDireccion) {
    return desdeDireccion;
  }

  for (const linea of lineas) {
    const colonia = extraerColoniaDesdeTexto(linea);

    if (colonia) {
      return colonia;
    }
  }

  return '';
}

function extraerColoniaDesdeTexto(texto) {
  const textoNormalizado = normalizarTextoOCR(texto).replace(/\n/g, ' ');

  const corte =
    '(?:\\s+\\d{5}\\b|\\s+C\\s*P\\b|\\s+CP\\b|\\s+MUNICIPIO\\b|\\s+LOCALIDAD\\b|\\s+SECCI[O0]N\\b|\\s+SECC\\b|\\s+CLAVE\\b|\\s+ELECTOR\\b|\\s+CURP\\b|\\s+FECHA\\b|\\s+SEXO\\b|$)';

  const patrones = [
    // COLONIA
    new RegExp('\\bCOLONIA\\s+(.+?)' + corte),
    new RegExp('\\bCOLL\\.?\\s+(.+?)' + corte),
    new RegExp('\\bCOL\\.?\\s+(.+?)' + corte),

    // FRACCIONAMIENTO
    new RegExp('\\bFRACCIONAMIENTO\\s+(.+?)' + corte),
    new RegExp('\\bFRACC\\.?\\s+(.+?)' + corte),
    new RegExp('\\bFRAC\\.?\\s+(.+?)' + corte),

    // UNIDAD HABITACIONAL
    new RegExp('\\bUNIDAD\\s+HABITACIONAL\\s+(.+?)' + corte),
    new RegExp('\\bUNID\\.?\\s+(.+?)' + corte),
    new RegExp('\\bU\\.H\\.?\\s+(.+?)' + corte),
    new RegExp('\\bU\\s*H\\s+(.+?)' + corte),
    new RegExp('\\bUH\\s+(.+?)' + corte),

    // CONJUNTO HABITACIONAL
    new RegExp('\\bCONJUNTO\\s+HABITACIONAL\\s+(.+?)' + corte),
    new RegExp('\\bCONJUNTO\\s+(.+?)' + corte),
    new RegExp('\\bCONJ\\.?\\s+(.+?)' + corte),

    // PUEBLO
    new RegExp('\\bPUEBLO\\s+(.+?)' + corte),
    new RegExp('\\bPUEB\\.?\\s+(.+?)' + corte),

    // EJIDO
    new RegExp('\\bEJIDO\\s+(.+?)' + corte),
    new RegExp('\\bEJID\\.?\\s+(.+?)' + corte),

    // RANCHO / RANCHERIA
    new RegExp('\\bRANCHERIA\\s+(.+?)' + corte),
    new RegExp('\\bRANCHO\\s+(.+?)' + corte),
    new RegExp('\\bRANC\\.?\\s+(.+?)' + corte),

    // BARRIO
    new RegExp('\\bBARRIO\\s+(.+?)' + corte),
    new RegExp('\\bBARR\\.?\\s+(.+?)' + corte),
    new RegExp('\\bBO\\.?\\s+(.+?)' + corte),

    // PARQUE
    new RegExp('\\bPARQUE\\s+(.+?)' + corte),
    new RegExp('\\bPARQ\\.?\\s+(.+?)' + corte),

    // RESIDENCIAL
    new RegExp('\\bRESIDENCIAL\\s+(.+?)' + corte),
    new RegExp('\\bRESID\\.?\\s+(.+?)' + corte),
    new RegExp('\\bRES\\.?\\s+(.+?)' + corte),

    // VIVIENDA
    new RegExp('\\bVIVIENDA\\s+(.+?)' + corte),
    new RegExp('\\bVIV\\.?\\s+(.+?)' + corte),

    // AMPLIACION
    new RegExp('\\bAMPLIACION\\s+(.+?)' + corte),
    new RegExp('\\bAMPL\\.?\\s+(.+?)' + corte),
    new RegExp('\\bAMP\\.?\\s+(.+?)' + corte),

    // SECTOR
    new RegExp('\\bSECTOR\\s+(.+?)' + corte),
    new RegExp('\\bSECT\\.?\\s+(.+?)' + corte),

    // LOCALIDAD
    new RegExp('\\bLOCALIDAD\\s+(.+?)' + corte),
    new RegExp('\\bLOC\\.?\\s+(.+?)' + corte),
  ];

  for (const patron of patrones) {
    const coincidencia = textoNormalizado.match(patron);

    if (coincidencia && coincidencia[1]) {
      return limpiarColonia(coincidencia[1]);
    }
  }

  return '';
}

function limpiarColonia(texto) {
  return String(texto || '')
    .replace(/\bCOLONIA\b/g, '')
    .replace(/\bCOLL\b/g, '')
    .replace(/\bCOL\b/g, '')

    .replace(/\bFRACCIONAMIENTO\b/g, '')
    .replace(/\bFRACC\b/g, '')
    .replace(/\bFRAC\b/g, '')

    .replace(/\bUNIDAD\s+HABITACIONAL\b/g, '')
    .replace(/\bUNIDAD\b/g, '')
    .replace(/\bUNID\b/g, '')
    .replace(/\bU\.H\.\b/g, '')
    .replace(/\bU\s*H\b/g, '')
    .replace(/\bUH\b/g, '')

    .replace(/\bCONJUNTO\s+HABITACIONAL\b/g, '')
    .replace(/\bCONJUNTO\b/g, '')
    .replace(/\bCONJ\b/g, '')

    .replace(/\bPUEBLO\b/g, '')
    .replace(/\bPUEB\b/g, '')

    .replace(/\bEJIDO\b/g, '')
    .replace(/\bEJID\b/g, '')

    .replace(/\bRANCHERIA\b/g, '')
    .replace(/\bRANCHO\b/g, '')
    .replace(/\bRANC\b/g, '')

    .replace(/\bBARRIO\b/g, '')
    .replace(/\bBARR\b/g, '')
    .replace(/\bBO\b/g, '')

    .replace(/\bPARQUE\b/g, '')
    .replace(/\bPARQ\b/g, '')

    .replace(/\bRESIDENCIAL\b/g, '')
    .replace(/\bRESID\b/g, '')
    .replace(/\bRES\b/g, '')

    .replace(/\bVIVIENDA\b/g, '')
    .replace(/\bVIV\b/g, '')

    .replace(/\bAMPLIACION\b/g, '')
    .replace(/\bAMPL\b/g, '')
    .replace(/\bAMP\b/g, '')

    .replace(/\bSECTOR\b/g, '')
    .replace(/\bSECT\b/g, '')

    .replace(/\bLOCALIDAD\b/g, '')
    .replace(/\bLOC\b/g, '')

    .replace(/\bCP\b/g, '')
    .replace(/\bC\s*P\b/g, '')
    .replace(/\b\d{5}\b/g, '')
    .replace(/\bOAXACA\b/g, '')
    .replace(/\bOAX\b/g, '')
    .replace(/\bMEXICO\b/g, '')
    .replace(/\bMEX\b/g, '')
    .replace(/[.,;:]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function extraerClaveElector(texto, curp) {
  const variantes = [
    /CLAVE\s*DE\s*ELECTOR\s*([A-Z0-9 ]{12,50})/,
    /CLAVE\s*DE\s*LECTOR\s*([A-Z0-9 ]{12,50})/,
    /CLAVE\s*ELECTOR\s*([A-Z0-9 ]{12,50})/,
    /CLAVE\s*LECTOR\s*([A-Z0-9 ]{12,50})/,
    /CVE\s*ELECTOR\s*([A-Z0-9 ]{12,50})/,
    /CVE\s*LECTOR\s*([A-Z0-9 ]{12,50})/,
    /ELECTOR\s*([A-Z0-9 ]{12,50})/,
    /LECTOR\s*([A-Z0-9 ]{12,50})/,
  ];

  for (const patron of variantes) {
    const coincidencia = texto.match(patron);

    if (coincidencia && coincidencia[1]) {
      const posible = coincidencia[1].replace(/[^A-Z0-9]/g, '');
      const clave = posible.match(/[A-Z0-9]{18}/);

      if (clave && clave[0] && clave[0] !== curp) {
        return clave[0];
      }
    }
  }

  const candidatos = texto.replace(/\s+/g, '').match(/[A-Z0-9]{18}/g) || [];
  const candidato = candidatos.find((valor) => valor !== curp);

  return candidato || '';
}

function extraerCurp(texto) {
  const textoLimpio = texto.replace(/\s+/g, '').replace(/[^A-Z0-9]/g, '');

  const coincidencia = textoLimpio.match(
    /[A-Z]{4}\d{6}[HM][A-Z]{5}[A-Z0-9]\d/
  );

  return coincidencia ? coincidencia[0] : '';
}

function extraerSeccion(texto) {
  const lineas = normalizarTextoOCR(texto)
    .split(/\r?\n/)
    .map((linea) => linea.replace(/\s+/g, ' ').trim())
    .filter((linea) => linea.length > 0);

  for (let i = 0; i < lineas.length; i++) {
    const linea = lineas[i];
    const posicionSeccion = obtenerPosicionEtiquetaSeccion(linea);

    if (posicionSeccion === -1) {
      continue;
    }

    const textoDespuesDeSeccion = linea.substring(posicionSeccion);
    const numeroMismaLinea = textoDespuesDeSeccion.match(/\b(\d{3,5})\b/);

    if (numeroMismaLinea && numeroMismaLinea[1]) {
      const seccion = Number(numeroMismaLinea[1]);

      if (esNumeroSeccionValido(seccion)) {
        return seccion;
      }
    }

    const siguientesLineas = [lineas[i + 1] || '', lineas[i + 2] || ''];

    for (const siguiente of siguientesLineas) {
      if (!siguiente) {
        continue;
      }

      if (contieneEtiquetaQueNoEsSeccion(siguiente)) {
        continue;
      }

      const numeros = siguiente.match(/\b\d{1,5}\b/g) || [];

      if (numeros.length === 0) {
        continue;
      }

      if (numeros.length === 1) {
        const seccion = Number(numeros[0]);

        if (esNumeroSeccionValido(seccion)) {
          return seccion;
        }
      }

      if (numeros.length > 1) {
        const indicePorEncabezado = obtenerIndiceDeSeccionPorEncabezado(linea);
        const numeroElegido = numeros[indicePorEncabezado];

        if (numeroElegido) {
          const seccion = Number(numeroElegido);

          if (esNumeroSeccionValido(seccion)) {
            return seccion;
          }
        }
      }
    }
  }

  return null;
}

function obtenerPosicionEtiquetaSeccion(linea) {
  const coincidencia = linea.match(
    /\b(SECCI[O0]N|SECC[I1][O0]N|SECC\.?|SEC\.?)(?:\b|$)/
  );

  if (!coincidencia || coincidencia.index === undefined) {
    return -1;
  }

  return coincidencia.index + coincidencia[0].length;
}

function obtenerIndiceDeSeccionPorEncabezado(linea) {
  const posiciones = [];

  const etiquetas = [
    { nombre: 'MUNICIPIO', patron: /\bMUNICIPIO\b/ },
    { nombre: 'LOCALIDAD', patron: /\bLOCALIDAD\b/ },
    { nombre: 'DISTRITO', patron: /\bDISTRITO\b/ },
    {
      nombre: 'SECCION',
      patron: /\bSECCI[O0]N\b|\bSECC[I1][O0]N\b|\bSECC\.?\b|\bSEC\.?\b/,
    },
  ];

  for (const etiqueta of etiquetas) {
    const coincidencia = linea.match(etiqueta.patron);

    if (coincidencia && coincidencia.index !== undefined) {
      posiciones.push({
        nombre: etiqueta.nombre,
        posicion: coincidencia.index,
      });
    }
  }

  posiciones.sort((a, b) => a.posicion - b.posicion);

  const indice = posiciones.findIndex((item) => item.nombre === 'SECCION');

  return indice >= 0 ? indice : 0;
}

function contieneEtiquetaQueNoEsSeccion(linea) {
  return (
    linea.includes('CLAVE') ||
    linea.includes('ELECTOR') ||
    linea.includes('LECTOR') ||
    linea.includes('CURP') ||
    linea.includes('EMISION') ||
    linea.includes('VIGENCIA') ||
    linea.includes('FECHA') ||
    linea.includes('SEXO') ||
    linea.includes('REGISTRO') ||
    linea.includes('DOMICILIO') ||
    linea.includes('NOMBRE')
  );
}

function esNumeroSeccionValido(seccion) {
  return Number.isInteger(seccion) && seccion >= 100 && seccion <= 99999;
}

function calcularEdadDesdeCurp(curp) {
  if (!curp || curp.length < 10) {
    return null;
  }

  const fecha = curp.substring(4, 10);

  const anio = Number(fecha.substring(0, 2));
  const mes = Number(fecha.substring(2, 4));
  const dia = Number(fecha.substring(4, 6));

  if (!anio || !mes || !dia) {
    return null;
  }

  const anioActual = new Date().getFullYear();
  const siglo = anio + 2000 > anioActual ? 1900 : 2000;
  const anioNacimiento = siglo + anio;

  const nacimiento = new Date(anioNacimiento, mes - 1, dia);

  if (isNaN(nacimiento.getTime())) {
    return null;
  }

  const hoy = new Date();

  let edad = hoy.getFullYear() - nacimiento.getFullYear();

  const yaCumplio =
    hoy.getMonth() > nacimiento.getMonth() ||
    (hoy.getMonth() === nacimiento.getMonth() &&
      hoy.getDate() >= nacimiento.getDate());

  if (!yaCumplio) {
    edad--;
  }

  return edad > 0 ? edad : null;
}

function contieneAlgunaEtiqueta(linea, etiquetas) {
  return etiquetas.some((etiqueta) => linea.includes(etiqueta));
}

function esLineaNombreValida(linea) {
  if (!linea || linea.length < 3) {
    return false;
  }

  if (/\d/.test(linea)) {
    return false;
  }

  const basura = [
    'INSTITUTO',
    'NACIONAL',
    'ELECTORAL',
    'CREDENCIAL',
    'VOTAR',
    'ESTADOS',
    'UNIDOS',
    'MEXICANOS',
    'MEXICO',
    'SEXO',
    'REGISTRO',
    'DOMICILIO',
    'DIRECCION',
    'CLAVE',
    'ELECTOR',
    'LECTOR',
    'CURP',
    'SECCION',
  ];

  if (basura.some((palabra) => linea.includes(palabra))) {
    return false;
  }

  return /^[A-ZÑ ]+$/.test(linea);
}

function esLineaDomicilioValida(linea) {
  if (!linea || linea.length < 4) {
    return false;
  }

  const basura = [
    'INSTITUTO',
    'NACIONAL',
    'ELECTORAL',
    'CREDENCIAL',
    'VOTAR',
    'ESTADOS',
    'UNIDOS',
    'MEXICANOS',
    'SEXO',
    'REGISTRO',
    'CLAVE',
    'ELECTOR',
    'LECTOR',
    'CURP',
    'SECCION',
  ];

  if (basura.some((palabra) => linea.includes(palabra))) {
    return false;
  }

  return true;
}

function limpiarTextoFinal(texto) {
  return String(texto || '')
    .replace(/\s+/g, ' ')
    .replace(/\s+\./g, '.')
    .trim();
}