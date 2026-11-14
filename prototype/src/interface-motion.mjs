// Presentation only. Navigation, wallet approvals and editor gestures keep their
// existing handlers. No animation delays an action or hides pending content.
let dispose, previousView, previousPath;
let vehicleTransition;
const visited = new Set();

export function navigateFromVehicle(link, destination, navigate) {
  const image = link.matches('.market-card-link') && link.querySelector('.market-card-photo');
  if (!image || !destination.startsWith('/spaces/') || !document.startViewTransition ||
      matchMedia('(prefers-reduced-motion: reduce)').matches || navigator.connection?.saveData) return false;
  vehicleTransition?.skipTransition();
  image.style.viewTransitionName = 'market-vehicle';
  let navigated = false;
  const transition = document.startViewTransition(() => { navigated = true; navigate(destination); });
  vehicleTransition = transition;
  transition.finished.catch(() => { if (!navigated) navigate(destination); }).finally(() => {
    image.style.removeProperty('view-transition-name');
    if (vehicleTransition !== transition) return;
    vehicleTransition = undefined;
    document.querySelector('.placement-photo-canvas')?.style.removeProperty('view-transition-name');
  });
  return true;
}

export function mountInterfaceMotion({viewKey, path = location.pathname} = {}) {
  dispose?.();
  const root = document.querySelector('#app');
  if (!root) return;
  if (vehicleTransition) root.querySelector('.placement-photo-canvas')?.style.setProperty('view-transition-name', 'market-vehicle');
  const controller = new AbortController(), {signal} = controller;
  const preference = matchMedia('(prefers-reduced-motion: reduce)');
  const animations = new Set();
  const animate = (element, frames, options) => {
    if (!element?.animate || preference.matches || navigator.connection?.saveData) return;
    const animation = element.animate(frames, {duration: 420, easing: 'cubic-bezier(.16,1,.3,1)', ...options});
    animations.add(animation);
    animation.finished.then(() => animations.delete(animation), () => animations.delete(animation));
  };
  const cancel = () => { for (const animation of animations) animation.cancel(); animations.clear(); };
  preference.addEventListener('change', cancel, {signal});

  // The poster is the authored entrance. Copy is visible and clickable from the
  // first frame; background polling and account restoration never replay it.
  if (path === '/' && !visited.has('home') && root.querySelector('.hero-copy')) {
    visited.add('home');
    animate(root.querySelector('.hero-copy'), [
      {translate: '0 12px', rotate: '-1deg'},
      {translate: '0 0', rotate: '0deg'},
    ], {duration: 750});
  }

  // The same destination appears on a photograph and in the booking panel.
  // Preview that relationship on hover AND keyboard focus without changing the
  // selected offer, URL, quote or accessible current-selection attributes.
  const links = [...root.querySelectorAll('[data-placement-select]')];
  const clear = () => links.forEach(link => link.classList.remove('is-previewed'));
  const preview = link => {
    clear();
    if (link) for (const other of links) {
      if (other.getAttribute('href') === link.getAttribute('href')) other.classList.add('is-previewed');
    }
  };
  for (const link of links) {
    link.addEventListener('pointerenter', event => {
      if (event.pointerType !== 'touch') preview(link);
    }, {signal});
    link.addEventListener('pointerleave', () => preview(document.activeElement?.closest('[data-placement-select]')), {signal});
    link.addEventListener('focus', () => preview(link), {signal});
    link.addEventListener('blur', clear, {signal});
  }
  if (previousView !== viewKey && previousPath === path && links.length) {
    animate(root.querySelector('.placement-pin.is-selected > span'), [
      {transform: 'scale(1.18)'}, {transform: 'scale(1)'},
    ], {duration: 300});
  }

  // Retain native details, including their keyboard behavior and validation.
  // Only newly revealed content moves; the summary never shifts under a click.
  const expanded = new WeakMap([...root.querySelectorAll('details')].map(detail => [detail, detail.open]));
  root.addEventListener('toggle', event => {
    const detail = event.target;
    const wasOpen = expanded.get(detail);
    expanded.set(detail, detail.open);
    if (wasOpen === detail.open) return;
    if (!detail.matches?.('.listing-details > details, .placement-takeover, .account-disclosure, .market-filters') || !detail.open) return;
    for (const child of detail.children) if (child.tagName !== 'SUMMARY') {
      animate(child, [{opacity: .7, translate: '0 4px'}, {opacity: 1, translate: '0 0'}], {duration: 220});
    }
  }, {capture: true, signal});

  previousView = viewKey;
  previousPath = path;
  dispose = () => { controller.abort(); cancel(); clear(); };
}
