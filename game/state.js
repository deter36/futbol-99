/*
 * state.js — The "memory" of the game (scores, whose turn, ball position)
 * This is where the game keeps track of everything that's happening:
 * where players are, whose turn it is, what cards are in each hand,
 * what phase the game is in, etc. Think of it as the game's brain.
 */

let gameState = {
    field: [],
    playerScore: 0,
    aiScore: 0,
    currentTurn: 'player',
    actionsRemaining: ACTIONS_PER_TURN,
    coins: 0,
    
    playerDeck: [],
    playerHand: [],
    playerDiscard: [],
    playerCoach: null, // Active coach card for player
    playerCoachUsed: false, // Whether coach ability used this turn
    
    aiDeck: [],
    aiHand: [],
    aiDiscard: [],
    aiCoach: null, // Active coach card for AI
    aiCoachUsed: false, // Whether coach ability used this turn
    
    market: [],
    marketDeck: [], // Draw deck for market cards
    selectedCard: null,
    selectedPlayer: null,
    selectedMarkCells: [],
    multiMove: null,
    commandActivation: null,
    plannedOffense: [],
    plannedDefense: [],
    offenseTeam: 'player',
    defenseTeam: 'ai',
    offenseResolveIndex: 0,
    resolvingRole: null,
    resolvingPlannedCard: false,
    resolutionStep: 0,
    comboPassPending: null, // Stores pending pass info for combo cards like Playmaker
    pendingMoveMark: null,
    defensiveMarks: [],
    offBalancePlayers: [],
    airborneBall: null,
    loosePossessionTeam: null,
    kickoffPending: false,
    goalKickPending: false,
    gamePhase: 'action', // 'action', 'reposition_shooter', 'reposition_defender', 'defensive_reaction', 'goal_kick_selection'
    aiDebugMode: true, // DEBUG: Set to false to make AI auto-play
    manualControlMode: false, // When true, player controls both teams
    aiActionQueue: [], // Queue of AI actions to execute step-by-step
    aiPhase: 'idle', // 'idle', 'playing_economy', 'playing_actions', 'buying', 'done'
    repositionTeam: null,
    repositionRange: 0,
    repositionsRemaining: [],
    pendingPass: null, // Stores pass info during defensive reaction
    goalKickDefenders: null, // Defenders tied for closest during goal kick
    goalKickCell: null,
    goalKickShootingTeam: null,
    goalKickDefendingTeam: null
};
