import { before, describe, it, mock } from "node:test";
import { expect } from "expect";
import { screen } from "@testing-library/react";

import { renderWithProviders } from "@/test/render";
import { WELCOME_BACKGROUNDS } from "@/lib/welcome";

let AuthLayout: typeof import("./layout").default;

describe("AuthLayout", () => {
  before(async () => {
    mock.module("next/navigation", {
      namedExports: {
        redirect: () => {
          throw new Error("redirect");
        },
      },
    });
    mock.module("@/lib/require-session", { namedExports: { getSession: async () => null } });
    ({ default: AuthLayout } = await import("./layout"));
  });

  it("paints one of the welcome pictures behind the form", async () => {
    const layout = await AuthLayout({ children: <p>The form</p> });
    const { container } = renderWithProviders(layout);

    expect(screen.getByText("The form")).toBeInTheDocument();
    const painted = [...container.querySelectorAll<HTMLElement>("[aria-hidden]")].find((el) =>
      el.style.backgroundImage.includes("_welcome.webp"),
    );
    const urls = WELCOME_BACKGROUNDS.map((url) => `url("${url}")`);
    expect(urls).toContain(painted?.style.backgroundImage);
  });

  it("offers the landing page's colour-mode button under the form", async () => {
    const layout = await AuthLayout({ children: <p>The form</p> });
    renderWithProviders(layout);

    // ClientOnly draws the button only once mounted.
    expect(await screen.findByRole("button", { name: "Toggle color mode" })).toBeInTheDocument();
  });

  it("puts the Storyteller logo and name in the upper left, ahead of the form", async () => {
    const layout = await AuthLayout({ children: <p>The form</p> });
    renderWithProviders(layout);

    const brand = screen.getByRole("link", { name: "Storyteller" });
    expect(brand).toHaveAttribute("href", "/");
    expect(brand.querySelector('img[src="/images/storyteller-logo.png"]')).not.toBeNull();
    const form = screen.getByText("The form");
    expect(brand.compareDocumentPosition(form) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});
