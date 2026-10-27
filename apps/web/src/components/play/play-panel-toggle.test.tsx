import { describe, it } from "node:test";
import { expect } from "expect";
import { screen } from "@testing-library/react";
import { MessageSquare } from "lucide-react";

import { renderWithProviders } from "@/test/render";
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
});
