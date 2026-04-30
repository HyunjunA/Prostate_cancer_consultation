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
