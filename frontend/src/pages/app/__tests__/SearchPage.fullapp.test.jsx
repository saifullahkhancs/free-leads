// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { describe, expect, it, vi, afterEach } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";

// ---------------------------------------------------------------------------
// Full-app check: render the real <App /> (site header, footer, auth provider)
// at /app/search with the backend unreachable and no signed-in user — the
// state a fresh visitor sees in the preview. The search page must still show
// the bundled mock leads instead of a blank or error screen.
// ---------------------------------------------------------------------------
vi.mock("../../../api/client", () => ({
  trySilentLogin: vi.fn(async () => null), // no session cookie → logged out
  getLeads: vi.fn(async () => {
    const err = new Error("Request failed");
    err.status = 500;
    throw err;
  }),
  getLeadFacets: vi.fn(async () => {
    const err = new Error("Request failed");
    err.status = 500;
    throw err;
  }),
  exportLeads: vi.fn(),
  getMyBilling: vi.fn(),
}));

import App from "../../../App";

describe("/app/search (Search Leads page) — full app render", () => {
  afterEach(() => {
    cleanup();
    localStorage.clear();
  });

  it("renders the mock leads for a logged-out visitor with no backend", async () => {
    window.history.pushState({}, "", "/app/search");
    render(<App />);

    expect(await screen.findByText("Alex Chen")).toBeInTheDocument();
    expect(screen.getByText("Notion")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Free Leads" })).toBeInTheDocument();

    const countNumber = document.querySelector(".app-count-number");
    expect(countNumber).toHaveTextContent("16");

    await waitFor(() =>
      expect(screen.getByText(/Sample leads/i)).toBeInTheDocument()
    );
  });
});
