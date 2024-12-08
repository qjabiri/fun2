const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

let players = [];
let scores = {};
let responses = [];
let currentAskerIndex = 0;
let gameStarted = false;
let responseSubmittedBy = new Set(); // Tracks players who have submitted responses

app.use(express.static(path.join(__dirname, 'public')));

io.on('connection', (socket) => {
    console.log('A user connected:', socket.id);

    // Player joins the room
    socket.on('joinRoom', (name) => {
        const player = { id: socket.id, name };
        players.push(player);
        scores[name] = 0;

        io.emit('updatePlayers', players);
        io.emit('updateScores', scores);

        if (gameStarted) {
            socket.emit('gameStarted', { players, asker: players[currentAskerIndex] });
        }
    });

    // Start the game
    socket.on('startGame', () => {
        if (players.length >= 2) {
            gameStarted = true;
            io.emit('gameStarted', { players, asker: players[currentAskerIndex] });
        }
    });

    // Asker submits a question
    socket.on('submitQuestion', (question) => {
        responses = [];
        responseSubmittedBy.clear(); // Clear responders for the new question
        io.emit('newQuestion', question); // Broadcast question to all players
        setTimeout(() => {
            io.emit('responseTimeOver'); // Notify players when the response time is over
        }, 120000); // 2-minute timer in milliseconds
    });

    // Other players respond (track which player submitted each response)
    socket.on('submitResponse', (response) => {
        const player = players.find((player) => player.id === socket.id);
        if (player && !responseSubmittedBy.has(player.name)) {
            responses.push({ response, playerName: player.name });
            responseSubmittedBy.add(player.name); // Mark the player as having responded
            io.emit('newResponse', response); // Broadcast response anonymously
        }
    });

    // Asker awards points to the player who submitted the selected response
    socket.on('awardPoints', (selectedResponse) => {
        const responseEntry = responses.find((entry) => entry.response === selectedResponse);
        if (responseEntry) {
            scores[responseEntry.playerName]++;
            io.emit('updateScores', scores);
        }
        nextTurn();
    });

    // Reset the game
    socket.on('resetGame', () => {
        players = [];
        scores = {};
        responses = [];
        currentAskerIndex = 0;
        gameStarted = false;
        responseSubmittedBy.clear();

        io.emit('resetGame'); // Notify all clients to reset
    });

    // Handle player disconnection
    socket.on('disconnect', () => {
        players = players.filter((player) => player.id !== socket.id);
        io.emit('updatePlayers', players);
    });
});

// Rotate the asker turn
function nextTurn() {
    currentAskerIndex = (currentAskerIndex + 1) % players.length;
    io.emit('newAsker', players[currentAskerIndex]);
}

server.listen(3000, () => {
    console.log('Server is running on port 3000');
});
