// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";

vi.mock("../../../api/client", () => ({
  getLeads: vi.fn(),
  getLeadStats: vi.fn(),
  getLeadFacets: vi.fn(),
  deleteAllLeads: vi.fn(),
  geocodeLead: vi.fn(),
  runGeocodingBatch: vi.fn(),
}));

vi.mock("../../../context/AuthContext", () => ({
  useAuth: () => ({ user: { roles: ["admin"] } }),
}));

import * as api from "../../../api/client";
import LeadsPage from "../LeadsPage";

const LEAD = {
  id: 1,
  full_name: "Nearby Lead",
  company_name: "Local Co",
  lat: 32.58,
  lon: 71.53,
  created_at: "2026-08-16T00:00:00Z",
};

function lastLeadParams() {
  return api.getLeads.mock.calls.at(-1)?.[0] || {};
}

describe("admin Near Me search", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.getLeadStats.mockResolvedValue({ data: { industries: [] } });
    api.getLeadFacets.mockResolvedValue({ data: { countries: [], regions: [] } });
    api.getLeads.mockResolvedValue({
      data: { leads: [LEAD], total: 40, nextCursor: null },
    });
    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: {
        getCurrentPosition: vi.fn((success) =>
          success({ coords: { latitude: 32.5742, longitude: 71.5264 } })
        ),
      },
    });
  });

  afterEach(() => cleanup());

  it("sends coordinates, sorts by distance, and preserves the geo filter across pages", async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <LeadsPage />
      </MemoryRouter>
    );

    await screen.findByText("Nearby Lead");
    await user.click(screen.getByRole("button", { name: /near me/i }));

    await waitFor(() => {
      expect(lastLeadParams()).toMatchObject({
        lat: 32.5742,
        lon: 71.5264,
        radius: 50000,
        sort: "distance",
        offset: 0,
      });
    });
    expect(screen.getByText(/within 50 km of you/i)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Next" }));
    await waitFor(() => {
      expect(lastLeadParams()).toMatchObject({
        lat: 32.5742,
        lon: 71.5264,
        radius: 50000,
        sort: "distance",
        offset: 20,
      });
    });
  });
});
