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
const forceNextBtn = document.getElementById('forceNextBtn'); // Force Next Questioner Button

const currentAsker = document.getElementById('currentAsker');
const askerQuestionInput = document.getElementById('askerQuestion');
const submitQuestionBtn = document.getElementById('submitQuestionBtn');
const playerResponseInput = document.getElementById('playerResponse');
const submitResponseBtn = document.getElementById('submitResponseBtn');
const responsesList = document.getElementById('responsesList');
const scoresList = document.getElementById('scoresList');

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

// Force Next Questioner
forceNextBtn.addEventListener('click', () => {
    console.log('Force Next button clicked'); // Debug log
    socket.emit('forceNext');
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
    submitResponseBtn.disabled = false; // Enable the response button for responders
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
    }
});

// Submit a response (only once per question)
submitResponseBtn.addEventListener('click', () => {
    if (!hasResponded && !isAsker) {
        const response = playerResponseInput.value.trim(); // Ensure response is non-empty
        if (response) {
            socket.emit('submitResponse', response); // Send the response to the server
            playerResponseInput.value = ''; // Clear the input field
            hasResponded = true; // Mark as responded
            submitResponseBtn.disabled = true; // Disable further responses for this player
        } else {
            alert('Response cannot be empty.'); // Notify if the response is empty
        }
    }
});

// Show the current Asker
socket.on('newAsker', (asker) => {
    updateAsker(asker);
    submitResponseBtn.disabled = false; // Enable the response button for responders
    hasResponded = false; // Reset response tracking for all players
});

// Display the question
socket.on('newQuestion', (question) => {
    currentAsker.innerText = `Asker's Question: ${question}`;
    hasResponded = false; // Reset response tracking
    submitResponseBtn.disabled = false; // Enable response submission for responders
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

// Toggle input fields (disable/enable)
function toggleInputFields(disable) {
    askerQuestionInput.disabled = disable;
    submitQuestionBtn.disabled = disable;
    playerResponseInput.disabled = disable;
    submitResponseBtn.disabled = disable;
}
