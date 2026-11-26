// Rooms over WebRTC between the players' browsers. The PeerJS public broker (0.peerjs.com) only
// introduces them to each other; the game itself goes peer to peer. Peer comes from index.html.
const PREFIX = "disc-arena-";
// Whole states go over it, each replacing the last: a lost one need not be sent again.
const OPTIONS = { serialization: "json", reliable: false };
const CODE_LETTERS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export const newRoomCode = () =>
  Array.from({ length: 5 }, () => CODE_LETTERS[Math.floor(Math.random() * CODE_LETTERS.length)]).join("");

export function hostRoom(code, { onOpen, onJoin, onData, onLeave, onError }) {
  const peer = new Peer(PREFIX + code);
  peer.on("open", onOpen);
  peer.on("error", onError);
  peer.on("connection", (conn) => {
    conn.on("open", () => onJoin(conn));
    conn.on("data", (data) => onData(conn, data));
    conn.on("close", () => onLeave(conn));
  });
}

export function joinRoom(code, { onOpen, onData, onClose, onError }) {
  const peer = new Peer();
  peer.on("error", onError);
  peer.on("open", () => {
    const conn = peer.connect(PREFIX + code, OPTIONS);
    conn.on("open", () => onOpen(conn));
    conn.on("data", onData);
    conn.on("close", onClose);
  });
}
