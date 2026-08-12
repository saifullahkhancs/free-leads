// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { DEFAULT_MOCK_LEADS } from "../../../utils/mockLeads";

// ---------------------------------------------------------------------------
// Stub the API layer so the directory behaves as if the backend has no data
// (or is unreachable) — the only situation where mock leads should appear.
// ---------------------------------------------------------------------------
vi.mock("../../../api/client", () => ({
  getLeads: vi.fn(),
  getLeadFacets: vi.fn(),
  exportLeads: vi.fn(),
  getMyBilling: vi.fn(),
}));

vi.mock("../../../context/AuthContext", () => ({
  useAuth: () => ({ user: null, isAuthenticated: false, isLoading: false }),
}));

import * as api from "../../../api/client";
import DirectoryPage from "../DirectoryPage";

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/app/search"]}>
      <DirectoryPage />
    </MemoryRouter>
  );
}

describe("DirectoryPage mock-leads fallback (search leads page)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  afterEach(() => {
    cleanup();
  });

  it("shows the mock leads when the API returns an empty result set", async () => {
    api.getLeads.mockResolvedValue({ data: { leads: [], nextCursor: null } });
    api.getLeadFacets.mockResolvedValue({ data: {} });

    renderPage();

    // First mock lead (sorted by most recent) must render in the table.
    expect(await screen.findByText("Alex Chen")).toBeInTheDocument();
    expect(screen.getByText("Stripe")).toBeInTheDocument();

    // All bundled mock leads are visible.
    const countNumber = document.querySelector(".app-count-number");
    expect(countNumber).toHaveTextContent(String(DEFAULT_MOCK_LEADS.length));

    // The demo-mode banner tells the user these are samples.
    await waitFor(() =>
      expect(screen.getByText(/Sample leads/i)).toBeInTheDocument()
    );
  });

  it("shows the mock leads when the API is unreachable", async () => {
    api.getLeads.mockRejectedValue(Object.assign(new Error("Request failed"), { status: 500 }));
    api.getLeadFacets.mockRejectedValue(Object.assign(new Error("Request failed"), { status: 500 }));

    renderPage();

    expect(await screen.findByText("Elena Rostova")).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByText(/Sample leads/i)).toBeInTheDocument()
    );
  });
});
