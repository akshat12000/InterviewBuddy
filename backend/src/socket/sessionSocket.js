const { v4: uuidv4 } = require('uuid');

const liveRooms = new Map(); // roomId -> { participants: Set<socketId>, users: Map<socketId, {uid, role}> }

function registerSessionHandlers(io, socket) {
  const joinRoom = (roomId) => {
    if (!liveRooms.has(roomId)) {
      liveRooms.set(roomId, { participants: new Set(), users: new Map() });
    }
    const room = liveRooms.get(roomId);
    room.participants.add(socket.id);
    room.users.set(socket.id, { uid: socket.user.uid, role: socket.user.role });
    socket.join(roomId);

  const list = Array.from(room.users.entries()).map(([sid, val]) => ({ socketId: sid, ...val }))
  io.to(roomId).emit('room:participants', list);
  socket.emit('socket:me', { socketId: socket.id })
  };

  socket.on('session:join', ({ roomId }) => {
    joinRoom(roomId);
  });

  socket.on('session:leave', ({ roomId }) => {
    socket.leave(roomId);
    if (liveRooms.has(roomId)) {
      const room = liveRooms.get(roomId);
      room.participants.delete(socket.id);
      room.users.delete(socket.id);
      if (room.participants.size === 0) liveRooms.delete(roomId);
      else {
        const list = Array.from(room.users.entries()).map(([sid, val]) => ({ socketId: sid, ...val }))
        io.to(roomId).emit('room:participants', list);
      }
    }
  });

  // Signaling for WebRTC
  socket.on('webrtc:signal', ({ roomId, to, data }) => {
    if (to) io.to(to).emit('webrtc:signal', { from: socket.id, data });
    else socket.to(roomId).emit('webrtc:signal', { from: socket.id, data });
  });

  // Collaborative code editor events
  socket.on('code:update', ({ roomId, code, language }) => {
    socket.to(roomId).emit('code:update', { code, language });
  });

  // Problem state sync
  socket.on('problem:select', ({ roomId, problemId }) => {
    socket.to(roomId).emit('problem:select', { problemId });
  });

  socket.on('disconnecting', () => {
    for (const roomId of socket.rooms) {
      if (roomId === socket.id) continue;
      if (liveRooms.has(roomId)) {
        const room = liveRooms.get(roomId);
        room.participants.delete(socket.id);
        room.users.delete(socket.id);
        if (room.participants.size === 0) liveRooms.delete(roomId);
        else {
          const list = Array.from(room.users.entries()).map(([sid, val]) => ({ socketId: sid, ...val }))
          io.to(roomId).emit('room:participants', list);
        }
      }
    }
  });
}

module.exports = { registerSessionHandlers };
