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

// Reset the game (from join page)
resetBtnJoin.addEventListener('click', () => {
    socket.emit('resetGame');
});

// Reset the game (from game page)
resetBtnGame.addEventListener('click', () => {
    socket.emit('resetGame');
});

// Start the game
startGameBtn.addEventListener('click', () => {
    socket.emit('startGame');
});

// Reset the game on all clients
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

// Update players list
socket.on('updatePlayers', (players) => {
    playersList.innerHTML = players.map((player) => `<li>${player.name}</li>`).join('');
    startGameBtn.disabled = players.length < 2;
});

// Game started
socket.on('gameStarted', ({ players, asker }) => {
    joinRoomDiv.style.display = 'none';
    gameRoomDiv.style.display = 'block';
    scoresSection.style.display = 'block'; // Show the scores section
    updateAsker(asker);
});

// Submit a question (only once per turn)
submitQuestionBtn.addEventListener('click', () => {
    const question = askerQuestionInput.value;
    if (question) {
        socket.emit('submitQuestion', question);
        askerQuestionInput.value = '';
        submitQuestionBtn.disabled = true; // Disable question submission
        responsesList.innerHTML = ''; // Clear previous responses
        startResponseTimer(); // Start the 2-minute response timer
    }
});

// Submit a response (only once per question)
submitResponseBtn.addEventListener('click', () => {
    if (!hasResponded && !isAsker) {
        const response = playerResponseInput.value;
        if (response) {
            socket.emit('submitResponse', response);
            playerResponseInput.value = '';
            hasResponded = true; // Mark as responded
            submitResponseBtn.disabled = true; // Disable further responses for this player
        }
    }
});

// Show the current Asker
socket.on('newAsker', (asker) => {
    updateAsker(asker);
    submitQuestionBtn.disabled = false; // Re-enable question submission for the next questioner
    hasResponded = false; // Reset response tracking for all players
});

// Display the question
socket.on('newQuestion', (question) => {
    currentAsker.innerText = `Asker's Question: ${question}`;
    hasResponded = false; // Reset response tracking
    submitResponseBtn.disabled = false; // Enable response submission
});

// Notify players when the response time is over
socket.on('responseTimeOver', () => {
    submitResponseBtn.disabled = true; // Disable further responses
    if (timerElement) {
        timerElement.remove();
        timerElement = null;
    }
    clearInterval(timerInterval);
});

// Display anonymous responses
socket.on('newResponse', (response) => {
    const responseElement = document.createElement('li');
    responseElement.innerHTML = `
        <strong>Response:</strong> ${response}
        ${isAsker ? `<button onclick="awardPoint('${response}')">Select Best</button>` : ''}
    `;
    responsesList.appendChild(responseElement);
});

// Award points
function awardPoint(selectedResponse) {
    if (isAsker) {
        socket.emit('awardPoints', selectedResponse);
        responsesList.innerHTML = ''; // Clear responses after awarding
    }
}

// Update scores
socket.on('updateScores', (scores) => {
    scoresList.innerHTML = Object.entries(scores)
        .map(([name, score]) => `<li>${name}: ${score}</li>`).join('');
});

// Update the Asker
function updateAsker(asker) {
    currentAsker.innerText = `Current Asker: ${asker.name}`;
    isAsker = asker.name === playerNameInput.value;
    toggleInputFields(!isAsker);
}

// Start the response timer
function startResponseTimer() {
    let remainingTime = responseTimerDuration;
    if (!timerElement) {
        timerElement = document.createElement('h3');
        timerElement.id = 'responseTimer';
        gameRoomDiv.appendChild(timerElement);
    }

    timerElement.innerText = `Time left to respond: ${remainingTime} seconds`;

    timerInterval = setInterval(() => {
        remainingTime -= 1;
        timerElement.innerText = `Time left to respond: ${remainingTime} seconds`;

        if (remainingTime <= 0) {
            clearInterval(timerInterval);
            timerElement.innerText = 'Response time is over!';
            submitResponseBtn.disabled = true; // Disable responses
        }
    }, 1000);
}

// Toggle input fields (disable/enable)
function toggleInputFields(disable) {
    askerQuestionInput.disabled = disable;
    submitQuestionBtn.disabled = disable;
    playerResponseInput.disabled = disable;
    submitResponseBtn.disabled = disable;
}
