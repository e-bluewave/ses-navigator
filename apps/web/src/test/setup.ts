import '@testing-library/jest-dom/vitest';

// jsdom has no top-layer dialog implementation. Real focus trapping, Escape and
// mobile layout are exercised by the isolated Playwright fixture.
if (!HTMLDialogElement.prototype.showModal) {
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute('open');
  };
}
