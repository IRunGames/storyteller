"use client";

import { useId, useState, useTransition } from "react";
import { Badge, Button, Menu, Portal, Tooltip } from "@chakra-ui/react";
import { ChevronDown } from "lucide-react";
import { toaster } from "@/components/ui/toaster";
import { sa_setUserType, type UserTypeOption } from "./actions";

/** The type the action gave the account, as the row needs it. */
export type UserTypeChange = { idUserType: number; userTypeName: string };

type Props = {
  /** The account's primary key. */
  idUser: string;
  /** The s_user_types id the account holds. */
  idUserType: number;
  /** Every account type, from sa_listUserTypes, in the order the menu lists them. */
  types: UserTypeOption[];
  /**
   * A chip that only shows: the administrator's own row, which the action
   * refuses too, so no one demotes themself off this page; and a guest's,
   * who is deleted rather than kept.
   */
  readOnly?: boolean;
  /** The new type, once the action has taken it, so the table can keep up. */
  onChanged?: (type: UserTypeChange) => void;
};

/**
 * An account's type on the administrators' Users page, and the way to change
 * it: a pill that opens a menu of every type with the account's own one
 * checked, and choosing another saves it at once. There is no workflow
 * between types, so every type is always on offer, unlike the status chip
 * beside it.
 *
 * The change is shown before the action answers, as the status chip does; a
 * refusal puts the old type back and says why in a toast, there being
 * nothing on the page for the administrator to correct.
 */
export function UserTypeChip({ idUser, idUserType, types, readOnly = false, onChanged }: Props) {
  const [shown, setShown] = useState(idUserType);
  const [, startTransition] = useTransition();
  // Tooltip and menu each look their trigger up by id; sharing one keeps the
  // menu from opening at the page corner (nav-theme-menu.tsx).
  const triggerId = useId();

  // The row's own type wins when it changes underneath: a page that
  // reloaded, say.
  const [lastGiven, setLastGiven] = useState(idUserType);
  if (lastGiven !== idUserType) {
    setLastGiven(idUserType);
    setShown(idUserType);
  }

  const label = types.find((type) => type.idUserType === shown)?.label ?? String(shown);

  if (readOnly) {
    return (
      <Badge variant="outline" rounded="full" px="2">
        {label}
      </Badge>
    );
  }

  function choose(value: string) {
    const next = Number(value);
    if (next === shown) return;
    const previous = shown;
    setShown(next);
    startTransition(async () => {
      try {
        const result = await sa_setUserType(idUser, next);
        if (result.ok) {
          setShown(result.idUserType);
          onChanged?.({ idUserType: result.idUserType, userTypeName: result.userTypeName });
          return;
        }
        setShown(previous);
        toaster.create({ title: result.error, type: "error" });
      } catch {
        setShown(previous);
        toaster.create({ title: "That type could not be changed.", type: "error" });
      }
    });
  }

  return (
    <Menu.Root ids={{ trigger: triggerId }} positioning={{ placement: "bottom-start" }}>
      <Tooltip.Root openDelay={200} positioning={{ placement: "top" }} ids={{ trigger: triggerId }}>
        <Tooltip.Trigger asChild>
          <Menu.Trigger asChild>
            <Button type="button" size="xs" variant="outline" rounded="full">
              {label}
              <ChevronDown />
            </Button>
          </Menu.Trigger>
        </Tooltip.Trigger>
        <Portal>
          <Tooltip.Positioner>
            <Tooltip.Content>Change type</Tooltip.Content>
          </Tooltip.Positioner>
        </Portal>
      </Tooltip.Root>
      {/* Through a Portal, so the pill inside the table's scroll area is not
          clipped by it. */}
      <Portal>
        <Menu.Positioner>
          <Menu.Content minW="12rem">
            <Menu.RadioItemGroup value={String(shown)} onValueChange={(e) => choose(e.value)}>
              {types.map((type) => (
                <Menu.RadioItem key={type.idUserType} value={String(type.idUserType)}>
                  <Menu.ItemIndicator />
                  <Menu.ItemText>{type.label}</Menu.ItemText>
                </Menu.RadioItem>
              ))}
            </Menu.RadioItemGroup>
          </Menu.Content>
        </Menu.Positioner>
      </Portal>
    </Menu.Root>
  );
}
