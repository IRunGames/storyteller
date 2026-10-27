"use client";

import { useId, useState } from "react";
import {
  Alert,
  Button,
  Field,
  FileUpload,
  HStack,
  IconButton,
  Input,
  Popover,
  Portal,
  Separator,
  Spinner,
  Stack,
  Text,
  Tooltip,
  useFileUpload,
} from "@chakra-ui/react";
import { upload } from "@vercel/blob/client";
import { Image as ImageIcon, Pencil } from "lucide-react";
import { useUser } from "@/components/auth/user-provider";
import { useUserPreferences } from "@/components/preferences/user-preferences-provider";
import { ALLOWED_IMAGE_TYPES, MAX_AVATAR_BYTES, avatarPrefix } from "@/lib/image-uploads";
import { PROFILE_PREFERENCE_KEYS } from "@/lib/profile";
import { avatarUrlSchema } from "@/lib/profile-schemas";
import { loadsAsImage } from "./load-image";

function rejectionMessage(errors: string[]): string {
  if (errors.includes("FILE_INVALID_TYPE")) return "Pick a PNG, JPEG, WebP or GIF image.";
  if (errors.includes("FILE_TOO_LARGE")) return "That picture is larger than 2 MB.";
  return "That file could not be used.";
}

/**
 * The pencil on the profile picture and the popover it opens: upload a
 * picture, link one from elsewhere, or remove the one set so the avatar goes
 * back to the sign-in picture or the initials. Whichever it is, the address
 * is saved under the profile.avatarUrl preference; an upload goes to Vercel
 * Blob first, under the user's avatar folder, where the upload route holds it
 * to 2 MB just as the picker here does.
 */
export function ProfileAvatarPopover() {
  const user = useUser();
  const preferences = useUserPreferences();
  const stored = preferences.get(PROFILE_PREFERENCE_KEYS.avatarUrl);
  const hasPicture = typeof stored === "string" && stored !== "";

  const [open, setOpen] = useState(false);
  const [link, setLink] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"upload" | "link" | null>(null);
  const triggerId = useId();

  function close() {
    setOpen(false);
    setLink("");
    setError(null);
  }

  async function save(url: string | null): Promise<boolean> {
    const result = await preferences.set(PROFILE_PREFERENCE_KEYS.avatarUrl, url);
    if (result.ok) return true;
    setError("Your picture could not be saved. Try again.");
    return false;
  }

  async function uploadFile(file: File) {
    setBusy("upload");
    setError(null);
    try {
      const blob = await upload(`${avatarPrefix(user.id)}${file.name}`, file, {
        access: "public",
        handleUploadUrl: "/api/blob/upload",
      });
      if (await save(blob.url)) close();
    } catch {
      setError("The picture could not be uploaded. Try again.");
    } finally {
      setBusy(null);
    }
  }

  const fileUpload = useFileUpload({
    accept: [...ALLOWED_IMAGE_TYPES],
    maxFileSize: MAX_AVATAR_BYTES,
    maxFiles: 1,
    disabled: busy === "upload",
    onFileAccept: (details) => {
      const [file] = details.files;
      if (file) void uploadFile(file);
      // Cleared at once so picking the same file again still fires.
      fileUpload.clearFiles();
    },
    onFileReject: (details) => setError(rejectionMessage(details.files[0]?.errors ?? [])),
  });

  async function applyLink() {
    const parsed = avatarUrlSchema.safeParse(link);
    if (!parsed.success) {
      setError(parsed.error.issues[0].message);
      return;
    }
    setBusy("link");
    setError(null);
    try {
      if (!(await loadsAsImage(parsed.data))) {
        setError("That link does not open as a picture.");
        return;
      }
      if (await save(parsed.data)) close();
    } finally {
      setBusy(null);
    }
  }

  async function remove() {
    if (await save(null)) close();
  }

  return (
    <Popover.Root
      open={open}
      onOpenChange={(details) => (details.open ? setOpen(true) : close())}
      positioning={{ placement: "bottom-start" }}
      ids={{ trigger: triggerId }}
    >
      <Tooltip.Root openDelay={200} positioning={{ placement: "top" }} ids={{ trigger: triggerId }}>
        <Tooltip.Trigger asChild>
          <Popover.Trigger asChild>
            <IconButton
              aria-label="Change profile picture"
              size="xs"
              rounded="full"
              variant="subtle"
            >
              <Pencil />
            </IconButton>
          </Popover.Trigger>
        </Tooltip.Trigger>
        <Portal>
          <Tooltip.Positioner>
            <Tooltip.Content>Change profile picture</Tooltip.Content>
          </Tooltip.Positioner>
        </Portal>
      </Tooltip.Root>
      {/* Not portalled, unlike the standards' other floating layers: it
          opens inside the profile dialog, which hides everything outside
          itself from assistive technology and traps focus within, so a
          portalled popover could be neither read nor typed into. */}
      <Popover.Positioner>
        <Popover.Content w="xs">
          <Popover.Arrow />
          <Popover.Header fontWeight="semibold">
            <Popover.Title>Profile picture</Popover.Title>
          </Popover.Header>
          <Popover.Body pt="0">
            <Stack gap="4">
              {error && (
                // role="alert", which Chakra's Alert does not set itself, so
                // the failure is announced where the user's focus is.
                <Alert.Root role="alert" status="error" size="sm">
                  <Alert.Indicator />
                  <Alert.Content>
                    <Alert.Description>{error}</Alert.Description>
                  </Alert.Content>
                </Alert.Root>
              )}

              <FileUpload.RootProvider value={fileUpload}>
                <FileUpload.HiddenInput />
                {/* The drop zone the other image fields use
                    (attachment-list-field.tsx), shorter to suit the popover. */}
                <FileUpload.Dropzone w="full" minH="10rem">
                  {busy === "upload" ? <Spinner size="lg" /> : <ImageIcon size={32} />}
                  <FileUpload.DropzoneContent>
                    <Text>
                      {busy === "upload" ? "Uploading…" : "Drag a picture here or click to browse"}
                    </Text>
                  </FileUpload.DropzoneContent>
                </FileUpload.Dropzone>
              </FileUpload.RootProvider>

              <Separator />

              <form
                noValidate
                onSubmit={(event) => {
                  event.preventDefault();
                  void applyLink();
                }}
              >
                <Field.Root>
                  <Field.Label>Or link one</Field.Label>
                  <HStack gap="2" w="full">
                    <Input
                      size="sm"
                      type="url"
                      placeholder="https://"
                      value={link}
                      onChange={(event) => setLink(event.target.value)}
                    />
                    <Button type="submit" size="sm" loading={busy === "link"}>
                      Use link
                    </Button>
                  </HStack>
                  <Field.HelperText>PNG, JPEG, WebP or GIF, up to 2 MB.</Field.HelperText>
                </Field.Root>
              </form>

              {hasPicture && (
                <Button variant="ghost" size="sm" colorPalette="red" onClick={() => void remove()}>
                  Remove picture
                </Button>
              )}
            </Stack>
          </Popover.Body>
        </Popover.Content>
      </Popover.Positioner>
    </Popover.Root>
  );
}
