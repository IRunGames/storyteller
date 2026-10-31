import { describe, it, mock } from "node:test";
import { expect } from "expect";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MessageSquare } from "lucide-react";

import { renderWithProviders } from "@/test/render";
import { NavDrawerContext } from "@/components/nav/nav-drawer-context";
import { PlayPanelToggle } from "./play-panel-toggle";

const toggle = (count?: number) =>
  renderWithProviders(
    <PlayPanelToggle label="Chat" controls="chat" isOpen={false} count={count} onToggle={() => {}}>
      <MessageSquare />
    </PlayPanelToggle>,
  );

describe("PlayPanelToggle", () => {
  it("carries no badge with nothing new", () => {
    toggle(0);
    expect(screen.getByRole("button", { name: "Chat" })).toBeInTheDocument();
    expect(screen.queryByText("0")).not.toBeInTheDocument();
  });

  it("shows what came in on its corner and says it in its name", () => {
    toggle(3);
    const button = screen.getByRole("button", { name: "Chat, 3 new" });
    expect(button).toHaveTextContent("3");
  });

  it("stops counting out loud at 99", () => {
    toggle(140);
    expect(screen.getByRole("button", { name: "Chat, 140 new" })).toHaveTextContent("99+");
  });

  it("draws its name in the drawer, and closes the drawer as it toggles", async () => {
    const onToggle = mock.fn();
    const close = mock.fn();
    renderWithProviders(
      <NavDrawerContext.Provider value={{ close }}>
        <PlayPanelToggle label="Chat" controls="chat" isOpen count={3} onToggle={onToggle}>
          <MessageSquare />
        </PlayPanelToggle>
      </NavDrawerContext.Provider>,
    );
    const button = screen.getByRole("button", { name: "Chat, 3 new" });
    expect(button).toHaveTextContent("Chat3");
    expect(button).toHaveAttribute("aria-pressed", "true");
    await userEvent.click(button);
    expect(onToggle.mock.callCount()).toBe(1);
    expect(close.mock.callCount()).toBe(1);
  });
});
