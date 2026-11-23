"use client";

import { createContext } from "react";

/**
 * True for the controls drawn at the start of a full-size picture preview's
 * bottom bar (AttachmentPreviewDialog's actions), so the annotation controls
 * there draw their fog switch as a pill that says whether fog is on, rather
 * than the bare cloud they show beside a card. False everywhere else.
 */
export const PreviewBarContext = createContext(false);
