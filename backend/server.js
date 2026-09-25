const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors());

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: "*", 
    methods: ["GET", "POST"]
  }
});

const rooms = {};

app.get('/api/lyrics', async (req, res) => {
  try {
    const q = req.query.q;
    if (!q) return res.status(400).json({ error: 'Missing query parameter q' });
    
    // Dynamic import for node-fetch since it's an ES module in newer versions, or use native fetch if Node 18+
    // Node 18+ has native fetch. Let's assume Node 18+ for this project.
    const response = await fetch(`https://lrclib.net/api/search?q=${encodeURIComponent(q)}`, {
      headers: {
        'User-Agent': 'SpaceMusicApp/1.0.0 (https://github.com/SpaceMusic)'
      }
    });
    
    if (!response.ok) {
      throw new Error(`LRCLIB returned ${response.status}`);
    }
    
    const data = await response.json();
    res.json(data);
  } catch (err) {
    console.error('Lyrics fetch error:', err);
    res.status(500).json({ error: err.message });
  }
});

io.on('connection', (socket) => {
  console.log(`User connected: ${socket.id}`);

  socket.on('join_room', ({ roomId, username }) => {
    socket.join(roomId);
    
    if (!rooms[roomId]) {
      rooms[roomId] = {
        currentSong: null,
        songDetails: null,
        isPlaying: false,
        timestamp: 0,
        users: [],
        queue: [] 
      };
    }
    
    rooms[roomId].users.push({ id: socket.id, username });
    
    // Send current room state to the newly joined user
    socket.emit('room_state', rooms[roomId]);
    socket.to(roomId).emit('user_joined', { users: rooms[roomId].users });
  });

  // Adding multiple songs to the queue at once (for auto-populating)
  socket.on('append_multiple_to_queue', ({ roomId, items }) => {
    if (rooms[roomId]) {
      rooms[roomId].queue.push(...items);
      io.to(roomId).emit('queue_update', rooms[roomId].queue);
    }
  });

  // Adding a single song to the queue
  socket.on('add_to_queue', ({ roomId, item }) => {
    if (rooms[roomId]) {
      // If nothing is playing currently, start playing this song immediately
      if (!rooms[roomId].currentSong) {
        rooms[roomId].currentSong = item.videoId;
        rooms[roomId].songDetails = item;
        rooms[roomId].isPlaying = true;
        rooms[roomId].timestamp = 0;
        io.to(roomId).emit('play_new_song', { videoId: item.videoId, details: item, timestamp: 0 });
      } else {
        // Add to queue
        rooms[roomId].queue.push(item);
        io.to(roomId).emit('queue_update', rooms[roomId].queue);
      }
    }
  });

  socket.on('play_now', ({ roomId, item }) => {
    if (rooms[roomId]) {
      rooms[roomId].currentSong = item.videoId;
      rooms[roomId].songDetails = item;
      rooms[roomId].isPlaying = true;
      rooms[roomId].timestamp = 0;
      io.to(roomId).emit('play_new_song', { videoId: item.videoId, details: item, timestamp: 0 });
    }
  });

  // When a song naturally ends
  socket.on('song_ended', ({ roomId, lastVideoId }) => {
    if (rooms[roomId] && rooms[roomId].currentSong === lastVideoId) {
      if (rooms[roomId].queue.length > 0) {
        // Play next song in queue
        const nextItem = rooms[roomId].queue.shift();
        rooms[roomId].currentSong = nextItem.videoId;
        rooms[roomId].songDetails = nextItem;
        rooms[roomId].isPlaying = true;
        rooms[roomId].timestamp = 0;
        
        io.to(roomId).emit('play_new_song', { videoId: nextItem.videoId, details: nextItem, timestamp: 0 });
        io.to(roomId).emit('queue_update', rooms[roomId].queue);
      } else {
        // Queue is empty, stop playing and send last details for auto-recommendation
        const lastDetails = rooms[roomId].songDetails;
        rooms[roomId].currentSong = null;
        rooms[roomId].songDetails = null;
        rooms[roomId].isPlaying = false;
        rooms[roomId].timestamp = 0;
        io.to(roomId).emit('stop_song', { lastDetails });
      }
    }
  });

  // Play a specific item from the queue
  socket.on('play_queue_item', ({ roomId, index }) => {
    if (rooms[roomId] && rooms[roomId].queue[index]) {
      const itemToPlay = rooms[roomId].queue.splice(index, 1)[0];
      rooms[roomId].currentSong = itemToPlay.videoId;
      rooms[roomId].songDetails = itemToPlay;
      rooms[roomId].isPlaying = true;
      rooms[roomId].timestamp = 0;
      
      io.to(roomId).emit('play_new_song', { videoId: itemToPlay.videoId, details: itemToPlay, timestamp: 0 });
      io.to(roomId).emit('queue_update', rooms[roomId].queue);
    }
  });

  // Sync controls (Play/Pause for the SAME song)
  socket.on('sync_play', ({ roomId, timestamp }) => {
    if (rooms[roomId]) {
      rooms[roomId].isPlaying = true;
      rooms[roomId].timestamp = timestamp;
      socket.to(roomId).emit('sync_play', { timestamp });
    }
  });

  socket.on('sync_pause', ({ roomId, timestamp }) => {
    if (rooms[roomId]) {
      rooms[roomId].isPlaying = false;
      rooms[roomId].timestamp = timestamp;
      socket.to(roomId).emit('sync_pause', { timestamp });
    }
  });

  socket.on('disconnect', () => {
    console.log(`User disconnected: ${socket.id}`);
    for (const roomId in rooms) {
      const room = rooms[roomId];
      const userIndex = room.users.findIndex(u => u.id === socket.id);
      if (userIndex !== -1) {
        room.users.splice(userIndex, 1);
        socket.to(roomId).emit('user_left', { users: room.users });
        if (room.users.length === 0) {
          delete rooms[roomId];
        }
      }
    }
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
