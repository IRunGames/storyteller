"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { Alert, CloseButton, Dialog, Grid, Portal, Skeleton, Stack, Tabs } from "@chakra-ui/react";
import type { Profile } from "@/lib/profile";
import { sa_getProfile } from "./actions";
import { ProfileCard } from "./profile-card";
import { ProfileStoriesTab } from "./profile-stories-tab";
import { ProfileSystemsTab } from "./profile-systems-tab";

type Props = {
  open: boolean;
  onClose: () => void;
};

/**
 * The signed-in user's profile, opened from the account menu: the card on
 * the left and three tabs on the right. The profile is read each time the
 * dialog opens, so it never shows what a previous opening loaded.
 */
export function ProfileDialog({ open, onClose }: Props) {
  return (
    <Dialog.Root
      open={open}
      onOpenChange={(details) => {
        if (!details.open) onClose();
      }}
      size={{ base: "full", md: "xl" }}
      scrollBehavior="inside"
    >
      <Portal>
        <Dialog.Backdrop />
        <Dialog.Positioner>
          <Dialog.Content maxW={{ md: "6xl" }}>
            <Dialog.Header>
              <Dialog.Title>Profile</Dialog.Title>
            </Dialog.Header>
            <Dialog.Body pb="6">{open && <ProfileBody onClose={onClose} />}</Dialog.Body>
            <Dialog.CloseTrigger asChild>
              <CloseButton size="sm" />
            </Dialog.CloseTrigger>
          </Dialog.Content>
        </Dialog.Positioner>
      </Portal>
    </Dialog.Root>
  );
}

// Only drawn while the dialog is open, so each opening loads afresh.
function ProfileBody({ onClose }: { onClose: () => void }) {
  // A story card is a link, and the dialog sits in the header, which stays
  // mounted across pages: following one would leave the dialog open over
  // the story. It closes when the page changes instead. The body mounts as
  // the dialog opens, so the first pathname it sees is the page it opened on.
  const pathname = usePathname();
  const openedOn = useRef(pathname);
  useEffect(() => {
    if (pathname !== openedOn.current) onClose();
  }, [pathname, onClose]);

  const [profile, setProfile] = useState<Profile | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let current = true;
    sa_getProfile()
      .then((loaded) => {
        if (current) setProfile(loaded);
      })
      .catch(() => {
        if (current) setFailed(true);
      });
    return () => {
      current = false;
    };
  }, []);

  if (failed) {
    return (
      <Alert.Root role="alert" status="error">
        <Alert.Indicator />
        <Alert.Title>Your profile could not be loaded. Close it and try again.</Alert.Title>
      </Alert.Root>
    );
  }

  if (profile === null) {
    return (
      <Grid templateColumns={{ base: "1fr", md: "minmax(0, 24rem) 1fr" }} gap="8">
        <Skeleton h="md" rounded="xl" />
        <Stack gap="4">
          <Skeleton h="10" />
          <Skeleton h="40" rounded="xl" />
        </Stack>
      </Grid>
    );
  }

  return (
    <Grid templateColumns={{ base: "1fr", md: "minmax(0, 24rem) 1fr" }} gap="8" alignItems="start">
      <ProfileCard profile={profile} />
      <Tabs.Root defaultValue="systems" variant="line" lazyMount>
        <Tabs.List>
          <Tabs.Trigger value="systems">Systems</Tabs.Trigger>
          <Tabs.Trigger value="mine">My Stories</Tabs.Trigger>
          <Tabs.Trigger value="playing">Playing</Tabs.Trigger>
        </Tabs.List>
        <Tabs.Content value="systems">
          <ProfileSystemsTab initialSystems={profile.systems} />
        </Tabs.Content>
        <Tabs.Content value="mine">
          <ProfileStoriesTab list="owned" emptyText="You are not telling any stories yet." />
        </Tabs.Content>
        <Tabs.Content value="playing">
          <ProfileStoriesTab list="playing" emptyText="You are not playing in any stories yet." />
        </Tabs.Content>
      </Tabs.Root>
    </Grid>
  );
}
