// shared/slug.mjs
// FUENTE UNICA del slug de carpeta de medios (public/<slug>/, out/<slug>.mp4).
// CRITICO: la extension (ESCRIBE los medios) y el editor Remotion (los LEE) deben derivar el MISMO
// slug, o `mediaComplete` nunca da true y la cola se atasca en silencio. Antes habia 6 copias con DOS
// convenciones ("-" en json-loader vs "_" en el render) -> bug end-to-end latente. Esta es la unica.
// Reglas: minusculas, sin acentos, no-alfanumerico -> "_", recorta a 40 chars, fallback "proyecto".
export function slugify(text) {
  return (
    String(text == null ? "" : text)
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "") // quita diacriticos combinantes
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 40)
      .replace(/_+$/g, "") || "proyecto" // limpia "_" final tras el corte + fallback
  );
}
