import { describe, it } from "node:test";
import { expect } from "expect";
import { screen } from "@testing-library/react";

import { renderWithProviders } from "@/test/render";
import { WELCOME_BACKGROUNDS } from "@/lib/welcome";
import LandingPage from "./page";

describe("LandingPage", () => {
  it("names the app and offers sign-up and log-in", () => {
    renderWithProviders(<LandingPage />);

    expect(screen.getByRole("heading", { name: "Storyteller" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Get started" })).toHaveAttribute("href", "/signup");
    expect(screen.getByRole("link", { name: "Log in" })).toHaveAttribute("href", "/login");
  });

  it("paints one of the welcome pictures behind the page", () => {
    const { container } = renderWithProviders(<LandingPage />);

    const painted = [...container.querySelectorAll<HTMLElement>("[aria-hidden]")].find((el) =>
      el.style.backgroundImage.includes("_welcome.webp"),
    );
    const urls = WELCOME_BACKGROUNDS.map((url) => `url("${url}")`);
    expect(urls).toContain(painted?.style.backgroundImage);
  });
});
