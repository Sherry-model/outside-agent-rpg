/** Restore the reading start after a scene/wait transition, not on ordinary renders. */
export function focusReadingStart(root: HTMLElement): void {
  const title = root.querySelector<HTMLElement>('.resolution-title, #event-title');
  title?.focus({preventScroll:true});
  const arrival = root.querySelector<HTMLElement>('[data-life-arrival]');
  const start = arrival ?? title;
  if (!start) return;
  const box = start.getBoundingClientRect();
  // Retain a useful viewport when already visible; never hide an arrival above the title.
  if (box.top < 0 || box.top > innerHeight * .55) {
    start.scrollIntoView({block:'start',behavior:'instant'});
  }
}
