// A stand-in for the table's play space, for a component test that renders
// a pill, a panel or the library on its own: every change is a mock to
// assert on, and the list holds what the test gives it. Mounted through
// SceneItemsProvider (components/table-shell/scene-items-context.tsx).
import { mock, type Mock } from "node:test";
import type { SceneItem } from "@/lib/scene-elements";
import type { SceneItems } from "@/components/table-shell/use-scene-items";

type Fns = Omit<SceneItems, "items">;
export type SceneItemsStub = { items: SceneItem[] } & {
  [K in keyof Fns]: Mock<Fns[K]>;
};

export function sceneItemsStub(items: SceneItem[] = []): SceneItemsStub {
  return {
    items,
    load: mock.fn<SceneItems["load"]>(),
    put: mock.fn<SceneItems["put"]>(),
    remove: mock.fn<SceneItems["remove"]>(),
    removeLink: mock.fn<SceneItems["removeLink"]>(),
    replace: mock.fn<SceneItems["replace"]>(),
    setImage: mock.fn<SceneItems["setImage"]>(),
    editElement: mock.fn<SceneItems["editElement"]>(),
    setStatus: mock.fn<SceneItems["setStatus"]>(),
    patchLink: mock.fn<SceneItems["patchLink"]>(),
    renameTags: mock.fn<SceneItems["renameTags"]>(),
  };
}

/** Forgets every call, for a beforeEach. */
export function resetSceneItemsStub(stub: SceneItemsStub) {
  for (const [key, value] of Object.entries(stub)) {
    if (key !== "items") (value as Mock<() => void>).mock.resetCalls();
  }
}
