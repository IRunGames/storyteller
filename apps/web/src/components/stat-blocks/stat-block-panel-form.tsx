"use client";

import { useForm, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Alert, Button, HStack, Stack } from "@chakra-ui/react";
import type { StatBlockSystems } from "@/app/(app)/(nav)/libraries/actions";
import type { ElementFormInput } from "@/lib/element-schemas";
import { statBlocksSchema } from "@/lib/stat-block-schemas";
import { systemKey, toStatBlockFields, type StatBlockSystem } from "@/lib/stat-blocks";
import { sa_setStatBlocks, type ElementStatBlock, type StatBlockHolder } from "./actions";
import { StatBlockFields } from "./stat-block-fields";

type Props = {
  holder: StatBlockHolder;
  block: ElementStatBlock;
  onSaved: (blocks: ElementStatBlock[]) => void;
  onCancel: () => void;
};

/**
 * The element panel's edit form for one system's block: the same generated
 * fields and picker as the prep form (StatBlockFields), over the block as
 * stored, posted whole to sa_setStatBlocks, which answers with every block
 * worked out again. The form's values are typed as the element form's,
 * which is what StatBlockFields is written against; the other fields are
 * never drawn or posted, and the resolver checks only the blocks.
 */
export function StatBlockPanelForm({ holder, block, onSaved, onCancel }: Props) {
  const system: StatBlockSystem = {
    idSystem: block.idSystem,
    label: block.label,
    definition: block.definition,
  };
  const systems: StatBlockSystems = { storySystem: block.idSystem, systems: [system] };
  const key = systemKey(block.idSystem);
  const {
    control,
    register,
    setValue,
    setError,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ElementFormInput>({
    resolver: zodResolver(
      z.object({ statBlocks: statBlocksSchema([system]) }),
    ) as unknown as Resolver<ElementFormInput>,
    defaultValues: {
      statBlocks: { [key]: toStatBlockFields(block.definition, block.block) },
      removedSystems: [],
    },
  });

  async function onSubmit(values: ElementFormInput) {
    let result: Awaited<ReturnType<typeof sa_setStatBlocks>>;
    try {
      result = await sa_setStatBlocks(holder, values.statBlocks);
    } catch {
      setError("root", { message: "The stat blocks could not be saved. Please try again." });
      return;
    }
    if (result.ok) {
      onSaved(result.blocks);
      return;
    }
    for (const [path, message] of Object.entries(result.errors)) {
      setError(path === "root" ? "root" : (path as "statBlocks"), { message });
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate data-testid={`stat-block-form-${key}`}>
      <Stack gap="3">
        {errors.root && (
          <Alert.Root role="alert" status="error" size="sm">
            <Alert.Indicator />
            <Alert.Content>
              <Alert.Description>{errors.root.message}</Alert.Description>
            </Alert.Content>
          </Alert.Root>
        )}
        <StatBlockFields
          systems={systems}
          control={control}
          register={register}
          setValue={setValue}
          errors={errors}
        />
        <HStack gap="2">
          <Button type="submit" size="sm" loading={isSubmitting}>
            Save stat blocks
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        </HStack>
      </Stack>
    </form>
  );
}
