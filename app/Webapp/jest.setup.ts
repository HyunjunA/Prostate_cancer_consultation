import "@testing-library/jest-dom";

// jsdom does not provide a global fetch — without this, any component that
// calls fetch() during a useEffect (e.g. SelectionScreen patient list) will
// crash with "ReferenceError: fetch is not defined". Tests that exercise
// real fetch behaviour replace this mock per-test.
if (typeof global.fetch === "undefined") {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (global as any).fetch = jest.fn(() =>
    Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve([]),
      text: () => Promise.resolve(""),
    })
  );
}

// Radix UI primitives (via `@radix-ui/react-use-size`) instantiate
// `ResizeObserver` during layout effects. jsdom does not implement it, so
// any test that renders a Radix-backed shadcn/ui component (Tabs, Dialog,
// Accordion, etc.) crashes with "ReferenceError: ResizeObserver is not
// defined". The stub below is a no-op — these tests verify component
// behaviour, not viewport-size reactivity, so observe()/unobserve() can
// safely do nothing.
if (typeof (global as unknown as { ResizeObserver?: unknown }).ResizeObserver === "undefined") {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (global as any).ResizeObserver = class ResizeObserver {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  };
}
