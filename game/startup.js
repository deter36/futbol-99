/*
 * startup.js — Kicks off the game, hooks up buttons
 * Initializes the game field, sets up the decks, draws starting
 * hands, attaches all the button click handlers (end turn, reset,
 * finish movement, repositioning, manual control toggle), adds
 * keyboard accessibility, and calls initGame() to begin.
 */

// ========================================
// MAIN GAME INITIALIZATION
// ========================================

function initGame() {
    // Initialize field with rectangular shape (12-11-12-11 pattern for height)
    gameState.field = [];
    for (let x = 0; x < FIELD_WIDTH; x++) {
        const colHeight = getColumnHeight(x);
        for (let y = 0; y < colHeight; y++) {
            gameState.field.push({
                x, y,
                player: null,
                ball: false
            });
        }
    }
   
    setupRestartFormation('player');
   
    // Initialize decks
    gameState.playerDeck = createStarterDeck();
    gameState.aiDeck = createStarterDeck();
    shuffleDeck(gameState.playerDeck);
    shuffleDeck(gameState.aiDeck);
   
    // Initialize market deck and deal initial cards
    gameState.marketDeck = createMarketDeck();
    gameState.market = getInitialMarketCards();
    log('Upgrade market paused: testing the 12-card command deck.');
   
    // Reset game state
    gameState.playerScore = 0;
    gameState.aiScore = 0;
    gameState.currentTurn = 'player';
    gameState.actionsRemaining = ACTIONS_PER_TURN;
    gameState.coins = 0;
    gameState.selectedCard = null;
    gameState.selectedPlayer = null;
    gameState.selectedMarkCells = [];
    gameState.multiMove = null;
    gameState.commandActivation = null;
    gameState.pendingMoveMark = null;
    gameState.defensiveMarks = [];
    gameState.offBalancePlayers = [];
    gameState.airborneBall = null;
    gameState.loosePossessionTeam = null;
    gameState.kickoffPending = false;
    gameState.goalKickPending = false;
    gameState.playerHand = [];
    gameState.playerDiscard = [];
    gameState.aiHand = [];
    gameState.aiDiscard = [];
   
    // Reset phase-related state (CRITICAL: prevents game from getting stuck!)
    gameState.gamePhase = 'action';
    gameState.comboPassPending = null;
    gameState.resolutionStep = 0;
    gameState.aiActionQueue = [];
    gameState.aiPhase = 'idle';
    gameState.repositionTeam = null;
    gameState.repositionRange = 0;
    gameState.repositionsRemaining = [];
    gameState.pendingPass = null;
    gameState.goalKickDefenders = null;
    gameState.goalKickCell = null;
    gameState.goalKickShootingTeam = null;
    gameState.goalKickDefendingTeam = null;
    // Note: manualControlMode persists across game resets (testing feature)
   
    // Draw initial hands
    drawCards('player', HAND_SIZE);
    drawCards('ai', HAND_SIZE);

    startKickoffPass('player');
   
    render();
    log('Game started! You control the 🔵 blue team on the left. Get the ⚽ ball to the red goal!');
}

// ========================================
// EVENT LISTENERS
// ========================================

document.getElementById('end-turn-btn').addEventListener('click', () => {
    // In manual mode, allow ending either team's turn
    if (gameState.manualControlMode || gameState.currentTurn === 'player') {
        endTurn();
    }
});

document.getElementById('finish-movement-btn').addEventListener('click', () => {
    finishMovementCard();
});

document.getElementById('end-reposition-btn').addEventListener('click', () => {
    // In manual mode, allow repositioning for both teams
    if (gameState.manualControlMode || gameState.repositionTeam === 'player') {
        if (gameState.gamePhase === 'reposition_shooter') {
            // Move to defender repositioning
            const defendingTeam = gameState.repositionTeam === 'player' ? 'ai' : 'player';
            startDefenderRepositioning(defendingTeam);
        } else if (gameState.gamePhase === 'reposition_defender') {
            endRepositioning();
        }
    }
});

document.getElementById('reset-btn').addEventListener('click', () => {
    if (confirm('Start a new game?')) {
        initGame();
    }
});

document.getElementById('next-ai-action-btn').addEventListener('click', () => {
    executeNextAIAction();
});

document.getElementById('manual-control-btn').addEventListener('click', () => {
    gameState.manualControlMode = !gameState.manualControlMode;
    const btn = document.getElementById('manual-control-btn');
    btn.textContent = gameState.manualControlMode ? '🎮 Manual Mode: ON' : '🤖 Manual Mode: OFF';
    btn.classList.toggle('active', gameState.manualControlMode);
    render();
    log(gameState.manualControlMode ? '🎮 Manual control enabled - you control both teams!' : '🤖 AI control restored');
});

// Keyboard accessibility
document.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target.classList.contains('card')) {
        e.target.click();
    }
});

// ========================================
// START GAME
// ========================================

initGame();
