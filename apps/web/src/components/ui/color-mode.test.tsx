import { describe, it } from "node:test";
import { expect } from "expect";
import { render, screen } from "@testing-library/react";
import { Provider } from "./provider";
import { ColorModeButton } from "./color-mode";

// Rendered under a forced theme, as the landing page never is, so the test
// can say which theme the button sees; the icon is lucide's, named by class.
async function iconUnder(theme: string) {
  render(
    <Provider forcedTheme={theme}>
      <ColorModeButton />
    </Provider>,
  );
  const button = await screen.findByRole("button", { name: "Toggle color mode" });
  return button.querySelector("svg")?.getAttribute("class") ?? "";
}

describe("ColorModeButton", () => {
  it("shows the moon on a tinted dark theme, not only on Dark", async () => {
    expect(await iconUnder("halloween")).toContain("lucide-moon");
  });

  it("shows the sun on White Out, the light tinted theme", async () => {
    expect(await iconUnder("whiteout")).toContain("lucide-sun");
  });
});
