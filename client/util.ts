export const $ = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document) => root.querySelector<T>(sel);
export const esc = (s: unknown) => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
export const rnd = (a: number, b: number) => a + Math.random() * (b - a);
export const reducedMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
