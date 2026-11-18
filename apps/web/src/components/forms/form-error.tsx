import type { ComponentProps } from "react";
import { Alert } from "@chakra-ui/react";

type Props = {
  /** What went wrong; nothing is drawn without it, so a caller passes `errors.root?.message` as it is. */
  message: string | null | undefined;
} & Omit<ComponentProps<typeof Alert.Root>, "status" | "role" | "children">;

/**
 * A form's own error, above its fields: the refusal that has no field to sit
 * on, a load that failed, a delete the server refused. Every form draws it
 * with this so the alerts look alike, and so each carries role="alert",
 * which Chakra's Alert does not set itself and which is what tells a screen
 * reader the message appeared. Field errors stay in `Field.ErrorText`
 * (docs/standards.md, UI).
 */
export function FormError({ message, ...alert }: Props) {
  if (!message) return null;
  return (
    <Alert.Root role="alert" status="error" {...alert}>
      <Alert.Indicator />
      <Alert.Content>
        <Alert.Description>{message}</Alert.Description>
      </Alert.Content>
    </Alert.Root>
  );
}
