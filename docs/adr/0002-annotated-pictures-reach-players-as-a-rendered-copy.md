# ADR 0002: Annotated pictures reach the players as a copy the server renders

Date: 2026-11-19. Status: accepted.

## Context

The storyteller can draw fog of war and pen marks over one of the story's
pictures, to show the players a map with only the parts they have reached,
wherever an element shows it.
Pictures live in a public Vercel Blob store, and the players' table is
given each element's picture as its address. Drawing the fog over the
picture in the players' browser would hand them that address, and the raw
picture with it, to anyone who opened the page's source or network panel;
it would also hand them the pen marks still under the fog, and the
realtime broker's shared player login can read every story's topic.

## Decision

- The drawing belongs to the file (`attachment_annotations`, one row per
  attachment), not to an element: every element that shows the file, as its
  own picture or as its picture in one scene, shows the players the same
  drawing, and a change of what an element shows never strands a drawing.
- While a picture is annotated, the server renders a **players' copy**:
  the picture, the pen marks, then the fog at the players' opacity, as WebP
  with sharp, from the same SVG tree the storyteller's annotator draws
  (`lib/annotation-drawing.ts`). It is uploaded to Blob under
  `annotations/<idAttachment>/` with a random suffix, and
  `attachment_annotations.player_url` points at it.
- Every read of an element's picture a player can reach goes through one
  SQL helper, `playerSceneElementImageUrl` (`db/scene-items.ts`'s
  `sceneLink` and `sceneItems`): the pill's file, the link's cover else the
  element's, yields the players' copy while it is annotated, or nothing
  until the first one is rendered, never the raw picture. The storyteller's
  own reads keep the raw picture.
- Each save of the drawing asks for a render after the answer has gone
  (`after()`). One render at a time holds the drawing's claim
  (`render_token`, a minute before it counts as abandoned) and keeps
  rendering until the copy has caught up, so a quick run of strokes is a
  few renders, not one each. A copy that is replaced, or whose drawing is
  deleted, is deleted from Blob after the players have been pointed away
  from it; the daily blob sweep keeps every copy a drawing points at. Each
  new copy is sent to every link of the scene being played that shows the
  file (`publishPictureChanged`).
- Only an uploaded picture can be annotated: the server never fetches an
  address a user typed.

## Consequences

- The players' view lags the storyteller's by a render, a second or two.
- Rendering and Blob writes cost a little per save; the claim keeps it to
  one render in flight per drawing.
- The raw picture still reaches players where the same file is shown
  elsewhere than as an element's picture (a scene's, a session's or the
  story's cover, a scene's or a link's other pictures), and through any
  cache from before it was annotated. The glossary's Players' copy entry
  says so.
- One drawing per file: two elements that show the same map show the
  players the same fog. A storyteller who wants them to differ uploads the
  map twice.
