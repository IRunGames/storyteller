"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Avatar, Box, HStack, Stack, Text } from "@chakra-ui/react";
import { LocalDate } from "@/components/dates/local-date";
import { useUserPreferences } from "@/components/preferences/user-preferences-provider";
import { PROFILE_PREFERENCE_KEYS, avatarSrc, profileColor, type Profile } from "@/lib/profile";
import {
  profileDetailsSchema,
  profileStatusSchema,
  type ProfileDetails,
} from "@/lib/profile-schemas";
import { sa_updateProfileDetails } from "./actions";
import { ProfileAvatarPopover } from "./profile-avatar-popover";
import { ProfileColorPopover } from "./profile-color-popover";
import { ProfileEditable } from "./profile-editable";

type Props = { profile: Profile };

function SectionLabel({ children }: { children: string }) {
  return (
    <Text textStyle="sm" fontWeight="semibold" color="fg.muted">
      {children}
    </Text>
  );
}

/**
 * The left half of the profile dialog: a banner in the user's colour, their
 * picture with the thought bubble beside it, then their name, email,
 * nickname, bio and the day they joined.
 *
 * The colour, picture and thought are preferences, saved through
 * useUserPreferences(); the name, nickname and bio are columns on s_users,
 * saved together through sa_updateProfileDetails. After those are saved the
 * page is refreshed so the account menu, which reads the user from the
 * layout, shows the new name too.
 */
export function ProfileCard({ profile }: Props) {
  const router = useRouter();
  const preferences = useUserPreferences();
  const [details, setDetails] = useState<ProfileDetails>({
    name: profile.name,
    nickName: profile.nickName ?? "",
    bio: profile.bio ?? "",
  });

  const color = profileColor(preferences.get(PROFILE_PREFERENCE_KEYS.color));
  const picture = avatarSrc(preferences.get(PROFILE_PREFERENCE_KEYS.avatarUrl), profile.image);
  const status = preferences.get(PROFILE_PREFERENCE_KEYS.status);

  // Each field sends all three, so the action checks one whole record.
  async function saveDetails(change: Partial<ProfileDetails>): Promise<string | null> {
    const next = { ...details, ...change };
    const parsed = profileDetailsSchema.safeParse(next);
    if (!parsed.success) return parsed.error.issues[0].message;
    try {
      const result = await sa_updateProfileDetails(parsed.data);
      if (!result.ok) return Object.values(result.errors)[0];
    } catch {
      return "Your profile could not be saved. Try again.";
    }
    setDetails(parsed.data);
    router.refresh();
    return null;
  }

  async function saveStatus(value: string): Promise<string | null> {
    const parsed = profileStatusSchema.safeParse(value);
    if (!parsed.success) return parsed.error.issues[0].message;
    const result = await preferences.set(PROFILE_PREFERENCE_KEYS.status, parsed.data);
    return result.ok ? null : "Your thought could not be saved. Try again.";
  }

  return (
    // No overflow="hidden" to round the banner: the pencils' popovers are not
    // portalled (see profile-avatar-popover.tsx) and would be clipped to the
    // card. The banner rounds its own top corners instead, a pixel tighter
    // than the card's so they sit inside its border.
    <Box rounded="xl" bg="bg.muted" borderWidth="1px">
      <Box h="28" bg={color} position="relative" roundedTop="calc(var(--chakra-radii-xl) - 1px)">
        <Box position="absolute" top="3" right="3">
          <ProfileColorPopover />
        </Box>
      </Box>

      <Stack px="5" pb="6" gap="5">
        <HStack align="flex-start" gap="3" mt="-12">
          <Box position="relative" flexShrink="0">
            <Avatar.Root
              boxSize="24"
              fontSize="2xl"
              borderWidth="6px"
              borderColor="bg.muted"
              bg="bg.emphasized"
            >
              <Avatar.Fallback name={details.name} />
              {picture && <Avatar.Image src={picture} alt="" />}
            </Avatar.Root>
            <Box position="absolute" bottom="1" right="1">
              <ProfileAvatarPopover />
            </Box>
          </Box>
          {/* The thought bubble, sat against the picture as a speech bubble
              is, below the banner so its text reads on the card. */}
          <Box
            mt="14"
            flex="1"
            minW="0"
            bg="bg.emphasized"
            rounded="2xl"
            roundedTopLeft="sm"
            px="3"
            py="2"
          >
            <ProfileEditable
              label="Thoughts"
              placeholder="Thoughts?"
              value={typeof status === "string" ? status : ""}
              onSave={saveStatus}
              fontSize="sm"
            />
          </Box>
        </HStack>

        <Stack gap="1">
          <ProfileEditable
            label="Name"
            placeholder="Your name"
            value={details.name}
            onSave={(name) => saveDetails({ name })}
            fontSize="2xl"
            fontWeight="bold"
          />
          <HStack gap="2" color="fg.muted" textStyle="sm" flexWrap="wrap">
            <Text>{profile.email}</Text>
            <Text aria-hidden>•</Text>
            <Box flex="1" minW="32">
              <ProfileEditable
                label="Nickname"
                placeholder="Add a nickname"
                value={details.nickName}
                onSave={(nickName) => saveDetails({ nickName })}
                fontSize="sm"
              />
            </Box>
          </HStack>
        </Stack>

        <Stack gap="1">
          <SectionLabel>Bio</SectionLabel>
          <ProfileEditable
            label="Bio"
            placeholder="Your vibe — chaotic, calm, or somewhere in between?"
            value={details.bio}
            onSave={(bio) => saveDetails({ bio })}
            multiline
          />
        </Stack>

        <Stack gap="1">
          <SectionLabel>Member Since</SectionLabel>
          <Text>
            <LocalDate value={profile.createdAt} />
          </Text>
        </Stack>
      </Stack>
    </Box>
  );
}
