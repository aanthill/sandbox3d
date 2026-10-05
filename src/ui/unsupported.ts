/** Plain full-screen message for browsers/devices that can't run the app. */
export function showUnsupported(reason: string): void {
  const el = document.createElement('div');
  Object.assign(el.style, {
    position: 'fixed',
    inset: '0',
    display: 'grid',
    placeItems: 'center',
    padding: '24px',
    textAlign: 'center',
    font: '16px/1.5 system-ui, sans-serif',
    color: '#e8ecf4',
    background: '#0b0d12',
    zIndex: '100',
  } satisfies Partial<CSSStyleDeclaration>);
  el.innerHTML =
    '<div style="max-width:420px"><h1 style="font-size:20px;margin:0 0 12px">' +
    "This browser can't run Sandbox 3D</h1>" +
    '<p style="margin:0;opacity:.75">It needs a desktop browser with WebGPU or WebGL2 ' +
    '(recent Chrome, Edge, Firefox or Safari) and a dedicated graphics card.</p>' +
    `<p style="margin:16px 0 0;font-size:12px;opacity:.5"></p></div>`;
  (el.querySelector('p:last-child') as HTMLElement).textContent = reason;
  document.body.appendChild(el);
}
