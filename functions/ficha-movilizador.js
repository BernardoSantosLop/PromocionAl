function normalizarFichaMovilizador(ficha) {
  const texto = (campo, maximo) => {
    const valor = String(ficha[campo] || '').trim();
    if (valor.length > maximo) throw new Error(`El campo ${campo} supera la longitud permitida.`);
    return valor;
  };
  const datos = {
    domicilio: texto('domicilio', 250), colonia: texto('colonia', 150),
    codigoPostal: texto('codigoPostal', 5), claveElector: texto('claveElector', 18).toUpperCase(),
    curp: texto('curp', 18).toUpperCase(), celular: texto('celular', 10),
    seccion: Number(ficha.seccion), facebook: texto('facebook', 150), ineFrente: '', ineReverso: ''
  };
  if (!datos.domicilio || !datos.colonia || !/^\d{5}$/.test(datos.codigoPostal) || !/^[A-Z0-9]{18}$/.test(datos.claveElector) || !/^[A-Z0-9]{18}$/.test(datos.curp) || !/^\d{10}$/.test(datos.celular) || !Number.isInteger(datos.seccion) || datos.seccion <= 0) throw new Error('Completa los datos del formato del movilizador.');
  return datos;
}
module.exports = { normalizarFichaMovilizador };
