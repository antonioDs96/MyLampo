type Child = Node | string | null | undefined | false;

interface Props {
  class?: string;
  text?: string;
  title?: string;
  style?: string;
  onclick?: (e: MouseEvent) => void;
  attrs?: Record<string, string>;
}

/** Small element builder. Text always goes through textContent, never innerHTML. */
export function h<K extends keyof HTMLElementTagNameMap>(tag: K, props: Props = {}, ...children: Child[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (props.class) el.className = props.class;
  if (props.text !== undefined) el.textContent = props.text;
  if (props.title) el.title = props.title;
  if (props.style) el.setAttribute('style', props.style);
  if (props.onclick) (el as HTMLElement).addEventListener('click', props.onclick);
  if (props.attrs) for (const k in props.attrs) el.setAttribute(k, props.attrs[k]!);
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c);
  }
  return el;
}

const SVG_NS = 'http://www.w3.org/2000/svg';

export function svg(tag: string, attrs: Record<string, string | number> = {}, ...children: (SVGElement | string)[]): SVGElement {
  const el = document.createElementNS(SVG_NS, tag);
  for (const k in attrs) el.setAttribute(k, String(attrs[k]));
  for (const c of children) el.append(c);
  return el;
}

/**
 * Round portrait. Shows `/portraits/<id>.png` when the file exists and falls back
 * to a medallion with the character's initials otherwise.
 */
export function portrait(id: string, color: string, initials: string, cls = ''): HTMLElement {
  const box = h('div', { class: `portrait ${cls}`, style: `--c:${color}` }, h('span', { text: initials }));
  const img = new Image();
  img.alt = '';
  img.decoding = 'async';
  img.addEventListener('load', () => box.classList.add('has-img'));
  img.addEventListener('error', () => img.remove());
  img.src = `/portraits/${id}.png`;
  box.append(img);
  return box;
}
