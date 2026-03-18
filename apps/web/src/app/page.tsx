"use client";

import { useEffect, useState, useRef } from "react";
import { io, Socket } from "socket.io-client";
import type { ChatMessage, RoomState } from "@storyteller/shared";

import Box from "@mui/material/Box";
import AppBar from "@mui/material/AppBar";
import Toolbar from "@mui/material/Toolbar";
import Typography from "@mui/material/Typography";
import TextField from "@mui/material/TextField";
import IconButton from "@mui/material/IconButton";
import Paper from "@mui/material/Paper";
import Chip from "@mui/material/Chip";
import Stack from "@mui/material/Stack";
import SendIcon from "@mui/icons-material/Send";
import CircleIcon from "@mui/icons-material/Circle";

const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL || "http://localhost:3001";

export default function Home() {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [connected, setConnected] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [users, setUsers] = useState<string[]>([]);
  const [input, setInput] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const s = io(SOCKET_URL, { autoConnect: true });

    s.on("connect", () => setConnected(true));
    s.on("disconnect", () => setConnected(false));

    s.on("chat:message", (msg: ChatMessage) => {
      setMessages((prev) => [...prev, msg]);
    });

    s.on("room:state", (state: RoomState) => {
      setMessages(state.messages);
      setUsers(state.users);
    });

    s.on("room:users", (u: string[]) => setUsers(u));

    setSocket(s);
    return () => { s.disconnect(); };
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendMessage = () => {
    if (!input.trim() || !socket) return;
    socket.emit("chat:message", { text: input });
    setInput("");
  };

  return (
    <Box sx={{ display: "flex", flexDirection: "column", height: "100vh" }}>
      <AppBar position="static" elevation={0}>
        <Toolbar>
          <Typography variant="h6" sx={{ flexGrow: 1 }}>
            Storyteller
          </Typography>
          <Chip
            icon={<CircleIcon sx={{ fontSize: 12 }} />}
            label={connected ? "Connected" : "Disconnected"}
            color={connected ? "success" : "error"}
            size="small"
            variant="outlined"
          />
        </Toolbar>
      </AppBar>

      {/* Users online */}
      {users.length > 0 && (
        <Stack direction="row" spacing={1} sx={{ px: 2, py: 1 }}>
          {users.map((u) => (
            <Chip key={u} label={u.slice(0, 8)} size="small" variant="outlined" />
          ))}
        </Stack>
      )}

      {/* Messages */}
      <Box sx={{ flex: 1, overflow: "auto", px: 2, py: 1 }}>
        {messages.map((msg, i) => (
          <Paper
            key={i}
            variant="outlined"
            sx={{ px: 2, py: 1, mb: 1, maxWidth: "80%" }}
          >
            <Typography variant="caption" color="text.secondary">
              {msg.userId.slice(0, 8)}
            </Typography>
            <Typography variant="body1">{msg.text}</Typography>
          </Paper>
        ))}
        <div ref={messagesEndRef} />
      </Box>

      {/* Input */}
      <Box sx={{ display: "flex", gap: 1, p: 2, borderTop: 1, borderColor: "divider" }}>
        <TextField
          fullWidth
          size="small"
          placeholder="Type a message..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && sendMessage()}
          autoComplete="off"
        />
        <IconButton color="primary" onClick={sendMessage} disabled={!input.trim()}>
          <SendIcon />
        </IconButton>
      </Box>
    </Box>
  );
}
