// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { buildAutomaticMapping } from "../CsvFieldMapping";

describe("CsvFieldMapping automatic mapping", () => {
  it("combines first, middle and last name with middle between first and last", () => {
    const mapping = buildAutomaticMapping(["First Name", "Middle Name", "Last Name", "Email"]);
    expect(mapping.full_name).toEqual({
      type: "combined",
      csvFields: ["First Name", "Middle Name", "Last Name"],
      separator: "space",
    });
  });

  it("still combines first and last name when no middle name column exists", () => {
    const mapping = buildAutomaticMapping(["First Name", "Last Name"]);
    expect(mapping.full_name).toEqual({
      type: "combined",
      csvFields: ["First Name", "Last Name"],
      separator: "space",
    });
  });

  it("maps Primary City and Parent City to the city field", () => {
    const primary = buildAutomaticMapping(["Primary City", "Email"]);
    expect(primary.city).toEqual({ type: "single", csvField: "Primary City" });

    const parent = buildAutomaticMapping(["Parent City", "Email"]);
    expect(parent.city).toEqual({ type: "single", csvField: "Parent City" });
  });

  it("maps Primary State and Parent State to the region/state field", () => {
    const primary = buildAutomaticMapping(["Primary State", "Email"]);
    expect(primary.region).toEqual({ type: "single", csvField: "Primary State" });

    const parent = buildAutomaticMapping(["Parent State", "Email"]);
    expect(parent.region).toEqual({ type: "single", csvField: "Parent State" });
  });

  it("maps a 'Title' column to the job title field", () => {
    const mapping = buildAutomaticMapping(["Title", "Email"]);
    expect(mapping.job_title).toEqual({ type: "single", csvField: "Title" });
  });

  it("maps common employee-count headings", () => {
    const mapping = buildAutomaticMapping(["Company Size", "Email"]);
    expect(mapping.num_employees).toEqual({ type: "single", csvField: "Company Size" });
  });
});
