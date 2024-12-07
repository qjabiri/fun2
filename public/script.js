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

joinBtn.addEventListener('click', () => {
    const name = playerNameInput.value;
    if (name) {
        socket.emit('joinRoom', name);
        playerNameInput.disabled = true;
        joinBtn.disabled = true;
    }
});

startGameBtn.addEventListener('click', () => {
    socket.emit('startGame');
});

socket.on('updatePlayers', (players) => {
    playersList.innerHTML = players.map((player) => `<li>${player.name}</li>`).join('');
    startGameBtn.disabled = players.length < 2;
});

socket.on('gameStarted', ({ players, asker }) => {
    joinRoomDiv.style.display = 'none';
    gameRoomDiv.style.display = 'block';
    updateAsker(asker);
});

submitQuestionBtn.addEventListener('click', () => {
    const question = askerQuestionInput.value;
    if (question) {
        socket.emit('submitQuestion', question);
        askerQuestionInput.value = '';
    }
});

submitResponseBtn.addEventListener('click', () => {
    const response = playerResponseInput.value;
    if (response) {
        socket.emit('submitResponse', response);
        playerResponseInput.value = '';
    }
});

socket.on('newQuestion', (question) => {
    currentAsker.innerText = `Asker: ${question}`;
});

socket.on('newResponse', ({ response, player }) => {
    responsesList.innerHTML += `<li>${response} (Player: ${player})</li>`;
});

socket.on('updateScores', (scores) => {
    scoresList.innerHTML = Object.entries(scores)
        .map(([name, score]) => `<li>${name}: ${score}</li>`)
        .join('');
});

function updateAsker(asker) {
    currentAsker.innerText = `Current Asker: ${asker.name}`;
    isAsker = asker.id === socket.id;
    askerQuestionInput.disabled = !isAsker;
    submitQuestionBtn.disabled = !isAsker;
    playerResponseInput.disabled = isAsker;
    submitResponseBtn.disabled = isAsker;
}
