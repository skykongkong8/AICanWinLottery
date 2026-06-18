// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

// Mock the API client so the component's error handling is exercised without any network.
vi.mock("./api-client.js", () => ({
  recommend: vi.fn(),
  save: vi.fn(),
  checkSaved: vi.fn(),
}));

import { App } from "./main.js";
import { recommend } from "./api-client.js";

const mockedRecommend = vi.mocked(recommend);

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("App recommendation error handling (M7)", () => {
  it("surfaces the error message and clears the generating state when recommend rejects", async () => {
    mockedRecommend.mockRejectedValueOnce(new Error("boom"));
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: /reveal recommendations/i }));

    await waitFor(() =>
      expect(screen.getByText(/Recommendation service unavailable: boom/i)).toBeTruthy(),
    );
    // The button must not stay stuck in the "Revealing recommendations..." generating state.
    expect(screen.getByRole("button", { name: /reveal recommendations/i })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /revealing recommendations/i })).toBeNull();
  });
});
