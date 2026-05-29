import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import 'dotenv/config';

const app = express().use(cors());
const server = createServer(app);
const io = new Server(server, { cors: { origin: '*' } });
const sockets = { host: null, client: null };
let pendingOffer = null;

app.get('/health', (req, res) => {
  res.json({ status: 'ok', host: !!sockets.host, client: !!sockets.client });
});

io.on('connection', (socket) => {
  socket.on('join', ({ role }) => {
    if ((role === 'host' || role === 'client') && !sockets[role]) {
      sockets[role] = socket;
      socket.role = role;
      console.log(`[${role} connected]`);
      if (role === 'host' && pendingOffer) {
        socket.emit('offer', pendingOffer);
        pendingOffer = null;
        console.log('[queued offer flushed to host]');
      }
    }
  });
  socket.on('offer', (data) => {
    if (sockets.host) {
      sockets.host.emit('offer', data);
      console.log('[offer relayed]');
    } else {
      pendingOffer = data;
      console.log('[offer queued — host not connected]');
    }
  });
  socket.on('answer', (data) => {
    if (sockets.client) {
      sockets.client.emit('answer', data);
      console.log('[answer relayed]');
    }
  });
  socket.on('ice-candidate', (data) => {
    const target = socket.role === 'host' ? 'client' : 'host';
    if (sockets[target]) {
      sockets[target].emit('ice-candidate', data);
      console.log('[ice-candidate relayed]');
    }
  });
  socket.on('disconnect', () => {
    if (socket.role) {
      console.log(`[${socket.role} disconnected]`);
      if (socket.role === 'host') pendingOffer = null;
      sockets[socket.role] = null;
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`[server listening on port ${PORT}]`));
