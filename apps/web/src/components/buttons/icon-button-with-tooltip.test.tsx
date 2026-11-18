import { describe, it } from "node:test";
import { expect } from "expect";
import { useId, useState } from "react";
import { Menu, Popover, Portal } from "@chakra-ui/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders, screen, waitFor } from "@/test/render";
import { IconButtonWithTooltip } from "./icon-button-with-tooltip";

function MenuSite() {
  const triggerId = useId();
  return (
    <Menu.Root ids={{ trigger: triggerId }}>
      <IconButtonWithTooltip label="Sort" menuTrigger={triggerId}>
        <span>s</span>
      </IconButtonWithTooltip>
      <Portal>
        <Menu.Positioner>
          <Menu.Content>
            <Menu.Item value="a">By name</Menu.Item>
          </Menu.Content>
        </Menu.Positioner>
      </Portal>
    </Menu.Root>
  );
}

function PopoverSite() {
  const triggerId = useId();
  const [open, setOpen] = useState(false);
  return (
    <Popover.Root ids={{ trigger: triggerId }} open={open} onOpenChange={(d) => setOpen(d.open)}>
      <IconButtonWithTooltip label="Notes" tooltip="Notes and questions" popoverTrigger={triggerId}>
        <span>n</span>
      </IconButtonWithTooltip>
      <Portal>
        <Popover.Positioner>
          <Popover.Content>
            <Popover.Title>Kept so far</Popover.Title>
          </Popover.Content>
        </Popover.Positioner>
      </Portal>
    </Popover.Root>
  );
}

describe("IconButtonWithTooltip", () => {
  it("is a button named by its label, with the label as its tooltip", async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <IconButtonWithTooltip label="Add scene" onClick={() => {}}>
        <span>+</span>
      </IconButtonWithTooltip>,
    );
    const button = screen.getByRole("button", { name: "Add scene" });
    await user.hover(button);
    expect(await screen.findByRole("tooltip")).toHaveTextContent("Add scene");
  });

  it("reports and shows an expanded state", () => {
    renderWithProviders(
      <IconButtonWithTooltip label="Add" expanded onClick={() => {}}>
        <span>+</span>
      </IconButtonWithTooltip>,
    );
    expect(screen.getByRole("button", { name: "Add" })).toHaveAttribute("aria-expanded", "true");
  });

  it("opens the menu it is the trigger of", async () => {
    const user = userEvent.setup();
    renderWithProviders(<MenuSite />);
    await user.click(screen.getByRole("button", { name: "Sort" }));
    expect(await screen.findByRole("menuitem", { name: "By name" })).toBeInTheDocument();
  });

  it("opens the popover it is the trigger of, with a tooltip of its own words", async () => {
    const user = userEvent.setup();
    renderWithProviders(<PopoverSite />);
    const button = screen.getByRole("button", { name: "Notes" });
    await user.hover(button);
    expect(await screen.findByRole("tooltip")).toHaveTextContent("Notes and questions");
    await user.click(button);
    expect(await screen.findByRole("dialog", { name: "Kept so far" })).toBeInTheDocument();
    await waitFor(() => expect(button).toHaveAttribute("aria-expanded", "true"));
  });
});
