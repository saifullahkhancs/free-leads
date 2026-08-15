// @vitest-environment jsdom
/**
 * Regression tests for the directory filters.
 *
 * Background: `/api/leads` used to 500 on *any* filtered request, so the page
 * fell back to demo data and every filter looked like it did nothing. These
 * tests pin the client half of that contract:
 *   1. picking a filter actually sends it to the API, and
 *   2. filters that are only known by *name* (no facet id) are still sent
 *      rather than being silently dropped.
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

const mockUser = { user: null, isAuthenticated: false, isLoading: false };
vi.mock("../../../context/AuthContext", () => ({
  useAuth: () => mockUser,
}));

import * as api from "../../../api/client";
import DirectoryPage from "../DirectoryPage";

const FACETS = {
  categories: [
    { value: "Technology", count: 12 },
    { value: "Finance", count: 4 },
  ],
  industries: [
    { value: "Software", count: 9 },
    { value: "Banking", count: 3 },
  ],
  countries: [
    { id: 1, value: "United States", code: "US", count: 8 },
    { id: 2, value: "Pakistan", code: "PK", count: 5 },
  ],
  regions: [{ id: 3, value: "Punjab", count: 5 }],
  cities: [{ id: 4, value: "Lahore", count: 5 }],
  totals: { total: 16, verified: 7 },
};

const LEAD = {
  id: 1,
  full_name: "Real Person",
  company_name: "Real Co",
  industry: "Software",
  category: "Technology",
  country_name: "Pakistan",
  is_verified: true,
  created_at: "2025-01-01T00:00:00Z",
};

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/app/search"]}>
      <DirectoryPage />
    </MemoryRouter>
  );
}

/** The params of the most recent getLeads call. */
const lastLeadParams = () => {
  const calls = api.getLeads.mock.calls;
  return calls[calls.length - 1]?.[0] || {};
};

describe("DirectoryPage filters reach the API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    api.getLeadFacets.mockResolvedValue({ data: FACETS });
    api.getLeads.mockResolvedValue({
      data: { leads: [LEAD], nextCursor: null, total: 1 },
    });
  });

  afterEach(() => cleanup());

  it("sends the selected country as country_id", async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText("Real Person");

    const countrySelect = document.querySelectorAll(".app-filter-dropdown-select")[2];
    await user.selectOptions(countrySelect, "2");

    await waitFor(() => expect(lastLeadParams().country_id).toBe(2));
  });

  it("sends the selected industry", async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText("Real Person");

    const industrySelect = document.querySelectorAll(".app-filter-dropdown-select")[1];
    await user.selectOptions(industrySelect, "Software");

    await waitFor(() => expect(lastLeadParams().industry).toBe("Software"));
  });

  it("sends the selected category", async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText("Real Person");

    const categorySelect = document.querySelectorAll(".app-filter-dropdown-select")[0];
    await user.selectOptions(categorySelect, "Technology");

    await waitFor(() => expect(lastLeadParams().category).toBe("Technology"));
  });

  it("combines country + industry into a single request", async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText("Real Person");

    const selects = document.querySelectorAll(".app-filter-dropdown-select");
    await user.selectOptions(selects[2], "2"); // country
    await user.selectOptions(selects[1], "Software"); // industry

    await waitFor(() => {
      const p = lastLeadParams();
      expect(p.country_id).toBe(2);
      expect(p.industry).toBe("Software");
    });
  });

  it("sends the verified flag", async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText("Real Person");

    await user.click(document.querySelector(".app-filter-verify-toggle input"));

    await waitFor(() => expect(lastLeadParams().verified).toBe("true"));
  });

  it("keeps real API results instead of falling back to demo data", async () => {
    renderPage();
    expect(await screen.findByText("Real Person")).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText(/Sample leads/i)).not.toBeInTheDocument());
  });

  it("shows an honest empty state when a filtered search matches nothing", async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText("Real Person");

    api.getLeads.mockResolvedValue({ data: { leads: [], nextCursor: null, total: 0 } });

    const industrySelect = document.querySelectorAll(".app-filter-dropdown-select")[1];
    await user.selectOptions(industrySelect, "Banking");

    // It must NOT pretend the demo rows matched the filter.
    await waitFor(() => expect(screen.queryByText("Real Person")).not.toBeInTheDocument());
    expect(screen.queryByText(/Sample leads/i)).not.toBeInTheDocument();
  });
});

describe("filters known only by name are still sent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    api.getLeads.mockResolvedValue({
      data: { leads: [LEAD], nextCursor: null, total: 1 },
    });
  });

  afterEach(() => cleanup());

  it("falls back to country_code / country when the facet has no id", async () => {
    // A country suggested from the user's profile carries no facet id.
    api.getLeadFacets.mockResolvedValue({
      data: {
        ...FACETS,
        countries: [{ value: "Pakistan", code: "PK", count: 5 }], // no id
      },
    });

    const user = userEvent.setup();
    renderPage();
    await screen.findByText("Real Person");

    const countrySelect = document.querySelectorAll(".app-filter-dropdown-select")[2];
    await user.selectOptions(countrySelect, "Pakistan");

    await waitFor(() => {
      const p = lastLeadParams();
      // Either the ISO code or the plain name must be sent — never nothing.
      expect(p.country_code || p.country).toBeTruthy();
      expect(p.country_code ?? p.country).toBe("PK");
    });
  });
});
