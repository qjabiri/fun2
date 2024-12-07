const socket = io();

const joinRoomDiv = document.getElementById('joinRoom');
const gameRoomDiv = document.getElementById('gameRoom');
const playerNameInput = document.getElementById('playerName');
const joinBtn = document.getElementById('joinBtn');
const playersList = document.getElementById('playersList');
const startGameBtn = document.getElementById('startGameBtn');

const currentAsker = document.getElementById('currentAsker');
const askerQuestionInput = document.getElementById('askerQuestion');
const submitQuestionBtn = document.getElementById('submitQuestionBtn');
const playerResponseInput = document.getElementById('playerResponse');
const submitResponseBtn = document.getElementById('submitResponseBtn');
const responsesList = document.getElementById('responsesList');
const scoresList = document.getElementById('scoresList');

let isAsker = false;

// Player joins the room
joinBtn.addEventListener('click', () => {
    const name = playerNameInput.value;
    if (name) {
        socket.emit('joinRoom', name);
        playerNameInput.disabled = true;
        joinBtn.disabled = true;
    }
});

// Start the game
startGameBtn.addEventListener('click', () => {
    socket.emit('startGame');
});

// Update players list
socket.on('updatePlayers', (players) => {
    playersList.innerHTML = players.map((player) => `<li>${player.name}</li>`).join('');
    startGameBtn.disabled = players.length < 2;
});

// Game started
socket.on('gameStarted', ({ players, asker }) => {
    joinRoomDiv.style.display = 'none';
    gameRoomDiv.style.display = 'block';
    updateAsker(asker);
});

// Submit a question
submitQuestionBtn.addEventListener('click', () => {
    const question = askerQuestionInput.value;
    if (question) {
        socket.emit('submitQuestion', question);
        askerQuestionInput.value = '';
    }
});

// Submit a response
submitResponseBtn.addEventListener('click', () => {
    const response = playerResponseInput.value;
    if (response) {
        socket.emit('submitResponse', { response, playerName: playerNameInput.value });
        playerResponseInput.value = '';
    }
});

// Show the current Asker
socket.on('newAsker', (asker) => {
    updateAsker(asker);
});

// Display a new question
socket.on('newQuestion', (question) => {
    currentAsker.innerText = `Asker's Question: ${question}`;
});

// Display responses with player names and award points button
socket.on('newResponse', ({ response, playerName }) => {
    const responseElement = document.createElement('li');
    responseElement.innerHTML = `
        <strong>${playerName}:</strong> ${response}
        <button onclick="awardPoint('${playerName}')">Award Point</button>
    `;
    responsesList.appendChild(responseElement);
});

// Award points
function awardPoint(playerName) {
    if (isAsker) {
        socket.emit('awardPoints', playerName);
        responsesList.innerHTML = ''; // Clear responses after awarding
    }
}

// Update scores
socket.on('updateScores', (scores) => {
    scoresList.innerHTML = Object.entries(scores)
        .map(([name, score]) => `<li>${name}: ${score}</li>`)
        .join('');
});

// Update the Asker
function updateAsker(asker) {
    currentAsker.innerText = `Current Asker: ${asker.name}`;
    isAsker = asker.name === playerNameInput.value;
    askerQuestionInput.disabled = !isAsker;
    submitQuestionBtn.disabled = !isAsker;
    playerResponseInput.disabled = isAsker;
    submitResponseBtn.disabled = isAsker;
}
