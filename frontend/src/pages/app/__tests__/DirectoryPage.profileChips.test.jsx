// @vitest-environment jsdom
/**
 * Regression tests for the profile-derived "default" filter chips and the
 * Near Me button on the Search Leads page.
 *
 * Two user complaints are pinned here:
 *  1. "In <City>" and "In <Country>" were glued together — selecting the city
 *     auto-selected the country, and clearing the country cleared the city.
 *     They must be independent toggles.
 *  2. Near Me appeared to do nothing when the browser couldn't provide a
 *     position (a hanging lookup with no timeout, no fallback) even though the
 *     user's profile location was set.
 */
import "@testing-library/jest-dom/vitest";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";

vi.mock("../../../api/client", () => ({
  getLeads: vi.fn(),
  getLeadFacets: vi.fn(),
  exportLeads: vi.fn(),
  getMyBilling: vi.fn(),
}));

const mockAuth = {
  user: {
    id: "user-1",
    roles: ["user"],
    location: {
      lat: 31.5497,
      lng: 74.3436,
      city: "Lahore",
      region: "Punjab",
      country: "Pakistan",
      label: "Lahore, Punjab, Pakistan",
    },
    interests: [],
  },
  isAuthenticated: true,
  isLoading: false,
};
vi.mock("../../../context/AuthContext", () => ({
  useAuth: () => mockAuth,
}));

import * as api from "../../../api/client";
import DirectoryPage from "../DirectoryPage";

const LAHORE_LEAD = {
  id: 11,
  full_name: "Ayesha Khan",
  company_name: "Lahore Textiles",
  industry: "Textiles",
  category: "Industrial & Logistics",
  city_name: "Lahore",
  region_name: "Punjab",
  country_name: "Pakistan",
  lat: 31.5497,
  lon: 74.3436,
  is_verified: true,
  created_at: "2026-08-01T00:00:00Z",
};

const FACETS = {
  categories: [{ value: "Industrial & Logistics", count: 3 }],
  industries: [{ value: "Textiles", count: 3 }],
  countries: [{ id: 2, value: "Pakistan", code: "PK", count: 3 }],
  regions: [{ id: 3, value: "Punjab", count: 3 }],
  cities: [{ id: 4, value: "Lahore", count: 3 }],
  totals: { total: 3, verified: 2 },
  suggestion: { country: "Pakistan", region: "Punjab", city: "Lahore", country_id: 2 },
};

const lastLeadParams = () => api.getLeads.mock.calls.at(-1)?.[0] || {};

const renderPage = () =>
  render(
    <MemoryRouter initialEntries={["/app/search"]}>
      <DirectoryPage />
    </MemoryRouter>
  );

describe("profile location chips are independent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    api.getLeadFacets.mockResolvedValue({ data: FACETS });
    api.getLeads.mockResolvedValue({
      data: { leads: [LAHORE_LEAD], nextCursor: null, total: 1 },
    });
  });

  afterEach(() => cleanup());

  it("selecting the city chip sends ONLY the city filter — no country", async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText("Ayesha Khan");

    await user.click(screen.getByRole("button", { name: "In Lahore" }));

    await waitFor(() => {
      const p = lastLeadParams();
      expect(p.city_id ?? p.city).toBeTruthy();
    });
    const p = lastLeadParams();
    expect(p.country_id).toBeUndefined();
    expect(p.country).toBeUndefined();
    expect(p.country_code).toBeUndefined();

    // The country chip must NOT light up just because the city is active.
    expect(screen.getByRole("button", { name: "In Pakistan" })).not.toHaveClass("active");
    expect(screen.getByRole("button", { name: "In Lahore" })).toHaveClass("active");
  });

  it("clearing the country chip keeps the city filter active", async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText("Ayesha Khan");

    // Turn both on, then turn the country back off.
    await user.click(screen.getByRole("button", { name: "In Lahore" }));
    await user.click(screen.getByRole("button", { name: "In Pakistan" }));
    await waitFor(() => expect(lastLeadParams().country_id ?? lastLeadParams().country).toBeTruthy());

    await user.click(screen.getByRole("button", { name: "In Pakistan" }));

    // Country is gone, city is still applied.
    await waitFor(() => {
      const p = lastLeadParams();
      expect(p.country_id).toBeUndefined();
      expect(p.city_id ?? p.city).toBeTruthy();
    });
    expect(screen.getByRole("button", { name: "In Lahore" })).toHaveClass("active");
    expect(screen.getByRole("button", { name: "In Pakistan" })).not.toHaveClass("active");
  });

  it("country dropdown 'All' clears only the country — a chosen city survives", async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText("Ayesha Khan");

    const selects = document.querySelectorAll(".app-filter-dropdown-select");
    await user.selectOptions(selects[2], "2"); // country = Pakistan
    await user.selectOptions(selects[4], "4"); // city = Lahore
    await waitFor(() => expect(lastLeadParams().city_id).toBe(4));

    await user.selectOptions(selects[2], ""); // back to All countries

    await waitFor(() => {
      const p = lastLeadParams();
      expect(p.country_id).toBeUndefined();
      expect(p.city_id).toBe(4);
    });
  });

  it("selecting the country chip alone does not touch the city filter", async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText("Ayesha Khan");

    await user.click(screen.getByRole("button", { name: "In Pakistan" }));

    await waitFor(() =>
      expect(lastLeadParams().country_id ?? lastLeadParams().country).toBeTruthy()
    );
    const p = lastLeadParams();
    expect(p.city_id).toBeUndefined();
    expect(p.city).toBeUndefined();
    expect(screen.getByRole("button", { name: "In Lahore" })).not.toHaveClass("active");
  });
});

