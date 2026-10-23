"use client"

import {
  Toaster as ChakraToaster,
  Portal,
  Spinner,
  Stack,
  Toast,
  createToaster,
} from "@chakra-ui/react"

const store = createToaster({
  placement: "bottom-end",
  pauseOnPageIdle: true,
})

// Zag shows a success toast for 2s, too quick to read one that names what
// was saved or deleted, and everything else for 5s. createToaster takes one
// duration for every type, so success gets its 3s here, in create, unless the
// call names a duration of its own. The store's success() helper calls its
// own create and skips this; the app only uses create.
export const toaster: typeof store = {
  ...store,
  create: (data) =>
    store.create({ ...(data.type === "success" && { duration: 3000 }), ...data }),
}

export const Toaster = () => {
  return (
    <Portal>
      <ChakraToaster toaster={toaster} insetInline={{ mdDown: "4" }}>
        {(toast) => (
          <Toast.Root width={{ md: "sm" }}>
            {toast.type === "loading" ? (
              <Spinner size="sm" color="blue.solid" />
            ) : (
              <Toast.Indicator />
            )}
            <Stack gap="1" flex="1" maxWidth="100%">
              {toast.title && <Toast.Title>{toast.title}</Toast.Title>}
              {toast.description && (
                <Toast.Description>{toast.description}</Toast.Description>
              )}
            </Stack>
            {toast.action && (
              <Toast.ActionTrigger>{toast.action.label}</Toast.ActionTrigger>
            )}
            {toast.closable && <Toast.CloseTrigger />}
          </Toast.Root>
        )}
      </ChakraToaster>
    </Portal>
  )
}
