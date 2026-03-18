// ---- Chat ----
export interface ChatMessage {
  userId: string;
  text: string;
  timestamp: number;
}

// ---- Room ----
export interface RoomState {
  roomId: string;
  messages: ChatMessage[];
  users: string[];
  displayState: Record<string, unknown>;
}

// ---- Images ----
export interface SharedImage {
  url: string;
  caption?: string;
  userId: string;
  timestamp: number;
}

// ---- Socket Events (for type-safe event maps later) ----
export interface ServerToClientEvents {
  "chat:message": (msg: ChatMessage) => void;
  "room:state": (state: RoomState) => void;
  "room:users": (users: string[]) => void;
  "display:update": (state: Record<string, unknown>) => void;
  "image:share": (data: SharedImage) => void;
}

export interface ClientToServerEvents {
  "chat:message": (data: { text: string }) => void;
  "display:update": (patch: Record<string, unknown>) => void;
  "image:share": (data: { url: string; caption?: string }) => void;
}
