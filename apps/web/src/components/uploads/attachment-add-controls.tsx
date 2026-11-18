"use client";

import { Button, Field, FileUpload, HStack, Input, Stack, Text } from "@chakra-ui/react";
import { Image as ImageIcon } from "lucide-react";
import type { useFileUpload } from "@chakra-ui/react";

type Props = {
  /** An id for the block, for aria-controls. */
  id?: string;
  /** The field's dropzone machine (useAttachmentUploads). */
  fileUpload: ReturnType<typeof useFileUpload>;
  /**
   * The typed link, held by the field rather than here so it survives the
   * controls being hidden and shown again (the field's showAdd).
   */
  urlValue: string;
  onUrlChange: (value: string) => void;
  /** Add link, or Enter in the box, with something typed. */
  onAddLink: () => void;
};

/**
 * The link input and the dropzone of an AttachmentListField: the two ways
 * an attachment is added. Drawn below where the field starts, or wherever
 * the page asked for them (the field's addTarget).
 */
export function AttachmentAddControls({ id, fileUpload, urlValue, onUrlChange, onAddLink }: Props) {
  return (
    <Stack id={id} w="full" gap="3">
      <Field.Root w="full">
        <Field.Label>Link</Field.Label>
        <HStack w="full">
          <Input
            flex="1"
            placeholder="https://…"
            value={urlValue}
            onChange={(event) => onUrlChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                onAddLink();
              }
            }}
          />
          <Button
            type="button"
            aria-disabled={!urlValue.trim()}
            onClick={() => {
              if (urlValue.trim()) onAddLink();
            }}
          >
            Add link
          </Button>
        </HStack>
      </Field.Root>

      <FileUpload.RootProvider value={fileUpload} w="full">
        <FileUpload.HiddenInput />
        {/* 12.8rem is four fifths of the recipe's 2xs (16rem) minimum. */}
        <FileUpload.Dropzone w="full" minH="12.8rem">
          <ImageIcon size={32} />
          <FileUpload.DropzoneContent>
            <Text>Drag images here or click to browse</Text>
          </FileUpload.DropzoneContent>
        </FileUpload.Dropzone>
      </FileUpload.RootProvider>
    </Stack>
  );
}
