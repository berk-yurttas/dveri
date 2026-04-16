// backend/index.js
const express = require('express');
const dotenv = require('dotenv');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const { Server } = require('socket.io');
const { connectDB } = require('./config/db');
const http = require('http');
const seedCards = require('./config/seedCards');
const cardsRepository = require('./repositories/cardsRepository');

dotenv.config();

const app = express();
app.use(express.json());
app.use(cors());

const cardImagesCandidates = [
  process.env.CARD_IMAGES_DIR,
  path.join(__dirname, '..', 'card_images'),
  path.join(__dirname, 'card_images'),
].filter(Boolean);
const cardImagesDir = cardImagesCandidates.find((dir) => fs.existsSync(dir));
if (cardImagesDir) {
  app.use('/card-images', express.static(cardImagesDir));
  console.log(`Serving card images from: ${cardImagesDir}`);
} else {
  console.warn('Card images directory not found. /card-images route is disabled.');
}

const musicCandidates = [
  process.env.MUSIC_DIR,
  path.join(__dirname, '..', 'music'),
  path.join(__dirname, 'music'),
].filter(Boolean);
const musicDir = musicCandidates.find((dir) => fs.existsSync(dir));
if (musicDir) {
  app.use('/music', express.static(musicDir));
  console.log(`Serving music files from: ${musicDir}`);
} else {
  console.warn('Music directory not found. /music route is disabled.');
}

app.use('/api/auth', require('./routes/auth'));
app.use('/api/game', require('./routes/game'));
app.use('/api/onevone', require('./routes/onevone'));
app.use('/api/admin', require('./routes/admin'));

const allowedOrigins = [
  'http://localhost:3000',
  'http://localhost:3001',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:3001',
  'https://hilarious-kelpie-0811c0.netlify.app',
];

const NUM_OF_CARDS = 6;
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
    methods: ['GET', 'POST'],
  },
});

app.set('io', io);

const rooms = {};
app.locals.rooms = rooms;
app.locals.io = io;

io.on('connection', (socket) => {
  console.log(`Yeni socket bağlantısı: ${socket.id}`);

  const removePlayerFromRooms = (playerSocketId, options = {}) => {
    const { explicitRoomId = null, notifyOpponent = false } = options;

    for (const roomId in rooms) {
      if (explicitRoomId && roomId !== explicitRoomId) {
        continue;
      }

      const room = rooms[roomId];
      const wasInRoom = room.players.some((player) => player.id === playerSocketId);
      if (!wasInRoom) {
        continue;
      }

      const wasPlayingWithTwoPlayers = room.status === 'playing' && room.players.length === 2;
      room.players = room.players.filter((player) => player.id !== playerSocketId);

      if (notifyOpponent && wasPlayingWithTwoPlayers && room.players.length === 1) {
        io.to(room.players[0].id).emit('opponentLeft', {
          message: 'Rakip oyunu terk etti. Kazandınız!',
        });
      }

      // Oyun odasında bir kişi kaldıysa oda artık geçersiz, temizle.
      if (room.players.length === 0 || (wasPlayingWithTwoPlayers && room.players.length === 1)) {
        delete rooms[roomId];
      }

      if (explicitRoomId) {
        break;
      }
    }

    io.emit('roomsList', Object.values(rooms).filter((room) => room.status === 'waiting'));
  };

  socket.on('createRoom', async (userData) => {
    const roomId = `room-${socket.id}-${Date.now()}`;
    try {
      const allCards = await cardsRepository.findAll();
      if (allCards.length < NUM_OF_CARDS) {
        socket.emit('error', { message: 'Yeterli kart bulunamadı.' });
        return;
      }
      const shuffled = allCards.sort(() => Math.random() - 0.5);
      const deck = shuffled.slice(0, NUM_OF_CARDS).map((card) => ({ ...card }));
      rooms[roomId] = {
        id: roomId,
        players: [{ id: socket.id, username: userData.username }],
        status: 'waiting',
        decks: { [socket.id]: deck },
        currentRound: 1,
      };
      socket.join(roomId);
      socket.emit('roomCreated', { roomId, room: rooms[roomId], message: 'Oda oluşturuldu, rakip bekleniyor.' });
      io.emit('roomsList', Object.values(rooms).filter((room) => room.status === 'waiting'));
      console.log(`Oda oluşturuldu: ${roomId} - ${userData.username}`);
    } catch (err) {
      console.error(err);
      socket.emit('error', { message: 'Kartlar alınırken hata oluştu.' });
    }
  });

  socket.on('joinRoom', async (data) => {
    const { roomId, username } = data;
    if (rooms[roomId] && rooms[roomId].status === 'waiting' && rooms[roomId].players.length === 1) {
      socket.join(roomId);
      try {
        const allCards = await cardsRepository.findAll();
        if (allCards.length < NUM_OF_CARDS * 2) {
          socket.emit('error', { message: 'Yeterli kart bulunamadı.' });
          return;
        }
        const shuffled = allCards.sort(() => Math.random() - 0.5);
        const deckForFirst = shuffled.slice(0, NUM_OF_CARDS).map((card) => ({ ...card }));
        const deckForSecond = shuffled.slice(NUM_OF_CARDS, NUM_OF_CARDS * 2).map((card) => ({ ...card }));
        const firstPlayerName = rooms[roomId].players[0].username;
        const secondPlayerName = username;

        const { createGame } = require('./managers/pvpGameManager');
        const game = createGame(deckForFirst, deckForSecond, roomId, firstPlayerName, secondPlayerName);

        rooms[roomId].players[0].playerNumber = 1;
        rooms[roomId].players.push({ id: socket.id, username, playerNumber: 2 });
        console.log(rooms[roomId].players);

        rooms[roomId].gameId = game.id;
        rooms[roomId].decks = {
          player1: game.playerCards,
          player2: game.secondPlayerCards,
        };
        rooms[roomId].status = 'playing';
        rooms[roomId].currentRound = 1;

        io.to(roomId).emit('matchFound', {
          roomId,
          players: rooms[roomId].players,
          gameId: game.id,
          decks: rooms[roomId].decks,
          currentRound: rooms[roomId].currentRound,
          firstPlayerName,
          secondPlayerName,
        });
        io.emit('roomsList', Object.values(rooms).filter((room) => room.status === 'waiting'));
        console.log(`${username} odaya katıldı: ${roomId}`);
      } catch (err) {
        console.error(err);
        socket.emit('error', { message: 'Kartlar alınırken hata oluştu.' });
      }
    } else {
      socket.emit('error', { message: 'Oda bulunamadı veya dolu' });
    }
  });

  socket.on('getRooms', () => {
    socket.emit('roomsList', Object.values(rooms).filter((room) => room.status === 'waiting'));
  });

  socket.on('leaveMatch', (data = {}) => {
    const { roomId } = data;
    removePlayerFromRooms(socket.id, {
      explicitRoomId: roomId || null,
      notifyOpponent: true,
    });
  });

  socket.on('disconnect', () => {
    console.log(`Bağlantı kesildi: ${socket.id}`);
    removePlayerFromRooms(socket.id, { notifyOpponent: true });
  });
});

const PORT = process.env.PORT || 5010;

(async function start() {
  await connectDB();
  await seedCards();
  server.listen(PORT, () => console.log(`Server ${PORT} portunda çalışıyor`));
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
