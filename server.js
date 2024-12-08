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
let currentQuestionerId = null; // Tracks the current questioner's socket ID

app.use(express.static(path.join(__dirname, 'public')));

io.on('connection', (socket) => {
    console.log('A user connected:', socket.id);

    // Player joins the room
    socket.on('joinRoom', (name) => {
        let player = players.find((p) => p.name === name);

        if (!player) {
            // New player joins
            player = { id: socket.id, name };
            players.push(player);
            scores[name] = 0;
        } else {
            // Existing player reconnects
            player.id = socket.id; // Update the socket ID
        }

        socket.emit('syncGame', {
            players,
            scores,
            gameStarted,
            asker: players[currentAskerIndex],
            responses,
        });

        io.emit('updatePlayers', players);
        io.emit('updateScores', scores);
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
        if (currentQuestionerId === null) {
            responses = [];
            responseSubmittedBy.clear(); // Clear responders for the new question
            currentQuestionerId = socket.id; // Track the questioner's ID
            io.emit('newQuestion', question); // Broadcast question to all players

            setTimeout(() => {
                io.emit('responseTimeOver'); // Notify players when the response time is over
            }, 120000); // 2-minute timer in milliseconds
        }
    });

    // Other players respond
    socket.on('submitResponse', (response) => {
        const player = players.find((player) => player.id === socket.id);
        if (
            player &&
            !responseSubmittedBy.has(player.name) && // Check if the player has not already responded
            socket.id !== currentQuestionerId // Ensure the questioner cannot respond
        ) {
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
        currentQuestionerId = null;

        io.emit('resetGame'); // Notify all clients to reset
    });

    // Handle player disconnection
    socket.on('disconnect', () => {
        const player = players.find((p) => p.id === socket.id);
        if (player) {
            player.id = null; // Mark player as disconnected (allow reconnect)
        }
        io.emit('updatePlayers', players);
    });
});

// Rotate the asker turn
function nextTurn() {
    currentAskerIndex = (currentAskerIndex + 1) % players.length;
    currentQuestionerId = null; // Reset the current questioner
    io.emit('newAsker', players[currentAskerIndex]);
}
server.listen(3000, () => {
    console.log('Server is running on port 3000');
});
