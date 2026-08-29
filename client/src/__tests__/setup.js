import { vi } from 'vitest';

/**
 * jsdom does not implement several browser APIs the app legitimately uses.
 * Stub them here rather than weakening the application code to suit the test
 * environment.
 */

// Used by the chat views to keep the latest message in view.
Element.prototype.scrollIntoView = vi.fn();

// recharts measures its container before drawing.
global.ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

// Some layout code and the reduced-motion styles query this.
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }),
});

// The notification bell and copy buttons use the async clipboard API.
Object.defineProperty(navigator, 'clipboard', {
  writable: true,
  value: { writeText: vi.fn(() => Promise.resolve()) },
});
