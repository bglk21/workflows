// Renders part of the editor's SVG to a PNG. The SVG is cloned with its
// computed styles inlined (the stylesheet is not available inside an image),
// drawn onto a canvas and returned as a PNG blob.

const SVG_PROPS = [
  'fill', 'fill-opacity', 'stroke', 'stroke-width', 'stroke-opacity', 'stroke-dasharray',
  'stroke-linejoin', 'stroke-linecap', 'opacity', 'filter', 'font-family', 'font-size', 'font-weight',
];

const HTML_PROPS = [
  'display', 'box-sizing', 'width', 'height', 'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
  'align-items', 'justify-content', 'text-align', 'color', 'font-family', 'font-size', 'font-weight',
  'line-height', 'white-space', 'overflow-wrap', 'overflow',
];

function inlineStyles(source, target) {
  const props = source instanceof SVGElement ? SVG_PROPS : HTML_PROPS;
  const computed = getComputedStyle(source);
  target.setAttribute('style', props.map((p) => `${p}:${computed.getPropertyValue(p)}`).join(';'));
  target.removeAttribute('class');
  for (let i = 0; i < source.children.length; i++) inlineStyles(source.children[i], target.children[i]);
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Could not render the workflow image'));
    img.src = src;
  });
}

/**
 * @param {SVGGElement} content Group holding the drawing (its own transform is replaced).
 * @param {{x,y,w,h}} bounds Area to export, in the group's coordinates.
 * @param {{background: string, padding?: number, scale?: number}} options
 * @returns {Promise<Blob>}
 */
export async function renderPng(content, bounds, { background, padding = 40, scale = 2 }) {
  const width = Math.ceil(bounds.w + padding * 2);
  const height = Math.ceil(bounds.h + padding * 2);

  const clone = content.cloneNode(true);
  inlineStyles(content, clone);
  clone.setAttribute('transform', `translate(${padding - bounds.x},${padding - bounds.y})`);

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`
    + `<rect width="${width}" height="${height}" fill="${background}"/>`
    + `${new XMLSerializer().serializeToString(clone)}</svg>`;
  const img = await loadImage(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`);

  const canvas = document.createElement('canvas');
  canvas.width = width * scale;
  canvas.height = height * scale;
  const ctx = canvas.getContext('2d');
  ctx.scale(scale, scale);
  ctx.drawImage(img, 0, 0);

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('PNG encoding failed'))), 'image/png');
  });
}
