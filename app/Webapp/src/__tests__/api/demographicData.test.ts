/**
 * Tests for demographicData — API client for fetching demographic chart data.
 *
 * Mock strategy: global.fetch is replaced with jest.fn().
 * Each fetchDemographicData test builds a fetch mock that responds
 * differently depending on the requested URL.
 */

import {
  endpoints,
  fetchDemographicData,
  type ChartData,
  type DistributionData,
  type DemographicResponse,
} from "@/api/demographicData";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** All endpoint keys from the source module. */
const endpointKeys = Object.keys(endpoints);

/** Build a mock DistributionData value for a given key. */
function makeMockData(key: string): DistributionData {
  return {
    title: key,
    data: [{ category: "A", count: 10, percentage: 50 }],
  };
}

/**
 * Set up global.fetch so that every URL in `endpoints` returns mock JSON.
 * Optionally, `failKeys` is a set of keys whose fetch should fail.
 */
function mockFetchAll(failKeys: Set<string> = new Set()): jest.Mock {
  const urlToKey = new Map(
    Object.entries(endpoints).map(([k, url]) => [url, k])
  );

  const fn = jest.fn().mockImplementation((url: string) => {
    const key = urlToKey.get(url);

    if (key && failKeys.has(key)) {
      return Promise.resolve({
        ok: false,
        status: 500,
        json: jest.fn().mockRejectedValue(new Error("fail")),
      });
    }

    if (key) {
      return Promise.resolve({
        ok: true,
        json: jest.fn().mockResolvedValue(makeMockData(key)),
      });
    }

    // Unknown URL — should not happen in these tests
    return Promise.reject(new Error(`Unexpected fetch URL: ${url}`));
  });

  global.fetch = fn;
  return fn;
}

// ---------------------------------------------------------------------------
// Setup / Teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  jest.resetAllMocks();
  jest.spyOn(console, "error").mockImplementation(() => {});
});

// ---------------------------------------------------------------------------
// endpoints object
// ---------------------------------------------------------------------------

describe("endpoints", () => {
  it("has exactly 19 keys", () => {
    expect(endpointKeys).toHaveLength(19);
  });

  it("all values are /json_data/ paths", () => {
    Object.values(endpoints).forEach((url) => {
      expect(url).toMatch(/^\/json_data\/.+\.json$/);
    });
  });
});

// ---------------------------------------------------------------------------
// fetchDemographicData
// ---------------------------------------------------------------------------

describe("fetchDemographicData", () => {
  it("fetches all 19 endpoints", async () => {
    const fetchMock = mockFetchAll();

    await fetchDemographicData();

    expect(fetchMock).toHaveBeenCalledTimes(19);
    // Verify each endpoint URL was called
    Object.values(endpoints).forEach((url) => {
      expect(fetchMock).toHaveBeenCalledWith(url);
    });
  });

  it("returns an object with all endpoint keys", async () => {
    mockFetchAll();

    const result = await fetchDemographicData();

    endpointKeys.forEach((key) => {
      expect(result).toHaveProperty(key);
    });
  });

  it("returns null for a failed endpoint without throwing", async () => {
    mockFetchAll(new Set(["race"]));

    const result = await fetchDemographicData();

    expect(result.race).toBeNull();
  });

  it("returns data for successful endpoints alongside null for failed ones", async () => {
    const failures = new Set(["race", "ethnicity"]);
    mockFetchAll(failures);

    const result = await fetchDemographicData();

    // Failed keys should be null
    expect(result.race).toBeNull();
    expect(result.ethnicity).toBeNull();

    // Successful keys should have data
    const successfulKey = endpointKeys.find((k) => !failures.has(k))!;
    expect(result[successfulKey]).toEqual(makeMockData(successfulKey));
  });

  it("returns null for endpoints that return HTTP error status", async () => {
    mockFetchAll(new Set(["age"]));

    const result = await fetchDemographicData();

    expect(result.age).toBeNull();
    // Other keys still have data
    expect(result.genderIdentity).toEqual(makeMockData("genderIdentity"));
  });

  it("returns null when fetch itself throws for an individual endpoint", async () => {
    // Override fetch to throw for one specific URL
    const fetchMock = jest.fn().mockImplementation((url: string) => {
      if (url === endpoints.city) {
        return Promise.reject(new Error("Network error"));
      }
      return Promise.resolve({
        ok: true,
        json: jest.fn().mockResolvedValue(makeMockData("other")),
      });
    });
    global.fetch = fetchMock;

    const result = await fetchDemographicData();

    expect(result.city).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Type interfaces — structural assertions
// ---------------------------------------------------------------------------

describe("types", () => {
  it("ChartData has category, count, and percentage fields", () => {
    const sample: ChartData = { category: "Male", count: 42, percentage: 55.3 };
    expect(sample).toHaveProperty("category");
    expect(sample).toHaveProperty("count");
    expect(sample).toHaveProperty("percentage");
    expect(typeof sample.category).toBe("string");
    expect(typeof sample.count).toBe("number");
    expect(typeof sample.percentage).toBe("number");
  });

  it("DemographicResponse has all 19 endpoint keys", () => {
    // Build a minimal conforming object
    const response: DemographicResponse = {
      genderIdentity: null,
      legalSex: null,
      sexualOrientation: null,
      maritalStatus: null,
      veteranStatus: null,
      race: null,
      ethnicity: null,
      languages: null,
      needInterpreter: null,
      religion: null,
      state: null,
      country: null,
      city: null,
      occupation: null,
      age: null,
      ageMaritalStatus: null,
      raceReligion: null,
      stateRace: null,
      veteranGender: null,
    };

    // Every endpoint key is present in the DemographicResponse type
    endpointKeys.forEach((key) => {
      expect(response).toHaveProperty(key);
    });
    expect(Object.keys(response)).toHaveLength(19);
  });
});
