const { v4: uuidv4 } = require('uuid');
const User = require('../models/User');

const liveRooms = new Map(); // roomId -> { participants: Set<socketId>, users: Map<socketId, {uid, role}> }

function registerSessionHandlers(io, socket) {
  const joinRoom = async (roomId) => {
    if (!liveRooms.has(roomId)) {
      liveRooms.set(roomId, { participants: new Set(), users: new Map() });
    }
    const room = liveRooms.get(roomId);
    room.participants.add(socket.id);
    // Fetch display name once per join
    let name = 'User';
    try {
      const u = await User.findById(socket.user.uid).select('name');
      if (u?.name) name = u.name;
    } catch {}
    room.users.set(socket.id, { uid: socket.user.uid, role: socket.user.role, name });
    socket.join(roomId);

  const list = Array.from(room.users.entries()).map(([sid, val]) => ({ socketId: sid, ...val }))
  io.to(roomId).emit('room:participants', list);
  socket.emit('socket:me', { socketId: socket.id })
  };

  socket.on('session:join', async ({ roomId }) => {
    await joinRoom(roomId);
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

  // Simple chat relay
  socket.on('chat:message', ({ roomId, text }) => {
    const from = socket.user?.uid || 'unknown'
    let fromName = 'User'
    try {
      const room = liveRooms.get(roomId)
      const info = room?.users?.get(socket.id)
      if (info?.name) fromName = info.name
    } catch {}
    io.to(roomId).emit('chat:message', { from, fromName, text, at: Date.now() })
  });

  // End call sync across room
  socket.on('call:end', ({ roomId }) => {
    socket.to(roomId).emit('call:end');
  });

  // Media state sync (mic/cam on/off)
  socket.on('media:state', ({ roomId, micOn, camOn }) => {
    try {
      socket.to(roomId).emit('media:state', { from: socket.id, micOn, camOn })
    } catch {}
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
