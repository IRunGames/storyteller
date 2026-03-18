import { createServer } from "http";
import { Server } from "socket.io";
import type { ChatMessage, RoomState } from "@storyteller/shared";

const PORT = Number(process.env.PORT) || 3001;

const httpServer = createServer();
const io = new Server(httpServer, {
  cors: {
    origin: process.env.CLIENT_ORIGIN || "http://localhost:3000",
    methods: ["GET", "POST"],
  },
});

// In-memory room state — replace with persistence later if needed
const rooms = new Map<string, RoomState>();

function getOrCreateRoom(roomId: string): RoomState {
  if (!rooms.has(roomId)) {
    rooms.set(roomId, {
      roomId,
      messages: [],
      users: [],
      displayState: {},
    });
  }
  return rooms.get(roomId)!;
}

io.on("connection", (socket) => {
  const roomId = (socket.handshake.query.roomId as string) || "default";
  const userId = (socket.handshake.query.userId as string) || socket.id;

  console.log(`[${roomId}] ${userId} connected`);

  socket.join(roomId);
  const room = getOrCreateRoom(roomId);

  if (!room.users.includes(userId)) {
    room.users.push(userId);
  }

  // Send current state to the newly connected client
  socket.emit("room:state", room);
  io.to(roomId).emit("room:users", room.users);

  // Chat messages
  socket.on("chat:message", (data: { text: string }) => {
    const msg: ChatMessage = {
      userId,
      text: data.text,
      timestamp: Date.now(),
    };
    room.messages.push(msg);
    io.to(roomId).emit("chat:message", msg);
  });

  // Display state sync — any client can update what everyone sees
  socket.on("display:update", (patch: Record<string, unknown>) => {
    Object.assign(room.displayState, patch);
    socket.to(roomId).emit("display:update", room.displayState);
  });

  // Image broadcast — expects a URL/key, not raw bytes
  socket.on("image:share", (data: { url: string; caption?: string }) => {
    io.to(roomId).emit("image:share", { ...data, userId, timestamp: Date.now() });
  });

  socket.on("disconnect", () => {
    console.log(`[${roomId}] ${userId} disconnected`);
    room.users = room.users.filter((u) => u !== userId);
    io.to(roomId).emit("room:users", room.users);
  });
});

httpServer.listen(PORT, () => {
  console.log(`Storyteller socket server listening on :${PORT}`);
});
