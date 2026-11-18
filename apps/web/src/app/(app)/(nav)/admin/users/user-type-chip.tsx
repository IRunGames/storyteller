"use client";

import { useId } from "react";
import { Badge, Button, Menu, Portal } from "@chakra-ui/react";
import { ChevronDown } from "lucide-react";
import { WithTooltip } from "@/components/buttons/with-tooltip";
import { useOptimisticAction } from "@/hooks/use-optimistic-action";
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
 * The change is shown before the action answers and put back if it refuses
 * (useOptimisticAction), as the status chip does.
 */
export function UserTypeChip({ idUser, idUserType, types, readOnly = false, onChanged }: Props) {
  const [shown, choose] = useOptimisticAction(
    idUserType,
    async (next) => {
      const result = await sa_setUserType(idUser, next);
      if (!result.ok) return result;
      onChanged?.({ idUserType: result.idUserType, userTypeName: result.userTypeName });
      return { ok: true, value: result.idUserType };
    },
    { failed: "That type could not be changed." },
  );
  const triggerId = useId();

  const label = types.find((type) => type.idUserType === shown)?.label ?? String(shown);

  if (readOnly) {
    return (
      <Badge variant="outline" rounded="full" px="2">
        {label}
      </Badge>
    );
  }

  function pick(value: string) {
    const next = Number(value);
    if (next !== shown) choose(next);
  }

  return (
    <Menu.Root ids={{ trigger: triggerId }} positioning={{ placement: "bottom-start" }}>
      <WithTooltip tooltip="Change type" menuTrigger={triggerId}>
        <Button type="button" size="xs" variant="outline" rounded="full">
          {label}
          <ChevronDown />
        </Button>
      </WithTooltip>
      {/* Through a Portal, so the pill inside the table's scroll area is not
          clipped by it. */}
      <Portal>
        <Menu.Positioner>
          <Menu.Content minW="12rem">
            <Menu.RadioItemGroup value={String(shown)} onValueChange={(e) => pick(e.value)}>
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
