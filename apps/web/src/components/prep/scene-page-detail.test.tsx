import { before, describe, it, mock } from "node:test";
import { expect } from "expect";
import { screen } from "@testing-library/react";

import { renderWithProviders } from "@/test/render";
import type { StorySceneDetail } from "@/lib/scenes";
import type { StatusOption } from "@/lib/status";

// An invented workflow, as in status-pill.test.tsx.
const options: StatusOption[] = [
  { key: "FIRST", label: "First", description: null, from: ["SECOND"] },
  { key: "SECOND", label: "Second", description: null, from: ["FIRST"] },
];

const detail: StorySceneDetail = {
  idStoryScene: -15,
  idStory: -4,
  idStorySession: -3,
  status: "SECOND",
  statusAt: new Date("2026-09-12T18:00:00Z"),
  sceneNumber: 1,
  length: 45,
  title: "Strangers in the morning",
  description: "A marked wizard and his man.",
  imageLink: null,
  sessionNumber: 3,
  sessionHeading: "3. Kildealg",
  startedAt: new Date("2026-09-12T12:00:00Z"),
  isStoryteller: true,
};

let ScenePageDetail: typeof import("./scene-page-detail").ScenePageDetail;

describe("ScenePageDetail", () => {
  before(async () => {
    mock.module("@/app/(app)/(nav)/libraries/actions", {
      namedExports: { sa_getStoryScene: async () => detail, sa_listStoryScenes: async () => [] },
    });
    mock.module("@/components/status/actions", {
      namedExports: {
        sa_setRowStatus: async (_table: string, _id: number, status: string) => ({
          ok: true,
          status,
        }),
        sa_listStatusOptions: async () => options,
      },
    });
    mock.module("@/components/uploads/actions", {
      namedExports: {
        sa_listAttachments: async () => [],
        sa_moveStoryAttachmentsToScene: async () => ({ ok: true }),
        sa_searchAttachments: async () => [],
      },
    });
    ({ ScenePageDetail } = await import("./scene-page-detail"));
  });

  it("gives the storyteller the status menu and the attachment picker", () => {
    renderWithProviders(<ScenePageDetail initial={detail} statusOptions={options} />);

    expect(screen.getByRole("heading", { name: detail.title })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Second" })).toBeInTheDocument();
    expect(screen.getByText("Add from the story's attachments")).toBeInTheDocument();
  });

  it("shows a player the scene with neither", () => {
    renderWithProviders(
      <ScenePageDetail initial={{ ...detail, isStoryteller: false }} statusOptions={options} />,
    );

    expect(screen.getByRole("heading", { name: detail.title })).toBeInTheDocument();
    expect(screen.getByText("Second")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Second" })).not.toBeInTheDocument();
    expect(screen.queryByText("Add from the story's attachments")).not.toBeInTheDocument();
  });
});
