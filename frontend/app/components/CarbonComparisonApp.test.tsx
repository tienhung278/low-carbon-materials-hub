import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import CarbonComparisonApp from "./CarbonComparisonApp";
import type { CarbonStage, Product } from "../../lib/types";

describe("CarbonComparisonApp", () => {
  it("renders filters, missing data labels, warnings, and provenance", () => {
    render(<CarbonComparisonApp products={[product("a", 25), product("b", 32)]} />);

    expect(screen.getByRole("heading", { name: /concrete embodied carbon comparison/i })).toBeInTheDocument();
    expect(screen.getByText("2 shown")).toBeInTheDocument();
    expect(screen.getByText("ND: not declared")).toBeInTheDocument();
    expect(screen.getAllByText("Source EPD").length).toBeGreaterThan(0);
    expect(screen.getAllByText(/source-a.pdf/).length).toBeGreaterThan(0);
    expect(screen.getByText("Source: source-a.pdf")).toBeInTheDocument();
    expect(screen.getByText(/Not declared in at least one selected EPD/)).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/compressive strength/i), {
      target: { value: "25" },
    });

    expect(screen.getByText("1 shown")).toBeInTheDocument();
    const productsPanel = screen.getByRole("heading", { name: "Products" }).closest("section");
    expect(productsPanel).not.toBeNull();
    expect(within(productsPanel as HTMLElement).queryByText("Product b")).not.toBeInTheDocument();
  });

  it("shows an empty state when filters remove all products", () => {
    render(<CarbonComparisonApp products={[product("a", 25)]} />);

    fireEvent.change(screen.getByLabelText(/manufacturing location/i), {
      target: { value: "Melbourne" },
    });

    expect(screen.getByText("No products match the current filters.")).toBeInTheDocument();
  });

  it("renders fallback labels for nullable product metadata", () => {
    const partial = product("partial", 25);
    partial.productName = null;
    partial.manufacturer = null;
    partial.manufacturingLocation = null;
    partial.declaredUnit = null;
    partial.carbonStages = [];

    render(<CarbonComparisonApp products={[partial]} />);

    expect(screen.getAllByText("Unknown product").length).toBeGreaterThan(0);
    expect(screen.getByText(/Unknown manufacturer/)).toBeInTheDocument();
    expect(screen.getByText("Unknown location")).toBeInTheDocument();
    expect(screen.getByText(/Unknown declared unit/)).toBeInTheDocument();
  });


  it("can deselect products and asks for another product", () => {
    render(<CarbonComparisonApp products={[product("a", 25), product("b", 32)]} />);

    const productsPanel = screen.getByRole("heading", { name: "Products" }).closest("section");
    expect(productsPanel).not.toBeNull();
    const checkboxes = within(productsPanel as HTMLElement).getAllByRole("checkbox");

    fireEvent.click(checkboxes[0]);
    fireEvent.click(checkboxes[1]);

    expect(screen.getByText("Select at least two products to assess comparability.")).toBeInTheDocument();
  });

  it("replaces the oldest selected product at the selection limit and clears filters", () => {
    render(
      <CarbonComparisonApp
        products={[
          product("a", 25),
          product("b", 32),
          product("c", 40),
          product("d", 45),
          product("e", 50),
        ]}
      />,
    );

    const productsPanel = screen.getByRole("heading", { name: "Products" }).closest("section");
    expect(productsPanel).not.toBeNull();
    const checkboxes = within(productsPanel as HTMLElement).getAllByRole("checkbox");

    fireEvent.click(checkboxes[3]);
    fireEvent.click(checkboxes[4]);
    fireEvent.change(screen.getByLabelText(/compressive strength/i), {
      target: { value: "25" },
    });
    expect(screen.getByText("1 shown")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Clear" }));

    expect(screen.getByText("5 shown")).toBeInTheDocument();
    expect(screen.getAllByText("Product e").length).toBeGreaterThan(0);
  });
});

function product(id: string, strengthMpa: number): Product {
  const carbon = 90 + id.charCodeAt(0);

  return {
    id,
    productName: `Product ${id}`,
    manufacturer: "Concrete Co",
    manufacturingLocation: id === "a" ? "Brisbane" : "Melbourne",
    strengthMpa,
    declaredUnit: "1 cubic metre",
    scope: {
      standard: "EN 15804+A2",
      description: "A1-A3 with options",
    },
    carbonStages: [
      stage("A1-A3", "declared", carbon, `source-${id}.pdf`),
      stage("A4", id === "a" ? "not_declared" : "declared", id === "a" ? null : 4, `source-${id}.pdf`),
      stage("C1", "missing", null, `source-${id}.pdf`),
    ],
  };
}

function stage(
  module: string,
  status: CarbonStage["status"],
  value: number | null,
  pdf: string,
): CarbonStage {
  return {
    module,
    indicator: "GWP-total",
    unit: "kg CO2 eq.",
    value,
    status,
    provenance: {
      pdf,
      sourcePage: 9,
      tableLabel: "GWP table",
      quote: "GWP-total row",
    },
  };
}
