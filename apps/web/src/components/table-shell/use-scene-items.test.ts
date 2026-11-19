import { describe, it } from "node:test";
import { expect } from "expect";
import { act, renderHook } from "@testing-library/react";
import type { ElementDetail } from "@/lib/run";
import type { SceneItem } from "@/lib/scene-elements";
import { useSceneItems } from "./use-scene-items";

const dafydd: SceneItem = {
  key: "PERSON:5:9",
  kind: "PERSON",
  label: "Dafydd",
  detail: "Shell seller",
  imageUrl: null,
  idSceneElement: 9,
  sceneStatus: "READY",
  sceneTags: ["scene"],
  showInfo: true,
  fields: { initial_name: null, name: "Dafydd", title: "Shell seller", label: null },
  showing: "name",
};
// Dafydd in the scene a second time, with his own link.
const dafyddAgain: SceneItem = {
  ...dafydd,
  key: "PERSON:5:12",
  idSceneElement: 12,
  label: "Dafydd 2",
};
const lantern: SceneItem = {
  key: "THING:6:10",
  kind: "THING",
  label: "Lantern",
  detail: null,
  imageUrl: null,
  idSceneElement: 10,
  sceneStatus: "READY",
  sceneTags: ["scene"],
};

describe("useSceneItems", () => {
  it("puts an item in once, however often it is put", () => {
    const { result } = renderHook(() => useSceneItems([]));
    act(() => {
      result.current.put(dafydd);
      result.current.put(dafydd);
      result.current.put(lantern);
    });
    expect(result.current.items.map((item) => item.key)).toEqual(["PERSON:5:9", "THING:6:10"]);
  });

  it("takes an item off by key and a link off by its id, leaving the element's other pill", () => {
    const { result } = renderHook(() => useSceneItems([dafydd, dafyddAgain, lantern]));
    act(() => result.current.remove("THING:6:10"));
    expect(result.current.items.map((item) => item.key)).toEqual(["PERSON:5:9", "PERSON:5:12"]);
    act(() => result.current.removeLink(9));
    expect(result.current.items.map((item) => item.key)).toEqual(["PERSON:5:12"]);
  });

  it("replaces every pill of the element, and sets a picture on each", () => {
    const { result } = renderHook(() => useSceneItems([dafydd, lantern]));
    act(() => result.current.replace({ ...dafydd, label: "Dai" }));
    expect(result.current.items[0].label).toBe("Dai");
    act(() => result.current.setImage(5, "https://x.test/dai.png"));
    expect(result.current.items[0].imageUrl).toBe("https://x.test/dai.png");
    expect(result.current.items[1].imageUrl).toBeNull();
  });

  it("marks the element's pills annotated with its picture, and takes the mark off again", () => {
    const { result } = renderHook(() => useSceneItems([dafydd, lantern]));
    act(() => result.current.setImage(5, "https://x.test/dai.png", true));
    expect(result.current.items[0]).toMatchObject({
      imageUrl: "https://x.test/dai.png",
      annotated: true,
    });
    expect(result.current.items[1].annotated).toBeUndefined();
    act(() => result.current.setImage(5, "https://x.test/dai.png"));
    expect(result.current.items[0].annotated).toBeUndefined();
  });

  it("moves an edited element under its new kind's key and keeps what the pill was showing", () => {
    const { result } = renderHook(() => useSceneItems([dafydd]));
    const edited: ElementDetail = {
      idElement: 5,
      kind: "CREATURE",
      name: "Dafydd the Shell",
      initialName: "A hooded figure",
      title: "Shell seller",
      description: null,
      notes: null,
      imageUrl: null,
      status: "READY",
      tags: [],
      url: null,
      urlText: null,
    };
    act(() => result.current.editElement(edited));
    const [item] = result.current.items;
    expect(item.key).toBe("CREATURE:5:9");
    expect(item.kind).toBe("CREATURE");
    expect(item.label).toBe("Dafydd the Shell");
    expect(item.showing).toBe("name");
  });

  it("sets a status by key and patches a link by its id alone", () => {
    const { result } = renderHook(() => useSceneItems([dafydd, dafyddAgain]));
    act(() => result.current.setStatus("PERSON:5:9", "TAPPED"));
    expect(result.current.items.map((item) => item.sceneStatus)).toEqual(["TAPPED", "READY"]);
    act(() => result.current.patchLink(12, { showInfo: false, sceneStatus: "INVISIBLE" }));
    expect(result.current.items[0].showInfo).toBe(true);
    expect(result.current.items[1]).toMatchObject({ showInfo: false, sceneStatus: "INVISIBLE" });
  });

  it("renames the stacks the pills are filed under, and loads a space afresh", () => {
    const { result } = renderHook(() => useSceneItems([dafydd, lantern]));
    act(() => result.current.renameTags((tag) => (tag === "scene" ? "the docks" : tag)));
    expect(result.current.items.every((item) => item.sceneTags?.[0] === "the docks")).toBe(true);
    act(() => result.current.load([lantern]));
    expect(result.current.items).toEqual([lantern]);
  });

  it("keeps each function's identity across renders", () => {
    const { result } = renderHook(() => useSceneItems([]));
    const before = result.current;
    act(() => result.current.put(lantern));
    expect(result.current.setStatus).toBe(before.setStatus);
    expect(result.current.put).toBe(before.put);
    expect(result.current.items).not.toBe(before.items);
  });
});
