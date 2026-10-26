import { afterEach, describe, it } from "node:test";
import { expect } from "expect";
import { screen } from "@testing-library/react";

import { renderWithProviders } from "@/test/render";
import { EnvironmentVisibility } from "./environment-visibility";

describe("EnvironmentVisibility", () => {
  const environment = process.env.NEXT_PUBLIC_ENVIRONMENT;
  afterEach(() => {
    if (environment === undefined) delete process.env.NEXT_PUBLIC_ENVIRONMENT;
    else process.env.NEXT_PUBLIC_ENVIRONMENT = environment;
  });

  it("shows its children below the level it is given", () => {
    process.env.NEXT_PUBLIC_ENVIRONMENT = "DEV";
    renderWithProviders(
      <EnvironmentVisibility showBelow="PRODUCTION">
        <p>Debug panel</p>
      </EnvironmentVisibility>,
    );
    expect(screen.getByText("Debug panel")).toBeInTheDocument();
  });

  it("hides them at that level, and shows nothing in their place", () => {
    process.env.NEXT_PUBLIC_ENVIRONMENT = "PRODUCTION";
    // A box of its own to look in: the provider adds next-themes' script
    // beside it.
    renderWithProviders(
      <div data-testid="slot">
        <EnvironmentVisibility showBelow="PRODUCTION">
          <p>Debug panel</p>
        </EnvironmentVisibility>
      </div>,
    );
    expect(screen.queryByText("Debug panel")).not.toBeInTheDocument();
    expect(screen.getByTestId("slot")).toBeEmptyDOMElement();
  });

  it("shows the fallback in their place when given one", () => {
    process.env.NEXT_PUBLIC_ENVIRONMENT = "PRODUCTION";
    renderWithProviders(
      <EnvironmentVisibility showBelow="PRODUCTION" fallback={<p>Coming soon</p>}>
        <p>Debug panel</p>
      </EnvironmentVisibility>,
    );
    expect(screen.queryByText("Debug panel")).not.toBeInTheDocument();
    expect(screen.getByText("Coming soon")).toBeInTheDocument();
  });

  it("shows above a level, and between two", () => {
    process.env.NEXT_PUBLIC_ENVIRONMENT = "STAGING";
    renderWithProviders(
      <>
        <EnvironmentVisibility showAbove="TEST">
          <p>Above test</p>
        </EnvironmentVisibility>
        <EnvironmentVisibility showAbove="STAGING">
          <p>Above staging</p>
        </EnvironmentVisibility>
        <EnvironmentVisibility showAbove="DEV" showBelow="PRODUCTION">
          <p>Between</p>
        </EnvironmentVisibility>
      </>,
    );
    expect(screen.getByText("Above test")).toBeInTheDocument();
    expect(screen.queryByText("Above staging")).not.toBeInTheDocument();
    expect(screen.getByText("Between")).toBeInTheDocument();
  });

  it("hides when the environment is not set", () => {
    delete process.env.NEXT_PUBLIC_ENVIRONMENT;
    renderWithProviders(
      <EnvironmentVisibility showBelow="PRODUCTION" fallback={<p>Coming soon</p>}>
        <p>Debug panel</p>
      </EnvironmentVisibility>,
    );
    expect(screen.queryByText("Debug panel")).not.toBeInTheDocument();
    expect(screen.getByText("Coming soon")).toBeInTheDocument();
  });

  it("will not type-check without a level", () => {
    // @ts-expect-error -- at least one of showBelow and showAbove is required.
    const element = <EnvironmentVisibility>hidden</EnvironmentVisibility>;
    expect(element).toBeTruthy();
  });
});
