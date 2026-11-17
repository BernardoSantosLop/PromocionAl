/** Correct sideways photos already saved before the crop editor was available. */
export async function orientarIneParaImprimir(documento: Document): Promise<void> {
  await Promise.all(Array.from(documento.querySelectorAll<HTMLImageElement>('.ine img')).map(async (imagen) => {
    if (!imagen.naturalWidth || imagen.naturalWidth >= imagen.naturalHeight) return;
    const canvas = documento.createElement('canvas');
    const escala = Math.min(1, 1600 / imagen.naturalHeight);
    canvas.width = Math.round(imagen.naturalHeight * escala);
    canvas.height = Math.round(imagen.naturalWidth * escala);
    const contexto = canvas.getContext('2d');
    if (!contexto) return;
    contexto.translate(0, canvas.height);
    contexto.rotate(-Math.PI / 2);
    contexto.drawImage(imagen, 0, 0, canvas.height, canvas.width);
    imagen.src = canvas.toDataURL('image/jpeg', .92);
    await imagen.decode?.().catch(() => undefined);
  }));
}
