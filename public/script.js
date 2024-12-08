const socket = io();

const joinRoomDiv = document.getElementById('joinRoom');
const gameRoomDiv = document.getElementById('gameRoom');
const scoresSection = document.getElementById('scoresSection');
const playerNameInput = document.getElementById('playerName');
const joinBtn = document.getElementById('joinBtn');
const playersList = document.getElementById('playersList');
const startGameBtn = document.getElementById('startGameBtn');
const resetBtnJoin = document.getElementById('resetBtnJoin');
const resetBtnGame = document.getElementById('resetBtnGame');

const currentAsker = document.getElementById('currentAsker');
const askerQuestionInput = document.getElementById('askerQuestion');
const submitQuestionBtn = document.getElementById('submitQuestionBtn');
const playerResponseInput = document.getElementById('playerResponse');
const submitResponseBtn = document.getElementById('submitResponseBtn');
const responsesList = document.getElementById('responsesList');
const scoresList = document.getElementById('scoresList');

let timerElement; // Timer display
let responseTimerDuration = 120; // Timer duration in seconds (2 minutes)
let timerInterval; // Timer interval
let isAsker = false;
let hasResponded = false; // Track if the player has already responded

// Player joins the room
joinBtn.addEventListener('click', () => {
    const name = playerNameInput.value;
    if (name) {
        socket.emit('joinRoom', name);
        playerNameInput.disabled = true;
        joinBtn.disabled = true;
    }
});

// Sync game state when reconnecting
socket.on('syncGame', ({ players, scores, gameStarted, asker, responses }) => {
    updatePlayers(players);
    updateScores(scores);

    if (gameStarted) {
        joinRoomDiv.style.display = 'none';
        gameRoomDiv.style.display = 'block';
        scoresSection.style.display = 'block';
        updateAsker(asker);

        // Re-enable response submission if allowed
        if (responses) {
            responses.forEach((response) => {
                const responseElement = document.createElement('li');
                responseElement.innerHTML = `<strong>Response:</strong> ${response.response}`;
                responsesList.appendChild(responseElement);
            });
        }
    }
});

// Reset the game
socket.on('resetGame', () => {
    joinRoomDiv.style.display = 'block';
    gameRoomDiv.style.display = 'none';
    scoresSection.style.display = 'none';
    playersList.innerHTML = '';
    scoresList.innerHTML = '';
    responsesList.innerHTML = '';
    playerNameInput.disabled = false;
    joinBtn.disabled = false;
    hasResponded = false;
});

// Allow responders to submit responses during the countdown
submitResponseBtn.addEventListener('click', () => {
    if (!hasResponded && !isAsker) {
        const response = playerResponseInput.value;
        if (response) {
            socket.emit('submitResponse', response);
            playerResponseInput.value = '';
            hasResponded = true;
        }
    }
});
