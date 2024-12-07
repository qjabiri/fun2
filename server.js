const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

let players = [];
let scores = {};
let currentAskerIndex = 0;
let gameStarted = false;

app.use(express.static(path.join(__dirname, 'public')));

io.on('connection', (socket) => {
    console.log('A user connected:', socket.id);

    // Player joins the room
    socket.on('joinRoom', (name) => {
        if (!gameStarted) {
            players.push({ id: socket.id, name });
            scores[name] = 0;
            io.emit('updatePlayers', players);
        }
    });

    // Start the game
    socket.on('startGame', () => {
        if (players.length >= 2 && !gameStarted) {
            gameStarted = true;
            io.emit('gameStarted', { players, asker: players[currentAskerIndex] });
        }
    });

    // Asker submits a question
    socket.on('submitQuestion', (question) => {
        socket.broadcast.emit('newQuestion', question);
    });

    // Other players respond with their name and response
    socket.on('submitResponse', ({ response, playerName }) => {
        socket.broadcast.to(players[currentAskerIndex].id).emit('newResponse', { response, playerName });
    });

    // Asker awards points to a player
    socket.on('awardPoints', (playerName) => {
        if (scores[playerName] !== undefined) {
            scores[playerName]++;
            io.emit('updateScores', scores);
        }
        nextTurn();
    });

    // Handle player disconnection
    socket.on('disconnect', () => {
        players = players.filter((player) => player.id !== socket.id);
        io.emit('updatePlayers', players);
    });
});

function nextTurn() {
    currentAskerIndex = (currentAskerIndex + 1) % players.length;
    io.emit('newAsker', players[currentAskerIndex]);
}

server.listen(3000, () => {
    console.log('Server is running on port 3000');
});
