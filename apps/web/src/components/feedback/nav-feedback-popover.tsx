"use client";

import { useId, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Alert,
  Button,
  Field,
  HStack,
  IconButton,
  Popover,
  Portal,
  Stack,
  Text,
  Textarea,
  Tooltip,
} from "@chakra-ui/react";
import { sa_submitFeedback } from "./actions";
import { feedbackSchema, type FeedbackValues } from "@/lib/feedback-schemas";
import { ThumbsDown, ThumbsUp } from "lucide-react";
import { toaster } from "@/components/ui/toaster";

// Self-contained: the popover and its server action live together in this
// folder, and the popover imports it directly rather than having the layout
// thread it through the header as a prop.

type Props = {
  /** The page being rated, from usePathname() in the header. */
  pathname: string;
};

// The two rating choices, as buttons wearing role="radio" rather than Chakra's
// RadioGroup: the options are icons with no visible text, and a native radio
// would need its control hidden and its label restyled to look like a button
// anyway. aria-checked and the radiogroup wrapper give a screen reader the
// same picture.
const RATINGS = [
  { value: true, label: "Good", hint: "Good!", Icon: ThumbsUp },
  { value: false, label: "Not good", hint: "Not good", Icon: ThumbsDown },
] as const;

// Tooltip and popover each stamp an id on the one button and look their trigger
// up by that id when positioning. Left to their own ids, the tooltip's wins
// and the popover anchors to nothing, opening at the page corner. Handing both
// the same trigger id keeps them pointed at the same element.
export function NavFeedbackPopover({ pathname }: Props) {
  const [open, setOpen] = useState(false);
  const triggerId = useId();

  const {
    control,
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<FeedbackValues>({
    resolver: zodResolver(feedbackSchema),
    // Thumbs up is preselected so a happy reader can just press Send.
    // pagePath is only a placeholder here; submit() reads the live pathname
    // so a navigation while the popover is open rates the page actually shown.
    defaultValues: { isPositive: true, feedback: "", pagePath: pathname },
  });

  function close() {
    setOpen(false);
    reset();
  }

  async function submit(values: FeedbackValues) {
    const result = await sa_submitFeedback({ ...values, pagePath: pathname });

    // Success closes the popover at once and says thanks in a toast, so the
    // acknowledgement outlives the popover instead of the popover lingering
    // to show it. A failure keeps the form open below, with the error inline,
    // so the user can fix it and resend.
    if (result.ok) {
      close();
      toaster.create({ title: "Thanks for your feedback.", type: "success" });
      return;
    }

    // Field errors the client check did not catch; anything else is a root
    // error, shown as an inline alert like the rest of the app's forms.
    for (const [field, message] of Object.entries(result.errors)) {
      setError(field as keyof FeedbackValues, { message });
    }
    if (Object.keys(result.errors).length === 0) {
      setError("root", {
        message: "Could not send your feedback. Please try again.",
      });
    }
  }

  return (
    <Popover.Root
      open={open}
      onOpenChange={(details) => (details.open ? setOpen(true) : close())}
      positioning={{ placement: "bottom-end" }}
      ids={{ trigger: triggerId }}
    >
      {/* Both triggers use asChild, so their props merge onto the one button:
          hover shows the tooltip, click opens the popover. */}
      <Tooltip.Root
        openDelay={200}
        positioning={{ placement: "top" }}
        ids={{ trigger: triggerId }}
      >
        <Tooltip.Trigger asChild>
          <Popover.Trigger asChild>
            <IconButton
              aria-label="Give feedback"
              variant="ghost"
              boxSize="11"
              rounded="10px"
              color="nav.icon"
            >
              <ThumbsUp />
            </IconButton>
          </Popover.Trigger>
        </Tooltip.Trigger>
        <Tooltip.Positioner>
          <Tooltip.Content>How&apos;s it going?</Tooltip.Content>
        </Tooltip.Positioner>
      </Tooltip.Root>
      <Portal>
        <Popover.Positioner>
          <Popover.Content w="xs">
            <Popover.Arrow />
            {/* Popover.Title, not bare text: it is what the dialog's
                aria-labelledby points at, so the popover gets a name. */}
            <Popover.Header fontWeight="semibold">
              <Popover.Title>How is this page working for you?</Popover.Title>
            </Popover.Header>
            <Popover.Body>
              <form onSubmit={handleSubmit(submit)} noValidate>
                  <Stack gap="4">
                    {errors.root && (
                      <Alert.Root status="error" size="sm">
                        <Alert.Indicator />
                        <Alert.Content>
                          <Alert.Description>
                            {errors.root.message}
                          </Alert.Description>
                        </Alert.Content>
                      </Alert.Root>
                    )}

                    <Field.Root invalid={!!errors.isPositive}>
                      <Controller
                        control={control}
                        name="isPositive"
                        render={({ field }) => (
                          <HStack role="radiogroup" aria-label="Rating" gap="2">
                            {RATINGS.map(({ value, label, hint, Icon }) => {
                              const checked = field.value === value;
                              return (
                                <Tooltip.Root
                                  key={label}
                                  openDelay={200}
                                  positioning={{ placement: "top" }}
                                >
                                  <Tooltip.Trigger asChild>
                                    <IconButton
                                      type="button"
                                      role="radio"
                                      aria-checked={checked}
                                      aria-label={label}
                                      variant={checked ? "subtle" : "ghost"}
                                      color={
                                        checked ? "nav.accent" : "nav.icon"
                                      }
                                      boxSize="11"
                                      rounded="10px"
                                      onClick={() => field.onChange(value)}
                                      onBlur={field.onBlur}
                                    >
                                      <Icon fill={checked ? "currentColor" : "none"} />
                                    </IconButton>
                                  </Tooltip.Trigger>
                                  <Portal>
                                    <Tooltip.Positioner>
                                      <Tooltip.Content>{hint}</Tooltip.Content>
                                    </Tooltip.Positioner>
                                  </Portal>
                                </Tooltip.Root>
                              );
                            })}
                          </HStack>
                        )}
                      />
                      <Field.ErrorText>
                        {errors.isPositive?.message}
                      </Field.ErrorText>
                    </Field.Root>

                    <Field.Root invalid={!!errors.feedback}>
                      <Field.Label>
                        Feedback
                        <Text as="span" color="fg.muted" fontWeight="normal">
                          (optional)
                        </Text>
                      </Field.Label>
                      <Textarea rows={3} {...register("feedback")} />
                      <Field.ErrorText>
                        {errors.feedback?.message}
                      </Field.ErrorText>
                    </Field.Root>

                    <Button
                      type="submit"
                      size="sm"
                      loading={isSubmitting}
                      alignSelf="flex-end"
                    >
                      Send
                    </Button>
                  </Stack>
              </form>
            </Popover.Body>
          </Popover.Content>
        </Popover.Positioner>
      </Portal>
    </Popover.Root>
  );
}