describe("Near Me on the Search Leads page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    api.getLeadFacets.mockResolvedValue({ data: FACETS });
    api.getLeads.mockResolvedValue({
      data: { leads: [LAHORE_LEAD], nextCursor: null, total: 1 },
    });
  });

  afterEach(() => cleanup());

  it("prefers the pinned profile location over the browser position", async () => {
    // Browser geolocation on a desktop resolves to the IP/VPN location, which
    // can be hundreds of km from where the user actually pinned themselves.
    // A location explicitly saved on the profile must win, otherwise the radius
    // is measured from a phantom point and "Near Me" finds nothing.
    const getCurrentPosition = vi.fn((success) =>
      success({ coords: { latitude: 24.8607, longitude: 67.0011 } }) // Karachi
    );
    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: { getCurrentPosition },
    });

    const user = userEvent.setup();
    renderPage();
    await screen.findByText("Ayesha Khan");

    await user.click(screen.getByRole("button", { name: /near me/i }));

    await waitFor(() => {
      const p = lastLeadParams();
      expect(p.lat).toBeCloseTo(31.5497); // Lahore, from the profile
      expect(p.lon).toBeCloseTo(74.3436);
    });
    const p = lastLeadParams();
    expect(p.radius).toBe(50000);
    expect(p.sort).toBe("distance");
    expect(getCurrentPosition).not.toHaveBeenCalled();
    expect(await screen.findByText(/Lahore, Pakistan/)).toBeInTheDocument();
  });

  it("uses the browser position when the profile has no saved location", async () => {
    const originalLocation = mockAuth.user.location;
    mockAuth.user = { ...mockAuth.user, location: null };
    const getCurrentPosition = vi.fn((success) =>
      success({ coords: { latitude: 31.5497, longitude: 74.3436 } })
    );
    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: { getCurrentPosition },
    });

    try {
      const user = userEvent.setup();
      renderPage();
      await screen.findByText("Ayesha Khan");

      await user.click(screen.getByRole("button", { name: /near me/i }));

      await waitFor(() => {
        const p = lastLeadParams();
        expect(p.lat).toBeCloseTo(31.5497);
        expect(p.lon).toBeCloseTo(74.3436);
      });
      expect(lastLeadParams().sort).toBe("distance");

      // The lookup is given a timeout so the button can never hang forever.
      expect(getCurrentPosition.mock.calls[0][2]).toMatchObject({
        timeout: expect.any(Number),
      });
    } finally {
      mockAuth.user = { ...mockAuth.user, location: originalLocation };
    }
  });

  it("explains an empty radius search instead of showing a blank 'no leads' page", async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText("Ayesha Khan");

    // The radius search matches nothing, and the backend reports the nearest
    // matching lead is ~1,020 km away (Lahore -> Karachi).
    api.getLeads.mockResolvedValue({
      data: {
        leads: [],
        nextCursor: null,
        total: 0,
        geo: {
          radius: 50000,
          nearestDistance: 1020000,
          leadsWithCoordinates: 3,
          matchingLeads: 3,
        },
      },
    });

    await user.click(screen.getByRole("button", { name: /near me/i }));

    // A specific, actionable reason — not just "no matching leads".
    expect(await screen.findByText(/nearest matching lead is about/i)).toBeInTheDocument();
    expect(screen.getByText(/1,020 km/)).toBeInTheDocument();

    // And a one-click way to widen the radius past that distance.
    await user.click(screen.getByRole("button", { name: /within 1000 km/i }));
    await waitFor(() => expect(lastLeadParams().radius).toBe(1000000));
  });

  it("says so when the matching leads simply have no coordinates", async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText("Ayesha Khan");

    api.getLeads.mockResolvedValue({
      data: {
        leads: [],
        nextCursor: null,
        total: 0,
        geo: {
          radius: 50000,
          nearestDistance: null,
          leadsWithCoordinates: 0,
          matchingLeads: 4200,
        },
      },
    });

    await user.click(screen.getByRole("button", { name: /near me/i }));

    expect(await screen.findByText(/none of them have map coordinates/i)).toBeInTheDocument();
  });

  it("never swaps demo rows into a failed filtered search (looks like a broken filter)", async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText("Ayesha Khan");

    // The API starts failing right when the user applies a filter.
    api.getLeads.mockRejectedValue(Object.assign(new Error("boom"), { status: 500 }));

    await user.click(screen.getByRole("button", { name: "In Lahore" }));

    // An explicit error banner, NOT the bundled demo dataset.
    await screen.findByText(/failed to respond/i);
    await waitFor(() => expect(screen.queryByText(/Sample leads/i)).not.toBeInTheDocument());
    expect(screen.queryByText("Alex Chen")).not.toBeInTheDocument();
  });
});
