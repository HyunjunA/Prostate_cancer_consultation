import type { Config } from "jest";
import nextJest from "next/jest";

const createJestConfig = nextJest({ dir: "./" });

const config: Config = {
  testEnvironment: "jsdom",
  setupFilesAfterEnv: ["<rootDir>/jest.setup.ts"],
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/src/$1",
    "\\.(css|less|scss|sass)$": "identity-obj-proxy",
    "^plotly\\.js-dist$": "<rootDir>/src/__mocks__/plotly.js-dist.ts",
    "^plotly\\.js-dist-min$": "<rootDir>/src/__mocks__/plotly.js-dist.ts",
    "^react-plotly\\.js$": "<rootDir>/src/__mocks__/react-plotly.js.tsx",
    "^html2canvas$": "<rootDir>/src/__mocks__/html2canvas.ts",
    "^jspdf$": "<rootDir>/src/__mocks__/jspdf.ts",
    "^posthog-js$": "<rootDir>/src/__mocks__/posthog-js.ts",
    "^posthog-js/react$": "<rootDir>/src/__mocks__/posthog-js/react.ts",
  },
  testPathIgnorePatterns: [
    "<rootDir>/node_modules/",
    "<rootDir>/.next/",
    "<rootDir>/e2e/",
  ],
};

export default createJestConfig(config);
