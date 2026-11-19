import type { BadgeProps } from "@chakra-ui/react";

// What the element panel's two parts share that is not a component: the
// pills that name the parts, and a tag list as one row's value. The scene's
// card (RunSceneSection) and the element's own rows (RunElementDetail)
// spread and call these alike, and the stacks menu writes its tags the
// same way.

/**
 * The SCENE and STORY pills that name the panel's two parts in place of
 * headings: a badge the whole width, its words centred, pulled a little
 * over whatever follows it by its negative margin, so it reads as a
 * divider riding on the part it names. One set of props, spread by both,
 * so the two are styled alike.
 */
export const partBadgeProps = {
  size: "xs",
  variant: "subtle",
  flex: "1",
  justifyContent: "center",
  rounded: "full",
  position: "relative",
  zIndex: "1",
  mb: "-2",
} satisfies BadgeProps;

/** A tag list as one row's value, or null to leave the row out. */
export function tagList(tags: string[]): string | null {
  return tags.length > 0 ? tags.join(", ") : null;
}
