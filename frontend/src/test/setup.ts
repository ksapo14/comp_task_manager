import "@testing-library/jest-dom/vitest";

import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

import { invalidateApiCache } from "../lib/api";

afterEach(() => {
  cleanup();
  invalidateApiCache();
});
