"use client";

import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Button,
  Dialog,
  Field,
  HStack,
  Input,
  Portal,
  Stack,
  Switch,
  Textarea,
} from "@chakra-ui/react";
import { Pencil, Plus } from "lucide-react";
import { IconButtonWithTooltip } from "@/components/buttons/icon-button-with-tooltip";
import { FormError } from "@/components/forms/form-error";
import { toaster } from "@/components/ui/toaster";
import { applyActionErrors } from "@/lib/forms";
import {
  newsEditSchema,
  utcDayOf,
  type NewsEditInput,
  type NewsEditValues,
} from "@/lib/news-schemas";
import { sa_createNews, sa_updateNews, type AdminNews } from "./actions";

const FIELDS = ["title", "body", "startsOn", "expiresOn", "archived"] as const;

type Props = {
  /** The item to edit, behind a pencil on its row; without one, the New news item button. */
  item?: AdminNews;
  onSaved: (news: AdminNews) => void;
};

/**
 * The New news item button at the top of the News page, and the pencil on
 * each row, with the one dialog they share: a title, the news, the day it
 * starts showing on the home page and the day it stops. Editing adds the
 * Archived switch, the same change as the row's Archive button, saved with
 * the rest. A new item starts today, which is the UTC day
 * lib/news-schemas.ts explains, worked out when the dialog opens so the
 * page's markup never holds a date.
 *
 * One form for both, on the edit schema: a new item's switch stays off and
 * unseen, and sa_createNews reads the fields without it.
 */
export function NewsDialog({ item, onSaved }: Props) {
  const [open, setOpen] = useState(false);
  const {
    register,
    control,
    handleSubmit,
    setError,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<NewsEditInput, unknown, NewsEditValues>({ resolver: zodResolver(newsEditSchema) });

  function start() {
    reset(
      item
        ? {
            title: item.title,
            body: item.body,
            startsOn: utcDayOf(item.startsAt),
            expiresOn: item.expiresAt ? utcDayOf(item.expiresAt) : "",
            archived: item.isArchived,
          }
        : { title: "", body: "", startsOn: utcDayOf(new Date()), expiresOn: "", archived: false },
    );
    setOpen(true);
  }

  async function save(values: NewsEditValues) {
    try {
      const result = item ? await sa_updateNews(item.idNews, values) : await sa_createNews(values);
      if (!result.ok) {
        applyActionErrors({ setError }, result.errors, FIELDS);
        return;
      }
      onSaved(result.news);
      setOpen(false);
      toaster.create({
        title: `${result.news.title} has been ${item ? "saved" : "posted"}.`,
        type: "success",
      });
    } catch {
      setError("root", { message: "The news item could not be saved. Try again." });
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={(details) => setOpen(details.open)}>
      {item ? (
        <IconButtonWithTooltip label={`Edit ${item.title}`} tooltip="Edit" onClick={start}>
          <Pencil />
        </IconButtonWithTooltip>
      ) : (
        <Button type="button" size="sm" onClick={start}>
          <Plus /> New news item
        </Button>
      )}
      <Portal>
        <Dialog.Backdrop />
        <Dialog.Positioner>
          <Dialog.Content>
            <form onSubmit={handleSubmit(save)} noValidate>
              <Dialog.Header>
                <Dialog.Title>{item ? "Edit news item" : "New news item"}</Dialog.Title>
              </Dialog.Header>
              <Dialog.Body>
                <Stack gap="4">
                  <FormError message={errors.root?.message} size="sm" />
                  <Field.Root required invalid={!!errors.title}>
                    <Field.Label>Title</Field.Label>
                    <Input autoComplete="off" autoFocus {...register("title")} />
                    <Field.ErrorText>{errors.title?.message}</Field.ErrorText>
                  </Field.Root>
                  <Field.Root required invalid={!!errors.body}>
                    <Field.Label>News</Field.Label>
                    <Textarea rows={6} {...register("body")} />
                    <Field.ErrorText>{errors.body?.message}</Field.ErrorText>
                  </Field.Root>
                  <HStack gap="4" align="flex-start" wrap="wrap">
                    <Field.Root required invalid={!!errors.startsOn} flex="1" minW="40">
                      <Field.Label>Starts on</Field.Label>
                      <Input type="date" {...register("startsOn")} />
                      <Field.HelperText>A UTC day, as the home page dates it.</Field.HelperText>
                      <Field.ErrorText>{errors.startsOn?.message}</Field.ErrorText>
                    </Field.Root>
                    <Field.Root invalid={!!errors.expiresOn} flex="1" minW="40">
                      <Field.Label>Expires on (optional)</Field.Label>
                      <Input type="date" {...register("expiresOn")} />
                      <Field.HelperText>Gone from the home page from this day.</Field.HelperText>
                      <Field.ErrorText>{errors.expiresOn?.message}</Field.ErrorText>
                    </Field.Root>
                  </HStack>
                  {item && (
                    <Controller
                      control={control}
                      name="archived"
                      render={({ field }) => (
                        <Field.Root invalid={!!errors.archived}>
                          <Switch.Root
                            name={field.name}
                            checked={field.value}
                            onCheckedChange={(details) => field.onChange(details.checked)}
                          >
                            {/* Chakra renders a checkbox input; role="switch" is the ARIA
                              pattern for an on/off toggle and what tests query. */}
                            <Switch.HiddenInput
                              role="switch"
                              onBlur={field.onBlur}
                              ref={field.ref}
                            />
                            <Switch.Control>
                              <Switch.Thumb />
                            </Switch.Control>
                            <Switch.Label>Archived</Switch.Label>
                          </Switch.Root>
                          <Field.HelperText>
                            Off the home page whatever its days say, and kept here.
                          </Field.HelperText>
                          <Field.ErrorText>{errors.archived?.message}</Field.ErrorText>
                        </Field.Root>
                      )}
                    />
                  )}
                </Stack>
              </Dialog.Body>
              <Dialog.Footer>
                <Dialog.ActionTrigger asChild>
                  <Button type="button" variant="outline" disabled={isSubmitting}>
                    Cancel
                  </Button>
                </Dialog.ActionTrigger>
                <Button type="submit" loading={isSubmitting}>
                  {item ? "Save" : "Post"}
                </Button>
              </Dialog.Footer>
            </form>
          </Dialog.Content>
        </Dialog.Positioner>
      </Portal>
    </Dialog.Root>
  );
}
