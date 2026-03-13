// src/__tests__/hooks/useDemographicData.test.ts
import { renderHook, waitFor } from "@testing-library/react";
import { useDemographicData } from "../../hooks/useDemographicData";

// ──────────────────────────────────────────────────────────────────────────────
// Global Mocks
// ──────────────────────────────────────────────────────────────────────────────
const mockFetch = jest.fn();
global.fetch = mockFetch;

beforeEach(() => {
  jest.spyOn(console, "log").mockImplementation(() => {});
  jest.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
  mockFetch.mockReset();
});

// ──────────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────────
/** Standard DistributionData-shaped mock. */
const mockDistribution = (title: string) => ({
  title,
  data: [{ category: "A", count: 10, percentage: 50 }],
});

/** Sets up mockFetch to return appropriate data for each URL. */
function mockAllFetches() {
  mockFetch.mockImplementation((url: string) => {
    if (url.includes("age_distribution")) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ data: [25, 30, 45, 60, 72] }),
      });
    }
    if (url.includes("age_marital_status")) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ cross: "age_marital" }),
      });
    }
    if (url.includes("race_religion")) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ cross: "race_religion" }),
      });
    }
    if (url.includes("state_race")) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ cross: "state_race" }),
      });
    }
    if (url.includes("veteran_gender")) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ cross: "veteran_gender" }),
      });
    }
    // All other demographic distribution files
    const filename = url.split("/").pop()?.replace(".json", "") || "unknown";
    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve(mockDistribution(filename)),
    });
  });
}

// ──────────────────────────────────────────────────────────────────────────────
// Tests
// ──────────────────────────────────────────────────────────────────────────────
describe("useDemographicData", () => {
  // ── 1. Initial state — all data fields are null ─────────────────────────
  test("initial state — all data fields are null", () => {
    mockAllFetches();
    const { result } = renderHook(() => useDemographicData());

    expect(result.current.genderIdentityData).toBeNull();
    expect(result.current.legalSexData).toBeNull();
    expect(result.current.ageData).toBeNull();
    expect(result.current.raceData).toBeNull();
    expect(result.current.veteranGenderDistribution).toBeNull();
  });

  // ── 2. Loads data on mount — calls fetch 19 times ──────────────────────
  test("loads data on mount — calls fetch 19 times", async () => {
    mockAllFetches();
    const { result } = renderHook(() => useDemographicData());

    await waitFor(() => {
      expect(result.current.genderIdentityData).not.toBeNull();
    });

    expect(mockFetch).toHaveBeenCalledTimes(19);
  });

  // ── 3. Sets state correctly — data fields have values after load ───────
  test("sets state correctly after loading", async () => {
    mockAllFetches();
    const { result } = renderHook(() => useDemographicData());

    await waitFor(() => {
      expect(result.current.genderIdentityData).not.toBeNull();
      expect(result.current.legalSexData).not.toBeNull();
      expect(result.current.raceData).not.toBeNull();
      expect(result.current.ethnicityData).not.toBeNull();
      expect(result.current.languagesData).not.toBeNull();
      expect(result.current.religionData).not.toBeNull();
      expect(result.current.stateData).not.toBeNull();
      expect(result.current.countryData).not.toBeNull();
      expect(result.current.cityData).not.toBeNull();
      expect(result.current.occupationData).not.toBeNull();
      expect(result.current.ageData).not.toBeNull();
      expect(result.current.veteranGenderDistribution).not.toBeNull();
    });
  });

  // ── 4. Handles fetch error — console.error is called ───────────────────
  test("handles fetch error — console.error is called", async () => {
    mockFetch.mockImplementation(() => {
      return Promise.reject(new Error("Network failure"));
    });

    renderHook(() => useDemographicData());

    await waitFor(() => {
      expect(console.error).toHaveBeenCalledWith(
        "Error loading data:",
        expect.any(Error)
      );
    });
  });

  // ── 5. Handles partial failure — Promise.all rejects, no state set ─────
  test("handles partial failure — if any fetch rejects, no state is set", async () => {
    let callCount = 0;
    mockFetch.mockImplementation((url: string) => {
      callCount++;
      // Fail the 5th fetch (veteran_status)
      if (callCount === 5) {
        return Promise.reject(new Error("Partial failure"));
      }
      if (url.includes("age_distribution")) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ data: [25, 30] }),
        });
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve(mockDistribution("test")),
      });
    });

    const { result } = renderHook(() => useDemographicData());

    // Promise.all rejects if any single promise rejects, so no state is set
    await waitFor(() => {
      expect(console.error).toHaveBeenCalled();
    });

    // Since Promise.all fails atomically, state should remain null
    expect(result.current.genderIdentityData).toBeNull();
  });

  // ── 6. Returns all 19 data fields ──────────────────────────────────────
  test("returns all 19 data fields in the hook result", async () => {
    mockAllFetches();
    const { result } = renderHook(() => useDemographicData());

    const expectedFields = [
      "genderIdentityData",
      "legalSexData",
      "sexualOrientationData",
      "maritalStatusData",
      "veteranStatusData",
      "raceData",
      "ethnicityData",
      "languagesData",
      "needInterpreterData",
      "religionData",
      "stateData",
      "countryData",
      "cityData",
      "occupationData",
      "ageData",
      "ageMaritalStatusDistribution",
      "raceReligionDistribution",
      "stateRaceDistribution",
      "veteranGenderDistribution",
    ];

    for (const field of expectedFields) {
      expect(result.current).toHaveProperty(field);
    }

    await waitFor(() => {
      expect(result.current.genderIdentityData).not.toBeNull();
    });
  });

  // ── 7. Age data — extracts .data property from age response ────────────
  test("age data extracts .data property from age response", async () => {
    mockAllFetches();
    const { result } = renderHook(() => useDemographicData());

    await waitFor(() => {
      expect(result.current.ageData).not.toBeNull();
    });

    // The hook does: setAgeData(age.data) where age = { data: [25, 30, 45, 60, 72] }
    expect(result.current.ageData).toEqual([25, 30, 45, 60, 72]);
  });

  // ── 8. DistributionData shape is correct ───────────────────────────────
  test("distribution data has correct DistributionData shape", async () => {
    mockAllFetches();
    const { result } = renderHook(() => useDemographicData());

    await waitFor(() => {
      expect(result.current.genderIdentityData).not.toBeNull();
    });

    const data = result.current.genderIdentityData!;
    expect(data).toHaveProperty("title");
    expect(data).toHaveProperty("data");
    expect(Array.isArray(data.data)).toBe(true);
    expect(data.data[0]).toHaveProperty("category");
    expect(data.data[0]).toHaveProperty("count");
    expect(data.data[0]).toHaveProperty("percentage");
  });
});
