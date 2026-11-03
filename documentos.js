/* Aldo — la logica de los documentos, sin tocar la pagina. Todo en memoria. */
'use strict';

const Doc = (() => {
  const { PDFDocument, StandardFonts, rgb, degrees } = PDFLib;
  const TINTA = rgb(0.18, 0.18, 0.19);
  const ROJO = rgb(1, 0.14, 0);
  const abrir = async (f) => {
    try {
      return await PDFDocument.load(await f.arrayBuffer());
    } catch (e) {
      throw new Error(/encrypt/i.test(e.message) ? `${f.name} tiene contraseña: quítasela primero` : `${f.name} no es un PDF válido`);
    }
  };

  /* "1-3, 5, 8-" -> indices base 0, en orden y sin salirse del documento */
  function rango(texto, total) {
    const out = [];
    for (const t of String(texto).split(/[,;\s]+/).filter(Boolean)) {
      const m = t.match(/^(\d+)?(-)?(\d+)?$/);
      if (!m || (!m[1] && !m[3])) throw new Error(`No entiendo «${t}». Ejemplo: 1-3, 5, 8-`);
      const a = m[1] ? +m[1] : 1;
      const b = m[2] ? (m[3] ? +m[3] : total) : a;
      if (a < 1 || b > total || a > b) throw new Error(`«${t}» no existe: el PDF tiene ${total} páginas`);
      for (let i = a; i <= b; i++) out.push(i - 1);
    }
    if (!out.length) throw new Error('Indica las páginas. Ejemplo: 1-3, 5, 8-');
    return out;
  }

  async function copiar(origen, indices) {
    const d = await PDFDocument.create();
    (await d.copyPages(origen, indices)).forEach((p) => d.addPage(p));
    return d;
  }

  const seguro = (t) => String(t || '').normalize('NFC').replace(/[^\x09\x0a\x0d\x20-\x7e\xa0-\xff€–—‘’“”•…]/g, '?');

  const HERRAMIENTAS = {
    unir: { t: 'Unir', d: 'Varios PDF en uno, en el orden de la lista', acepta: '.pdf', varios: true,
      async run(fs) {
        const d = await PDFDocument.create();
        for (const f of fs) {
          const o = await abrir(f);
          (await d.copyPages(o, o.getPageIndices())).forEach((p) => d.addPage(p));
        }
        return [{ nombre: 'unido.pdf', bytes: await d.save() }];
      } },
    extraer: { t: 'Extraer páginas', d: 'Las que elijas, en un PDF nuevo', acepta: '.pdf', opc: 'paginas',
      async run([f], o) {
        const p = await abrir(f);
        return [{ nombre: f.name.replace(/\.pdf$/i, '') + '-extracto.pdf', bytes: await (await copiar(p, rango(o.paginas, p.getPageCount()))).save() }];
      } },
    dividir: { t: 'Dividir', d: 'Cada página en su propio PDF', acepta: '.pdf',
      async run([f]) {
        const p = await abrir(f), out = [], base = f.name.replace(/\.pdf$/i, '');
        for (const i of p.getPageIndices()) out.push({ nombre: `${base}-${String(i + 1).padStart(3, '0')}.pdf`, bytes: await (await copiar(p, [i])).save() });
        return out;
      } },
    quitar: { t: 'Quitar páginas', d: 'Borra las que sobran', acepta: '.pdf', opc: 'paginas',
      async run([f], o) {
        const p = await abrir(f), fuera = new Set(rango(o.paginas, p.getPageCount()));
        const quedan = p.getPageIndices().filter((i) => !fuera.has(i));
        if (!quedan.length) throw new Error('No puedes quitar todas las páginas');
        return [{ nombre: f.name.replace(/\.pdf$/i, '') + '-recortado.pdf', bytes: await (await copiar(p, quedan)).save() }];
      } },
    girar: { t: 'Girar', d: 'Todo el documento', acepta: '.pdf', opc: 'giro',
      async run([f], o) {
        const p = await abrir(f);
        p.getPages().forEach((g) => g.setRotation(degrees((g.getRotation().angle + Number(o.giro)) % 360)));
        return [{ nombre: f.name.replace(/\.pdf$/i, '') + '-girado.pdf', bytes: await p.save() }];
      } },
    numerar: { t: 'Numerar', d: 'Pone 1/10 al pie de cada página', acepta: '.pdf',
      async run([f]) {
        const p = await abrir(f), fuente = await p.embedFont(StandardFonts.Helvetica), gs = p.getPages();
        gs.forEach((g, i) => {
          const t = `${i + 1}/${gs.length}`;
          g.drawText(t, { x: g.getWidth() / 2 - fuente.widthOfTextAtSize(t, 9) / 2, y: 18, size: 9, font: fuente, color: TINTA });
        });
        return [{ nombre: f.name.replace(/\.pdf$/i, '') + '-numerado.pdf', bytes: await p.save() }];
      } },
    marca: { t: 'Marca de agua', d: 'Un texto en diagonal en cada página', acepta: '.pdf', opc: 'texto',
      async run([f], o) {
        const texto = seguro(o.texto).trim();
        if (!texto) throw new Error('Escribe el texto de la marca');
        const p = await abrir(f), fuente = await p.embedFont(StandardFonts.HelveticaBold);
        p.getPages().forEach((g) => {
          const tam = Math.min(60, (g.getWidth() * 1.1) / Math.max(1, fuente.widthOfTextAtSize(texto, 1)));
          const w = fuente.widthOfTextAtSize(texto, tam);
          g.drawText(texto, { x: g.getWidth() / 2 - (w / 2) * 0.707, y: g.getHeight() / 2 - (w / 2) * 0.707, size: tam, font: fuente, color: ROJO, opacity: 0.18, rotate: degrees(45) });
        });
        return [{ nombre: f.name.replace(/\.pdf$/i, '') + '-marca.pdf', bytes: await p.save() }];
      } },
    metadatos: { t: 'Quitar metadatos', d: 'Autor, programa y fechas fuera', acepta: '.pdf',
      async run([f]) {
        const p = await abrir(f);
        ['setTitle', 'setAuthor', 'setSubject', 'setProducer', 'setCreator'].forEach((m) => p[m](''));
        p.setKeywords([]);
        p.setCreationDate(new Date(0));
        p.setModificationDate(new Date(0));
        return [{ nombre: f.name.replace(/\.pdf$/i, '') + '-limpio.pdf', bytes: await p.save({ updateMetadata: false }) }];
      } },
    imagenes: { t: 'Imágenes a PDF', d: 'JPG, PNG o WEBP, una por página', acepta: 'image/*', varios: true,
      async run(fs) {
        const d = await PDFDocument.create();
        for (const f of fs) {
          let bytes = new Uint8Array(await f.arrayBuffer()), img;
          if (/png/i.test(f.type)) img = await d.embedPng(bytes);
          else if (/jpe?g/i.test(f.type)) img = await d.embedJpg(bytes);
          else {
            const bmp = await createImageBitmap(f);
            const c = document.createElement('canvas');
            c.width = bmp.width; c.height = bmp.height;
            c.getContext('2d').drawImage(bmp, 0, 0);
            const blob = await new Promise((r) => c.toBlob(r, 'image/png'));
            img = await d.embedPng(new Uint8Array(await blob.arrayBuffer()));
          }
          d.addPage([img.width, img.height]).drawImage(img, { x: 0, y: 0, width: img.width, height: img.height });
        }
        return [{ nombre: 'imagenes.pdf', bytes: await d.save() }];
      } },
  };

  /* ------------------------------------------------------------- CV */

  function trocearCv(c) {
    const bloques = (t) => seguro(t).split(/\n\s*\n/).map((b) => b.split('\n').map((l) => l.trim()).filter(Boolean)).filter((b) => b.length);
    return { ...c, nombre: seguro(c.nombre), titular: seguro(c.titular), contacto: seguro(c.contacto), perfil: seguro(c.perfil).trim(), exp: bloques(c.experiencia), edu: bloques(c.educacion), hab: seguro(c.habilidades).trim() };
  }

  /* Una columna, fuente estandar y texto real: lo que mejor leen los filtros ATS. */
  async function cvPdf(datos, papel) {
    const c = trocearCv(datos);
    const d = await PDFDocument.create();
    const reg = await d.embedFont(StandardFonts.Helvetica), neg = await d.embedFont(StandardFonts.HelveticaBold);
    const [W, H] = papel === 'Letter' ? [612, 792] : [595.28, 841.89];
    const M = 46;
    let pag = d.addPage([W, H]), y = H - M;
    const salto = (h) => { if (y - h < M) { pag = d.addPage([W, H]); y = H - M; } };
    const partir = (t, f, s, ancho) => {
      const out = [];
      let l = '';
      for (const w of t.split(/\s+/)) {
        const n = l ? `${l} ${w}` : w;
        if (f.widthOfTextAtSize(n, s) > ancho && l) { out.push(l); l = w; } else l = n;
      }
      if (l) out.push(l);
      return out;
    };
    const parrafo = (t, f, s, x = M, color = TINTA, lh = 1.35) => {
      for (const l of partir(t, f, s, W - x - M)) {
        salto(s * lh);
        pag.drawText(l, { x, y: y - s, size: s, font: f, color });
        y -= s * lh;
      }
    };
    const seccion = (t) => {
      salto(34);
      y -= 12;
      pag.drawText(t.toUpperCase(), { x: M, y: y - 10, size: 10, font: neg, color: TINTA });
      y -= 15;
      pag.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 0.8, color: TINTA });
      y -= 6;
    };
    const lista = (bs) => bs.forEach((b, i) => {
      if (i) y -= 6;
      b.forEach((l, j) => {
        const v = l.match(/^[-•*]\s+(.*)/);
        if (v) {
          salto(13);
          pag.drawText('•', { x: M + 2, y: y - 10, size: 10, font: reg, color: TINTA });
          parrafo(v[1], reg, 10, M + 12);
        } else if (j === 0) {
          const [izq, der] = l.split(/\s*\|\s*/);
          salto(14);
          if (der) {
            pag.drawText(der, { x: W - M - reg.widthOfTextAtSize(der, 9.5), y: y - 10, size: 9.5, font: reg, color: TINTA });
          }
          parrafo(izq, neg, 10.5);
        } else parrafo(l, reg, 10);
      });
    });
    if (c.nombre) parrafo(c.nombre, neg, 24, M, TINTA, 1.15);
    if (c.titular) parrafo(c.titular, reg, 12);
    if (c.contacto) { y -= 2; parrafo(c.contacto, reg, 9.5); }
    if (c.perfil) { seccion('Perfil'); parrafo(c.perfil.replace(/\s*\n\s*/g, ' '), reg, 10); }
    if (c.exp.length) { seccion('Experiencia'); lista(c.exp); }
    if (c.edu.length) { seccion('Educación'); lista(c.edu); }
    if (c.hab) { seccion('Habilidades'); parrafo(c.hab.replace(/\s*\n\s*/g, ' '), reg, 10); }
    d.setTitle(c.nombre ? `CV ${c.nombre}` : 'CV');
    d.setAuthor(c.nombre);
    d.setProducer('Aldo');
    d.setCreator('Aldo');
    return d.save();
  }

  /* -------------------------------------------------------- diapositivas */

  function trocearGuion(t) {
    const out = [];
    let act = null;
    for (const cruda of String(t).split('\n')) {
      const l = cruda.trim();
      if (!l) continue;
      const m = l.match(/^#+\s+(.*)/);
      if (m) { act = { titulo: m[1], puntos: [] }; out.push(act); continue; }
      if (!act) { act = { titulo: '', puntos: [] }; out.push(act); }
      act.puntos.push(l.replace(/^[-•*]\s+/, ''));
    }
    return out;
  }

  async function pptx(guion, tema) {
    const ds = trocearGuion(guion);
    if (!ds.length) throw new Error('Escribe al menos una diapositiva: # Título');
    const osc = tema === 'oscuro';
    const fondo = osc ? '1D1D1F' : 'FFFFFF', tinta = osc ? 'FFFFFF' : '1D1D1F', suave = osc ? 'C9C9CC' : '2E2E30';
    const p = new PptxGenJS();
    p.layout = 'LAYOUT_WIDE';
    ds.forEach((s, i) => {
      const sl = p.addSlide();
      sl.background = { color: fondo };
      const portada = i === 0 && s.puntos.length <= 1;
      sl.addText((s.titulo || '').toUpperCase(), { x: 0.7, y: portada ? 2.4 : 0.55, w: 11.9, h: portada ? 1.8 : 1, fontFace: 'Arial Narrow', bold: true, fontSize: portada ? 60 : 36, color: tinta, margin: 0, valign: portada ? 'middle' : 'top', fit: 'shrink' });
      sl.addShape(p.ShapeType.ellipse, { x: 12.35, y: 6.75, w: 0.18, h: 0.18, fill: { color: 'FF2400' }, line: { color: 'FF2400' } });
      sl.addText(`${i + 1}/${ds.length}`, { x: 0.7, y: 6.68, w: 2, h: 0.3, fontFace: 'Courier New', fontSize: 11, color: suave, margin: 0 });
      if (portada && s.puntos[0]) sl.addText(s.puntos[0], { x: 0.7, y: 4.3, w: 11.9, h: 0.8, fontFace: 'Courier New', fontSize: 18, color: suave, margin: 0 });
      else if (s.puntos.length) sl.addText(s.puntos.map((t) => ({ text: t, options: { bullet: { indent: 16 }, breakLine: true, paraSpaceAfter: 10 } })), { x: 0.7, y: 1.75, w: 11.9, h: 4.7, fontFace: 'Arial', fontSize: 22, color: suave, margin: 0, valign: 'top', fit: 'shrink' });
    });
    return p.write({ outputType: 'blob' });
  }

  return { HERRAMIENTAS, cvPdf, trocearCv, trocearGuion, pptx };
})();
