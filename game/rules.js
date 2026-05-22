/*
 * rules.js — Turn flow, passing, shooting, tackles, marking
 * The core game rules: how turns work, how cards are played and
 * resolved, how passes/shots/tackles/clears/crosses actually
 * execute, the planning phase, repositioning, and goal kicks.
 * This is the biggest file because it IS the game.
 */

function getTeamWithPossession() {
    const ballCell = getCellWithBall();
    if (ballCell && ballCell.player) return ballCell.player.team;
    if (ballCell && gameState.loosePossessionTeam) return gameState.loosePossessionTeam;
    return gameState.currentTurn;
}

function startPlanningRound() {
    if (gameState.kickoffPending || gameState.goalKickPending) return;
    expireDefensiveMarks();

    const offense = getTeamWithPossession();
    gameState.offenseTeam = offense;
    gameState.defenseTeam = offense === 'player' ? 'ai' : 'player';
    gameState.currentTurn = offense;
    gameState.gamePhase = 'planning_offense';
    gameState.actionsRemaining = 3;
    gameState.plannedOffense = [];
    gameState.plannedDefense = [];
    gameState.offenseResolveIndex = 0;
    gameState.resolvingRole = null;
    gameState.resolvingPlannedCard = false;
    gameState.selectedCard = null;
    gameState.selectedPlayer = null;
    gameState.commandActivation = null;
    log(`${offense === 'player' ? 'Player' : 'AI'} has possession. Offense: choose 3 cards face down.`);
    render();
    autoPlanIfNeeded();
}

function planCard(card, team) {
    const isOffensePlan = gameState.gamePhase === 'planning_offense' && team === gameState.offenseTeam;
    const isDefensePlan = gameState.gamePhase === 'planning_defense' && team === gameState.defenseTeam;
    if (!isOffensePlan && !isDefensePlan) return;
    if (card.type !== CARD_TYPES.COMMAND) {
        log('Only command cards are used in the new planning round.');
        return;
    }

    removeCardFromHand(card, team);
    const plan = isOffensePlan ? gameState.plannedOffense : gameState.plannedDefense;
    plan.push(card);
    log(`${team === 'player' ? 'Player' : 'AI'} planned card ${plan.length}/3 face down.`);

    if (isOffensePlan && plan.length >= 3) {
        gameState.gamePhase = 'planning_defense';
        gameState.currentTurn = gameState.defenseTeam;
        log(`${gameState.defenseTeam === 'player' ? 'Player' : 'AI'} defense: choose 3 response cards face down.`);
    } else if (isDefensePlan && plan.length >= 3) {
        startResolutionRound();
        return;
    }

    render();
    autoPlanIfNeeded();
}

function autoPlanIfNeeded() {
    if (gameState.manualControlMode) return;

    if (gameState.gamePhase === 'planning_offense' && gameState.offenseTeam === 'ai') {
        autoPlanCards('ai', gameState.plannedOffense);
    } else if (gameState.gamePhase === 'planning_defense' && gameState.defenseTeam === 'ai') {
        autoPlanCards('ai', gameState.plannedDefense);
    }
}

function autoPlanCards(team, plan) {
    const hand = team === 'player' ? gameState.playerHand : gameState.aiHand;
    while (plan.length < 3 && hand.length > 0) {
        const card = hand.find(c => c.type === CARD_TYPES.COMMAND) || hand[0];
        removeCardFromHand(card, team);
        plan.push(card);
        log(`${team === 'player' ? 'Player' : 'AI'} planned card ${plan.length}/3 face down.`);
    }

    if (gameState.gamePhase === 'planning_offense' && plan.length >= 3) {
        gameState.gamePhase = 'planning_defense';
        gameState.currentTurn = gameState.defenseTeam;
        log(`${gameState.defenseTeam === 'player' ? 'Player' : 'AI'} defense: choose 3 response cards face down.`);
        render();
        autoPlanIfNeeded();
    } else if (gameState.gamePhase === 'planning_defense' && plan.length >= 3) {
        startResolutionRound();
    } else {
        render();
    }
}

function startResolutionRound() {
    gameState.gamePhase = 'resolve_offense';
    gameState.offenseResolveIndex = 0;
    log('Resolution begins. Offense reveals the first card.');
    revealNextOffenseCard();
}

function revealNextOffenseCard() {
    if (gameState.offenseResolveIndex >= gameState.plannedOffense.length) {
        finishResolutionRound();
        return;
    }

    const card = gameState.plannedOffense[gameState.offenseResolveIndex];
    startPlannedCardResolution(card, gameState.offenseTeam, 'offense');
}

function startPlannedCardResolution(card, team, role) {
    gameState.resolutionStep++;
    expireDefensiveMarks();
    gameState.currentTurn = team;
    gameState.gamePhase = 'resolving_card';
    gameState.resolvingRole = role;
    gameState.resolvingPlannedCard = true;
    gameState.selectedCard = card;
    gameState.selectedPlayer = null;
    gameState.selectedMarkCells = [];
    gameState.commandActivation = {
        phase: 'select',
        selectedPlayers: [],
        movedPlayerIds: [],
        actingPlayerId: null,
        action: null
    };
    log(`${team === 'player' ? 'Player' : 'AI'} reveals ${card.name}. Activate players, move, then choose one action.`);
    render();
}

function chooseDefenseResponse(card) {
    if (gameState.gamePhase !== 'choose_defense_card') return;
    startPlannedCardResolution(card, gameState.defenseTeam, 'defense');
}

function advanceResolutionAfterCard(card, team) {
    discardCardOnce(card, team);
    gameState.selectedCard = null;
    gameState.selectedPlayer = null;
    gameState.commandActivation = null;
    gameState.resolvingPlannedCard = false;

    if (gameState.resolvingRole === 'offense') {
        if (gameState.plannedDefense.length > 0) {
            gameState.gamePhase = 'choose_defense_card';
            gameState.currentTurn = gameState.defenseTeam;
            gameState.resolvingRole = null;
            log('Defense: choose one planned card to reveal and resolve.');
            if (!gameState.manualControlMode && gameState.defenseTeam === 'ai') {
                const card = gameState.plannedDefense[0];
                setTimeout(() => chooseDefenseResponse(card), 300);
            }
        } else {
            gameState.offenseResolveIndex++;
            revealNextOffenseCard();
            return;
        }
    } else {
        gameState.plannedDefense = gameState.plannedDefense.filter(plannedCard => plannedCard.uid !== card.uid);
        gameState.offenseResolveIndex++;
        gameState.resolvingRole = null;
        revealNextOffenseCard();
        return;
    }

    render();
}

function finishResolutionRound() {
    discardUnresolvedPlannedCards();
    drawCards('player', Math.max(0, HAND_SIZE - gameState.playerHand.length));
    drawCards('ai', Math.max(0, HAND_SIZE - gameState.aiHand.length));
    log('Round complete. Both teams draw back up to 6.');
    startPlanningRound();
}

function resetResolutionState() {
    gameState.selectedCard = null;
    gameState.selectedPlayer = null;
    gameState.selectedMarkCells = [];
    gameState.multiMove = null;
    gameState.commandActivation = null;
    gameState.resolvingRole = null;
    gameState.resolvingPlannedCard = false;
    gameState.offenseResolveIndex = 0;
    gameState.gamePhase = 'action';
}

function restartAfterGoal(scoringTeam) {
    const concedingTeam = scoringTeam === 'player' ? 'ai' : 'player';
    discardUnresolvedPlannedCards();
    resetResolutionState();
    gameState.loosePossessionTeam = null;
    drawCards('player', Math.max(0, HAND_SIZE - gameState.playerHand.length));
    drawCards('ai', Math.max(0, HAND_SIZE - gameState.aiHand.length));
    setupRestartFormation(concedingTeam);
    startKickoffPass(concedingTeam);
    log('Goal restart: all planned cards discarded and both teams draw back to 6.');
}

function discardUnresolvedPlannedCards() {
    gameState.plannedOffense.forEach(card => {
        discardCardOnce(card, gameState.offenseTeam);
    });
    gameState.plannedDefense.forEach(card => {
        discardCardOnce(card, gameState.defenseTeam);
    });
    gameState.plannedOffense = [];
    gameState.plannedDefense = [];
}

function finishCommandActivationState(team) {
    clearExpiredOffBalanceForTeam(team);
    if (gameState.airborneBall &&
        gameState.airborneBall.crossingTeam === team &&
        gameState.airborneBall.createdStep < gameState.resolutionStep) {
        log(`Airborne ball lands at (${gameState.airborneBall.x}, ${gameState.airborneBall.y}) and is uncontrolled.`);
        clearAirborneBall();
    }
}

function completeCardPlay(card, team) {
    finishCommandActivationState(team);

    if (gameState.resolvingPlannedCard) {
        advanceResolutionAfterCard(card, team);
        return;
    }

    if (!card.isFreeAction) {
        gameState.actionsRemaining--;
        discardCard(card, team);
    }

    gameState.selectedCard = null;
    gameState.selectedPlayer = null;
    gameState.selectedMarkCells = [];
    gameState.multiMove = null;
    gameState.commandActivation = null;
    gameState.plannedOffense = [];
    gameState.plannedDefense = [];
    gameState.offenseResolveIndex = 0;
    gameState.resolvingRole = null;
    gameState.resolvingPlannedCard = false;
    gameState.pendingMoveMark = null;
    render();
}

function finishMovementCard() {
    if (gameState.selectedCard && gameState.commandActivation) {
        if (gameState.commandActivation.selectedPlayers.length === 0) {
            log(`${gameState.selectedCard.name}: no eligible activation. Card fizzles.`);
            completeCardPlay(gameState.selectedCard, gameState.currentTurn);
            return;
        }
        if (gameState.commandActivation.phase === 'select') {
            startCommandMovement();
        } else {
            completeCommandCard();
        }
        return;
    }

    if (!gameState.selectedCard || !gameState.multiMove || gameState.multiMove.movedPlayerIds.length === 0) {
        return;
    }

    const card = gameState.selectedCard;
    const team = gameState.currentTurn;
    log(`Finished movement with ${gameState.multiMove.movedPlayerIds.length} player move${gameState.multiMove.movedPlayerIds.length === 1 ? '' : 's'}.`);
    completeCardPlay(card, team);
}

function createKickoffPassCard() {
    return {
        id: 'kickoff_pass',
        name: 'Kickoff Pass',
        type: CARD_TYPES.PASS,
        cost: 0,
        description: 'Free medium pass to start play',
        effect: { type: 'pass', range: 4 },
        isFreeAction: true,
        isKickoff: true,
        uid: 'kickoff-pass'
    };
}

function createGoalKickCard() {
    return {
        id: 'goal_kick_pass',
        name: 'Goal Kick',
        type: CARD_TYPES.PASS,
        cost: 0,
        description: 'Free long pass to restart after a missed shot',
        effect: { type: 'pass', range: 6 },
        isFreeAction: true,
        isGoalKick: true,
        mustTargetTeammate: true,
        uid: 'goal-kick-pass'
    };
}

function createGoalKickClearCard() {
    return {
        id: 'goal_kick_clear',
        name: 'Goal Kick Clear',
        type: CARD_TYPES.COMMAND,
        cost: 0,
        description: 'Free clear to restart after a failed shot',
        effect: { type: 'goal_kick_clear' },
        isFreeAction: true,
        isGoalKick: true,
        uid: 'goal-kick-clear'
    };
}

function startKickoffPass(team) {
    gameState.currentTurn = team;
    gameState.kickoffPending = true;
    gameState.goalKickPending = false;
    gameState.selectedCard = createKickoffPassCard();
    gameState.selectedPlayer = null;
    gameState.selectedMarkCells = [];
    gameState.multiMove = null;
    gameState.commandActivation = null;
    gameState.pendingMoveMark = null;
    log(`${team === 'player' ? 'Your' : 'AI'} kickoff: make a free medium pass.`);
}

function startGoalKickPass(team) {
    gameState.currentTurn = team;
    gameState.kickoffPending = false;
    gameState.goalKickPending = true;
    gameState.selectedCard = createGoalKickCard();
    gameState.selectedPlayer = null;
    gameState.selectedMarkCells = [];
    gameState.multiMove = null;
    gameState.commandActivation = null;
    gameState.pendingMoveMark = null;
    log(`${team === 'player' ? 'Your' : 'AI'} goal kick: make a free long pass to a teammate.`);
}

function startGoalKickClear(team, shotGoalCell = null) {
    const activeCard = gameState.selectedCard;
    const activeTeam = gameState.currentTurn;
    if (activeCard && !activeCard.isGoalKick) {
        discardCardOnce(activeCard, activeTeam);
    }
    discardUnresolvedPlannedCards();
    resetResolutionState();
    drawCards('player', Math.max(0, HAND_SIZE - gameState.playerHand.length));
    drawCards('ai', Math.max(0, HAND_SIZE - gameState.aiHand.length));

    gameState.currentTurn = team;
    gameState.loosePossessionTeam = null;
    gameState.kickoffPending = false;
    gameState.goalKickPending = true;
    gameState.selectedCard = createGoalKickClearCard();
    gameState.selectedMarkCells = [];
    gameState.multiMove = null;
    gameState.commandActivation = null;
    gameState.pendingMoveMark = null;
    clearAirborneBall();

    gameState.field.forEach(cell => {
        cell.ball = false;
    });

    const goalX = shotGoalCell ? shotGoalCell.x : (team === 'player' ? 0 : 16);
    const goalY = shotGoalCell?.y === 6 ? (Math.random() < 0.5 ? 5 : 7) : (shotGoalCell?.y || 5);
    const clearCell = getCell(goalX, goalY) || getCell(goalX, 5);
    gameState.selectedPlayer = clearCell;
    if (clearCell) {
        clearCell.ball = true;
    }

    log(`${team === 'player' ? 'Blue' : 'Red'} goal kick: choose a CLEAR target from (${clearCell?.x}, ${clearCell?.y}).`);
    render();
}

function aiTakeKickoffPass() {
    const ballCell = getCellWithBall();
    if (!ballCell) return false;

    const targets = gameState.field
        .filter(cell => cell.player && cell.player.team === 'ai' && cell !== ballCell)
        .filter(cell => distance(ballCell.x, ballCell.y, cell.x, cell.y) <= 4)
        .sort((a, b) => a.x - b.x);

    if (targets.length === 0) {
        return false;
    }

    const target = targets[0];
    log(`AI kickoff pass to (${target.x}, ${target.y})`);
    passBall(target);
    gameState.kickoffPending = false;
    gameState.selectedCard = null;
    startPlanningRound();
    return true;
}

function aiTakeGoalKickPass() {
    const ballCell = getCellWithBall();
    if (!ballCell) return false;

    const targets = gameState.field
        .filter(cell => cell.player && cell.player.team === 'ai' && cell !== ballCell)
        .filter(cell => distance(ballCell.x, ballCell.y, cell.x, cell.y) <= 6)
        .sort((a, b) => a.x - b.x);

    if (targets.length === 0) {
        return false;
    }

    const target = targets[0];
    log(`AI goal kick to (${target.x}, ${target.y})`);
    passBall(target);
    gameState.goalKickPending = false;
    gameState.selectedCard = null;
    startPlanningRound();
    return true;
}

function applyDefensiveMark(card, defenderCell, zones) {
    const team = gameState.currentTurn;
    const effect = getActiveCardEffect(card, team);

    gameState.defensiveMarks = gameState.defensiveMarks.filter(mark =>
        !(mark.team === team && mark.defender.x === defenderCell.x && mark.defender.y === defenderCell.y)
    );

    gameState.defensiveMarks.push({
        team,
        defender: { id: defenderCell.player.id, x: defenderCell.x, y: defenderCell.y },
        zones: zones.map(zone => ({ x: zone.x, y: zone.y })),
        source: effect.name,
        createdStep: gameState.resolutionStep
    });

    log(`${effect.name}: defender at (${defenderCell.x}, ${defenderCell.y}) now covers ${zones.length} adjacent hex${zones.length === 1 ? '' : 'es'}.`);
    completeCardPlay(card, team);
}

function getCommandCellLanes(cell) {
    return getPitchZones(cell).lanes;
}

function getSelectedCommandPlayer(cell) {
    const commandState = gameState.commandActivation;
    if (!commandState || !cell.player || cell.player.team !== gameState.currentTurn) return null;
    return commandState.selectedPlayers.find(selected => selected.playerId === cell.player.id) || null;
}

function getCommandMaxSelections(command) {
    if (command.mode === 'lane') return command.count;
    return command.lanes.length * command.perLane;
}

function getCommandSelectionLane(cell, command) {
    const cellLanes = getCommandCellLanes(cell);
    return command.lanes.find(lane => cellLanes.includes(lane)) || null;
}

function getCommandSelectedLaneCounts(commandState) {
    return commandState.selectedPlayers.reduce((counts, selected) => {
        counts[selected.lane] = (counts[selected.lane] || 0) + 1;
        return counts;
    }, {});
}

function isSelectedForCommand(cell) {
    return !!getSelectedCommandPlayer(cell);
}

function canSelectForCommand(cell, card) {
    if (!cell.player || cell.player.team !== gameState.currentTurn) return false;
    if (isSelectedForCommand(cell)) return false;

    const command = card.command;
    const zones = getPitchZones(cell, gameState.currentTurn);
    if (command.mode === 'third' && zones.third !== command.third) return false;

    const selectedCount = gameState.commandActivation.selectedPlayers.length;
    if (selectedCount >= getCommandMaxSelections(command)) return false;

    const lane = getCommandSelectionLane(cell, command);
    if (!lane) return false;

    if (command.mode !== 'lane') {
        const laneCounts = getCommandSelectedLaneCounts(gameState.commandActivation);
        if ((laneCounts[lane] || 0) >= command.perLane) return false;
    }

    return true;
}

function selectCommandPlayer(cell, card) {
    const command = card.command;
    const lane = getCommandSelectionLane(cell, command);
    const wasOffBalance = isPlayerOffBalance(gameState.currentTurn, cell.player.id);
    clearMarksForActivatedPlayer(gameState.currentTurn, cell.player.id);
    gameState.commandActivation.selectedPlayers.push({
        playerId: cell.player.id,
        lane,
        start: { x: cell.x, y: cell.y },
        wasOffBalance
    });

    const selected = gameState.commandActivation.selectedPlayers.length;
    const max = getCommandMaxSelections(command);
    log(`${card.name}: activated ${selected}/${max} player${selected === 1 ? '' : 's'}${wasOffBalance ? ' (off balance: movement only)' : ''}.`);

    if (selected >= max) {
        startCommandMovement();
    } else {
        render();
    }
}

function startCommandMovement() {
    if (!gameState.commandActivation || gameState.commandActivation.selectedPlayers.length === 0) return;
    gameState.commandActivation.phase = 'move';
    gameState.selectedPlayer = null;
    log('Command movement: move activated players up to 5 spaces. Ball carriers move up to 4.');
    render();
}

function completeCommandCard() {
    const card = gameState.selectedCard;
    if (!card || !gameState.commandActivation) return;

    if (gameState.commandActivation.phase !== 'act') {
        gameState.commandActivation.phase = 'act';
        gameState.selectedPlayer = null;
        log(`${card.name}: movement complete. Choose one activated player to take an action.`);
        render();
        return;
    }

    log(`${card.name}: resolved without an action.`);
    completeCardPlay(card, gameState.currentTurn);
}

function canMoveCommandPlayer(cell) {
    const commandState = gameState.commandActivation;
    if (!commandState || commandState.phase !== 'move') return false;
    if (!cell.player || cell.player.team !== gameState.currentTurn) return false;
    if (commandState.movedPlayerIds.includes(cell.player.id)) return false;
    return !!getSelectedCommandPlayer(cell);
}

function getCommandMoveRangeForCell(cell, baseRange) {
    return cell && cell.ball ? Math.max(0, baseRange - 1) : baseRange;
}

function getCommandActionsForCell(card, cell) {
    const selected = getSelectedCommandPlayer(cell);
    if (!selected) return [];
    if (selected.wasOffBalance) return [];
    const zones = getPitchZones(cell, gameState.currentTurn);
    if (!zones.lanes.includes(selected.lane)) return [];
    const third = getPitchZones(cell, gameState.currentTurn).third;
    return card.command.actions[third] || [];
}

function chooseCommandActionPlayer(cell) {
    const card = gameState.selectedCard;
    const actions = getCommandActionsForCell(card, cell);
    if (actions.length === 0) {
        log(`${card.name}: no action options for that player in this third.`);
        return;
    }

    gameState.selectedPlayer = cell;
    gameState.commandActivation.action = null;
    gameState.commandActivation.actingPlayerId = cell.player.id;
    gameState.selectedMarkCells = [];
    log(`${card.name}: choose an action for the selected player.`);
    render();
}

function chooseCommandAction(action) {
    if (!gameState.selectedCard || !gameState.commandActivation || !gameState.selectedPlayer) return;
    gameState.commandActivation.action = action;
    gameState.selectedMarkCells = [];
    log(`${gameState.selectedCard.name}: ${action} selected. Choose a target.`);
    render();
}

function getPassTargetLanes(action, passerCell) {
    const zones = getPitchZones(passerCell, gameState.currentTurn);
    if (action === 'pass lane') return zones.lanes;
    if (action === 'pass inside') return ['center'];
    if (action === 'pass outside') return ['left', 'right'];
    if (action === 'cross') return ['center'];
    return [];
}

function getPassTargetThirds(action, passerCell) {
    const third = getPitchZones(passerCell, gameState.currentTurn).third;
    if (action === 'pass lane') return getSameOrAdjacentThirds(third);
    return [third];
}

function getSameOrAdjacentThirds(third) {
    if (third === 'defensive') return ['defensive', 'midfield'];
    if (third === 'midfield') return ['defensive', 'midfield', 'attacking'];
    return ['midfield', 'attacking'];
}

function getShotRequiredRollModifier(card, shooterCell) {
    if (!card || !shooterCell) return 0;
    const third = getPitchZones(shooterCell, gameState.currentTurn).third;
    const label = getCommandActionLabel(card, third, 'shoot');
    return label.includes('+1 required roll') ? 1 : 0;
}

function getClearPressureCells(cell, team) {
    const origin = offsetToAxial(cell.x, cell.y);
    const clearDirection = team === 'player'
        ? [{ q: origin.q + 1, r: origin.r }, { q: origin.q + 1, r: origin.r - 1 }]
        : [{ q: origin.q - 1, r: origin.r }, { q: origin.q - 1, r: origin.r + 1 }];

    return clearDirection
        .map(hex => axialToOffset(hex.q, hex.r))
        .map(offset => getCell(offset.x, offset.y))
        .filter(Boolean);
}

function isClearPressured(cell, team) {
    const opposingTeam = team === 'player' ? 'ai' : 'player';
    return getClearPressureCells(cell, team).some(pressureCell =>
        pressureCell.player && pressureCell.player.team === opposingTeam
    );
}

function isInClearFan(actorCell, targetCell, team) {
    const origin = offsetToAxial(actorCell.x, actorCell.y);
    const target = offsetToAxial(targetCell.x, targetCell.y);
    const dq = target.q - origin.q;
    const dr = target.r - origin.r;
    const forward = team === 'player' ? dq : -dq;
    if (forward < 3 || forward > 5) return false;

    const lateral = dr;
    const maxLateral = forward === 3 ? 1 : 2;
    return Math.abs(lateral) <= maxLateral;
}

function hasAdjacentLineBlockingOpponent(actorCell, targetCell, team) {
    const opposingTeam = team === 'player' ? 'ai' : 'player';
    const lineCells = getHexLine(actorCell.x, actorCell.y, targetCell.x, targetCell.y);
    return getAdjacentCells(actorCell.x, actorCell.y).some(adjacent =>
        adjacent.player &&
        adjacent.player.team === opposingTeam &&
        lineCells.some(lineCell => lineCell.x === adjacent.x && lineCell.y === adjacent.y)
    );
}

function hasActingPlayerMoved(actorCell) {
    const commandState = gameState.commandActivation;
    return !!(commandState && actorCell?.player && commandState.movedPlayerIds.includes(actorCell.player.id));
}

function isOnsidePassTarget(targetCell, team) {
    const defendingTeam = team === 'player' ? 'ai' : 'player';
    const defenders = gameState.field.filter(cell => cell.player && cell.player.team === defendingTeam);
    if (defenders.length === 0) return true;

    if (team === 'player') {
        const lastDefenderX = Math.max(...defenders.map(cell => cell.x));
        return targetCell.x <= lastDefenderX + 1;
    }

    const lastDefenderX = Math.min(...defenders.map(cell => cell.x));
    return targetCell.x >= lastDefenderX - 1;
}

function isValidCommandActionTarget(action, actorCell, targetCell) {
    const team = gameState.currentTurn;
    const opposingTeam = team === 'player' ? 'ai' : 'player';

    if (action.startsWith('mark')) {
        return getAdjacentCells(actorCell.x, actorCell.y).some(cell => cell.x === targetCell.x && cell.y === targetCell.y);
    }
    if (action === 'tackle') {
        return targetCell.ball && targetCell.player && targetCell.player.team === opposingTeam && distance(actorCell.x, actorCell.y, targetCell.x, targetCell.y) <= 1;
    }
    if (['pass lane', 'pass inside', 'pass outside'].includes(action)) {
        if (!actorCell.ball) return false;
        if (isAirborneBallCell(actorCell)) return false;
        if (!targetCell.player || targetCell.player.team !== team || targetCell === actorCell) return false;
        const targetZones = getPitchZones(targetCell, team);
        const allowedLanes = getPassTargetLanes(action, actorCell);
        const allowedThirds = getPassTargetThirds(action, actorCell);
        return allowedLanes.some(lane => targetZones.lanes.includes(lane)) &&
            allowedThirds.includes(targetZones.third) &&
            isOnsidePassTarget(targetCell, team);
    }
    if (action === 'cross') {
        if (!actorCell.ball || isAirborneBallCell(actorCell)) return false;
        if (targetCell.player || targetCell.ball) return false;
        const actorZones = getPitchZones(actorCell, team);
        if (actorZones.lanes.includes('center')) return false;
        const targetZones = getPitchZones(targetCell, team);
        if (!targetZones.lanes.includes('center')) return false;
        if (targetZones.third !== actorZones.third) return false;
        return !hasAdjacentLineBlockingOpponent(actorCell, targetCell, team);
    }
    if (action === 'dribble') {
        if (!actorCell.ball) return false;
        if (isAirborneBallCell(actorCell)) return false;
        if (targetCell.player) return false;
        if (distance(actorCell.x, actorCell.y, targetCell.x, targetCell.y) > 1) return false;
        return isMarkedByTeam(targetCell, opposingTeam);
    }
    if (action === 'clear') {
        if (!actorCell.ball) return false;
        if (isAirborneBallCell(actorCell)) return false;
        if (isClearPressured(actorCell, team)) return false;
        return isInClearFan(actorCell, targetCell, team);
    }
    if (action === 'header') {
        return isAirborneBallCell(targetCell) &&
            distance(actorCell.x, actorCell.y, targetCell.x, targetCell.y) <= 1 &&
            !hasActingPlayerMoved(actorCell);
    }
    if (action === 'shoot') {
        if (!actorCell.ball) return false;
        if (isAirborneBallCell(actorCell)) return false;
        const goalX = team === 'player' ? 16 : 0;
        return targetCell.x === goalX && targetCell.y >= 5 && targetCell.y <= 7;
    }
    return false;
}

function resolveCommandActionTarget(targetCell) {
    const card = gameState.selectedCard;
    const actorCell = gameState.selectedPlayer;
    const action = gameState.commandActivation.action;
    const team = gameState.currentTurn;

    if (action.startsWith('mark')) {
        const count = parseInt(action.split(' ')[1], 10) || 2;
        const alreadySelected = gameState.selectedMarkCells.some(cell => cell.x === targetCell.x && cell.y === targetCell.y);
        if (alreadySelected) {
            gameState.selectedMarkCells = gameState.selectedMarkCells.filter(cell => !(cell.x === targetCell.x && cell.y === targetCell.y));
        } else if (gameState.selectedMarkCells.length < count) {
            gameState.selectedMarkCells.push(targetCell);
        }
        if (gameState.selectedMarkCells.length >= count) {
            applyCommandMark(card, actorCell, gameState.selectedMarkCells);
        } else {
            render();
        }
        return;
    }

    if (action === 'tackle') {
        executeCommandTackle(actorCell, targetCell);
        completeCardPlay(card, team);
        return;
    }

    if (action === 'dribble') {
        removeMarkFromCell(targetCell, team === 'player' ? 'ai' : 'player');
        log(`Dribble: removed pressure from (${targetCell.x}, ${targetCell.y}).`);
        completeCardPlay(card, team);
        return;
    }

    if (['pass lane', 'pass inside', 'pass outside'].includes(action)) {
        executeZonePass(actorCell, targetCell);
        completeCardPlay(card, team);
        return;
    }

    if (action === 'cross') {
        executeCross(actorCell, targetCell);
        completeCardPlay(card, team);
        return;
    }

    if (action === 'clear') {
        executeClear(actorCell, targetCell);
        completeCardPlay(card, team);
        return;
    }

    if (action === 'header') {
        const scored = executeHeader(actorCell, targetCell);
        if (scored || gameState.goalKickPending || gameState.kickoffPending) return;
        completeCardPlay(card, team);
        return;
    }

    if (action === 'shoot') {
        const scored = executeZoneShot(actorCell, targetCell);
        if (scored || gameState.goalKickPending || gameState.kickoffPending) return;
        completeCardPlay(card, team);
    }
}

function applyCommandMark(card, defenderCell, zones) {
    gameState.defensiveMarks = gameState.defensiveMarks.filter(mark =>
        !(mark.team === gameState.currentTurn && mark.defender.x === defenderCell.x && mark.defender.y === defenderCell.y)
    );
    gameState.defensiveMarks.push({
        team: gameState.currentTurn,
        defender: { id: defenderCell.player.id, x: defenderCell.x, y: defenderCell.y },
        zones: zones.map(zone => ({ x: zone.x, y: zone.y })),
        source: gameState.commandActivation.action,
        createdStep: gameState.resolutionStep
    });
    log(`${card.name}: marked ${zones.length} hex${zones.length === 1 ? '' : 'es'}.`);
    completeCardPlay(card, gameState.currentTurn);
}

function removeMarkFromCell(cell, markingTeam) {
    gameState.defensiveMarks = gameState.defensiveMarks
        .map(mark => {
            if (mark.team !== markingTeam) return mark;
            return {
                ...mark,
                zones: mark.zones.filter(zone => !(zone.x === cell.x && zone.y === cell.y))
            };
        })
        .filter(mark => mark.zones.length > 0);
}

function countDefendersBetween(fromCell, toCell, defendingTeam) {
    return getHexLine(fromCell.x, fromCell.y, toCell.x, toCell.y)
        .filter(cell => cell.player && cell.player.team === defendingTeam)
        .length;
}

function getBlockedLineCells(fromCell, toCell, defendingTeam) {
    const blocked = new Map();
    getHexLine(fromCell.x, fromCell.y, toCell.x, toCell.y).forEach(cell => {
        if (cell.player && cell.player.team === defendingTeam) {
            blocked.set(`${cell.x},${cell.y}`, cell);
            return;
        }
        if (isMarkedByTeam(cell, defendingTeam)) {
            blocked.set(`${cell.x},${cell.y}`, cell);
        }
    });
    return [...blocked.values()];
}

function countMarkersOnCell(cell, markingTeam) {
    return gameState.defensiveMarks.filter(mark =>
        mark.team === markingTeam &&
        mark.zones.some(zone => zone.x === cell.x && zone.y === cell.y)
    ).length;
}

function rollD6Required(label, requiredRoll, modifier = 0, autoIfUnmodified = false) {
    const finalRequired = requiredRoll + modifier;
    if (autoIfUnmodified && modifier === 0) {
        log(`${label}: unimpeded, automatic success.`);
        return true;
    }
    if (finalRequired > 6) {
        log(`${label}: needs ${finalRequired}+ on d6. Automatic fail.`);
        return false;
    }
    const roll = Math.floor(Math.random() * 6) + 1;
    const success = roll >= finalRequired;
    log(`${label}: d6 ${roll}, needs ${finalRequired}+. ${success ? 'Success' : 'Fail'}.`);
    return success;
}

function rollD6Check(label, penalty) {
    return rollD6Required(label, 1, penalty, penalty === 0);
}

function executeZonePass(passerCell, targetCell) {
    const team = gameState.currentTurn;
    const defendingTeam = team === 'player' ? 'ai' : 'player';
    if (!isOnsidePassTarget(targetCell, team)) {
        log(`Offside: pass target at (${targetCell.x}, ${targetCell.y}) is beyond the last defender line.`);
        return;
    }
    const blockedCells = getBlockedLineCells(passerCell, targetCell, defendingTeam);
    if (rollD6Required('Pass', 1, blockedCells.length * 2, blockedCells.length === 0)) {
        clearAirborneBall();
        getCellWithBall().ball = false;
        targetCell.ball = true;
        setControlledPossession(targetCell.player.team);
        log(`Pass complete to (${targetCell.x}, ${targetCell.y}).`);
    } else {
        log('Pass failed. Ball stays with the passer for now.');
    }
}

function executeZoneShot(shooterCell, goalCell, options = {}) {
    const team = gameState.currentTurn;
    const defendingTeam = team === 'player' ? 'ai' : 'player';
    const blockedCells = getBlockedLineCells(shooterCell, goalCell, defendingTeam);
    const effectiveBlocks = Math.max(0, blockedCells.length - (options.ignoreBlocks || 0));
    const markers = countMarkersOnCell(shooterCell, defendingTeam);
    const cardPenalty = getShotRequiredRollModifier(gameState.selectedCard, shooterCell);
    const modifier = effectiveBlocks + markers + cardPenalty;
    if (rollD6Required(options.label || 'Shot', 5, modifier)) {
        if (team === 'player') gameState.playerScore++;
        else gameState.aiScore++;
        log(`${team === 'player' ? 'Player' : 'AI'} scores!`);
        restartAfterGoal(team);
        return true;
    } else {
        log('Shot saved/blocked. Goal kick CLEAR restart.');
        startGoalKickClear(defendingTeam, goalCell);
        return false;
    }
}

function executeCross(actorCell, targetCell) {
    const ballCell = getCellWithBall();
    if (ballCell) {
        ballCell.ball = false;
    }
    targetCell.ball = true;
    setLoosePossession(gameState.currentTurn);
    gameState.airborneBall = {
        x: targetCell.x,
        y: targetCell.y,
        crossingTeam: gameState.currentTurn,
        createdStep: gameState.resolutionStep
    };
    log(`Cross: airborne ball placed at (${targetCell.x}, ${targetCell.y}).`);
}

function getDefaultGoalCellForTeam(team) {
    return getCell(team === 'player' ? 16 : 0, 6);
}

function getDefaultClearTarget(actorCell, team) {
    const candidates = gameState.field
        .filter(cell => isInClearFan(actorCell, cell, team))
        .sort((a, b) => {
            const distanceDiff = distance(actorCell.x, actorCell.y, b.x, b.y) - distance(actorCell.x, actorCell.y, a.x, a.y);
            if (distanceDiff !== 0) return distanceDiff;
            return Math.abs(a.y - 6) - Math.abs(b.y - 6);
        });
    return candidates[0] || actorCell;
}

function executeHeader(actorCell, airborneCell) {
    const team = gameState.currentTurn;
    const isOffensiveHeader = gameState.resolvingRole === 'offense' || (!gameState.resolvingPlannedCard && team === gameState.offenseTeam);
    airborneCell.ball = false;
    clearAirborneBall();

    if (isOffensiveHeader) {
        actorCell.ball = true;
        const goalCell = getDefaultGoalCellForTeam(team);
        log(`Header: attacking header toward goal.`);
        return executeZoneShot(actorCell, goalCell, { ignoreBlocks: 1, label: 'Header shot' });
    }

    actorCell.ball = true;
    const clearTarget = getDefaultClearTarget(actorCell, team);
    log(`Header: defensive header clears the airborne ball.`);
    executeClear(actorCell, clearTarget);
    return false;
}

function executeClear(actorCell, targetCell) {
    const ballCell = getCellWithBall();
    if (ballCell) {
        ballCell.ball = false;
    }
    clearAirborneBall();

    targetCell.ball = true;
    if (targetCell.player) {
        setControlledPossession(targetCell.player.team);
        log(`Clear controlled: ${targetCell.player.team === 'player' ? 'Blue' : 'Red'} player at (${targetCell.x}, ${targetCell.y}) gains possession.`);
    } else {
        setLoosePossession(gameState.goalKickPending ? gameState.currentTurn : gameState.offenseTeam);
        log(`Clear to open space: ball is uncontrolled at (${targetCell.x}, ${targetCell.y}).`);
    }
}

function executePressTackle(card, targetCell) {
    const team = gameState.currentTurn;
    const effect = getActiveCardEffect(card, team);
    const ballCell = getCellWithBall();

    if (!ballCell) {
        log('No ball carrier to press!');
        return;
    }

    if (targetCell !== ballCell) {
        movePlayer(gameState.selectedPlayer, targetCell);
        log(`${effect.name}: moved defender to (${targetCell.x}, ${targetCell.y})`);
    }

    const tackler = targetCell === ballCell ? gameState.selectedPlayer : targetCell;
    if (distance(tackler.x, tackler.y, ballCell.x, ballCell.y) > 1) {
        log(`${effect.name}: defender is not close enough to tackle.`);
    } else {
        stealBall(tackler, effect.success);
    }
}

function playCard(card, team = 'player') {
    if (gameState.gamePhase === 'planning_offense' || gameState.gamePhase === 'planning_defense') {
        planCard(card, team);
        return;
    }

    if (gameState.kickoffPending || gameState.goalKickPending) {
        log(gameState.kickoffPending
            ? 'Kickoff must be a free medium pass before any other action.'
            : 'Goal kick must be a free long pass to a teammate before any other action.');
        return;
    }

    if (gameState.actionsRemaining <= 0 && card.type !== CARD_TYPES.ECONOMY) {
        log('No actions remaining!');
        return;
    }
    
    const effect = getActiveCardEffect(card, team);
    const display = getCardDisplay(card, team);
    
    // Economy cards execute immediately
    if (card.type === CARD_TYPES.ECONOMY) {
        gameState.coins += effect.amount;
        log(`Played ${card.name}: +${effect.amount} coins`);
        discardCard(card, team);
        render();
        return;
    }
    
    // Coach cards stay in play
    if (card.type === CARD_TYPES.COACH) {
        const activeCoach = team === 'player' ? gameState.playerCoach : gameState.aiCoach;
        const coachUsed = team === 'player' ? gameState.playerCoachUsed : gameState.aiCoachUsed;
        
        if (activeCoach && coachUsed) {
            log("Can't replace coach - you already used your coach ability this turn!");
            return;
        }
        
        if (activeCoach) {
            const discard = team === 'player' ? gameState.playerDiscard : gameState.aiDiscard;
            discard.push(activeCoach);
            log(`Discarded old coach: ${activeCoach.name}`);
        }
        
        const hand = team === 'player' ? gameState.playerHand : gameState.aiHand;
        const index = hand.findIndex(c => c.uid === card.uid);
        if (index !== -1) {
            hand.splice(index, 1);
        }
        
        if (team === 'player') {
            gameState.playerCoach = card;
            gameState.playerCoachUsed = false;
        } else {
            gameState.aiCoach = card;
            gameState.aiCoachUsed = false;
        }
        
        log(`Played coach: ${card.name}! Click the coach card to use its ability.`);
        render();
        return;
    }
    
    // Shot cards execute immediately
    if (effect.type === 'shoot') {
        shootAtGoal(effect.power);
        discardCard(card, team);
        render();
        return;
    }
    
    // Movement, pass, and defend cards need target selection
    gameState.selectedCard = card;
    gameState.selectedPlayer = null;
    gameState.selectedMarkCells = [];
    gameState.multiMove = effect.type === 'move' ? {
        remaining: 2,
        movedPlayerIds: []
    } : null;
    gameState.commandActivation = effect.type === 'command' ? {
        phase: 'select',
        selectedPlayers: [],
        movedPlayerIds: [],
        actingPlayerId: null
    } : null;
    gameState.pendingMoveMark = null;
    if (effect.type === 'command') {
        log(`Selected ${display.name}. Choose eligible players to activate, then move them up to ${effect.moveRange}.`);
    } else {
        log(effect.type === 'move' ? `Selected ${display.name}. Move up to 2 players.` : `Selected ${display.name}. Choose a target.`);
    }
    render();
}

function useCoachAbility(team = 'player') {
    const coach = team === 'player' ? gameState.playerCoach : gameState.aiCoach;
    const coachUsed = team === 'player' ? gameState.playerCoachUsed : gameState.aiCoachUsed;
    
    if (!coach) {
        log('No coach in play!');
        return;
    }
    
    if (coachUsed) {
        log('Coach ability already used this turn!');
        return;
    }
    
    const ability = coach.effect.ability;
    
    if (ability === 'free_lightning_sprint') {
        log(`⚡ ${coach.name}: Free Lightning Sprint! Move up to 2 players (no action cost).`);
        
        const freeMoveCard = {
            id: 'free_lightning_sprint',
            name: 'Lightning Sprint (Free)',
            type: CARD_TYPES.MOVEMENT,
            cost: 0,
            description: 'Move up to 2 players up to 4 spaces each (free action)',
            effect: { type: 'move', range: 4 },
            isFreeAction: true,
            uid: generateId()
        };
        
        gameState.selectedCard = freeMoveCard;
        gameState.selectedPlayer = null;
        gameState.multiMove = {
            remaining: 2,
            movedPlayerIds: []
        };
        
        if (team === 'player') {
            gameState.playerCoachUsed = true;
        } else {
            gameState.aiCoachUsed = true;
        }
        
        render();
        
    } else if (ability === 'extra_action') {
        gameState.actionsRemaining++;
        log(`⚡ ${coach.name}: +1 action! (${gameState.actionsRemaining} actions available)`);
        
        if (team === 'player') {
            gameState.playerCoachUsed = true;
        } else {
            gameState.aiCoachUsed = true;
        }
        
        render();
    }
}

function executeCardEffect(card, targetCell) {
    const effect = getActiveCardEffect(card, gameState.currentTurn);
    const team = gameState.currentTurn;
    let shouldComplete = true;
    
    switch (effect.type) {
        case 'move':
            const movedPlayerId = gameState.selectedPlayer.player.id;
            movePlayer(gameState.selectedPlayer, targetCell);
            log(`Moved player to (${targetCell.x}, ${targetCell.y})`);
            if (gameState.multiMove) {
                gameState.multiMove.remaining--;
                gameState.multiMove.movedPlayerIds.push(movedPlayerId);
                gameState.selectedPlayer = null;
                if (gameState.multiMove.remaining > 0) {
                    log(`Movement card has ${gameState.multiMove.remaining} move remaining. Choose another player or finish movement.`);
                    render();
                    shouldComplete = false;
                }
            }
            break;
            
        case 'pass':
            passBall(targetCell);
            break;
            
        case 'shoot':
            shootAtGoal(effect.power);
            break;
            
        case 'defend':
            stealBall(targetCell, effect.success);
            break;

        case 'press_tackle':
            executePressTackle(card, targetCell);
            break;
            
        case 'combo':
            shouldComplete = executeComboAction(card, targetCell) !== false;
            break;
    }
    
    if (shouldComplete) {
        completeCardPlay(card, team);
    }
}

function movePlayer(fromCell, toCell) {
    toCell.player = fromCell.player;
    if (fromCell.ball) {
        toCell.ball = true;
        fromCell.ball = false;
        setControlledPossession(toCell.player.team);
    }
    fromCell.player = null;
}

function executeComboAction(card, targetCell) {
    const actions = card.effect.actions;
    
    const firstAction = actions[0];
    const [moveType, moveRange] = firstAction.split(':');
    
    movePlayer(gameState.selectedPlayer, targetCell);
    log(`Moved player to (${targetCell.x}, ${targetCell.y})`);
    
    const secondAction = actions[1];
    const actionParts = secondAction.split(':');
    const actionType = actionParts[0];
    
    if (actionType === 'shoot') {
        const power = parseFloat(actionParts[1]);
        log(`🎯 Rush Attack! Shooting with ${(power * 100).toFixed(0)}% power...`);
        shootAtGoal(power);
    } else if (actionType === 'pass') {
        const passRange = parseInt(actionParts[1]);
        const passAccuracy = parseFloat(actionParts[2] || '1.0');
        
        gameState.comboPassPending = {
            range: passRange,
            accuracy: passAccuracy,
            card: card
        };
        log(`🎯 Playmaker! Now select a pass target (range: ${passRange} spaces)...`);
        render();
        return false;
    }

    return true;
}

function passBall(targetCell) {
    const ballCell = getCellWithBall();
    const passingTeam = ballCell.player ? ballCell.player.team : gameState.currentTurn;
    const opposingTeam = passingTeam === 'player' ? 'ai' : 'player';
    
    executePass(targetCell, passingTeam, opposingTeam);
}

function executePass(targetCell, passingTeam, opposingTeam) {
    const ballCell = getCellWithBall();
    if (!ballCell) {
        log('No ball to pass.');
        return;
    }

    const blockedCells = getBlockedLineCells(ballCell, targetCell, opposingTeam);
    const passLabel = `Pass from (${ballCell.x},${ballCell.y}) to (${targetCell.x},${targetCell.y})`;

    if (rollD6Required(passLabel, 1, blockedCells.length * 2, blockedCells.length === 0)) {
        clearAirborneBall();
        ballCell.ball = false;
        targetCell.ball = true;
        if (targetCell.player) {
            setControlledPossession(targetCell.player.team);
        } else {
            setLoosePossession(passingTeam);
        }
        log(`Pass complete to (${targetCell.x}, ${targetCell.y}).`);
    } else {
        log('Pass failed. Ball stays with the passer for now.');
    }
}

function handleOutOfBounds(teamThatLostBall) {
    const opposingTeam = teamThatLostBall === 'player' ? 'ai' : 'player';
    
    const startX = opposingTeam === 'player' ? 2 : 6;
    const startY = 3;
    const throwInCell = getCell(startX, startY);
    
    if (throwInCell) {
        throwInCell.ball = true;
    }
    
    gameState.currentTurn = opposingTeam;
    
    const hand = teamThatLostBall === 'player' ? gameState.playerHand : gameState.aiHand;
    const discard = teamThatLostBall === 'player' ? gameState.playerDiscard : gameState.aiDiscard;
    discard.push(...hand);
    hand.length = 0;
    
    gameState.actionsRemaining = ACTIONS_PER_TURN;
    gameState.coins = 0;
    
    drawCards(opposingTeam, HAND_SIZE);
    
    log(`${opposingTeam === 'player' ? 'Your' : 'AI'} throw-in! Turn starts with possession.`);
    
    if (opposingTeam === 'ai') {
        render();
        setTimeout(aiTakeTurn, 1000);
    } else {
        render();
    }
}

function getRandomNearbyCell(centerCell, maxDistance) {
    const candidates = [];
    
    for (let x = 0; x < FIELD_WIDTH; x++) {
        const colHeight = getColumnHeight(x);
        for (let y = 0; y < colHeight; y++) {
            const cell = getCell(x, y);
            if (cell && !cell.player) {
                const dist = distance(centerCell.x, centerCell.y, x, y);
                if (dist > 0 && dist <= maxDistance) {
                    candidates.push(cell);
                }
            }
        }
    }
    
    if (candidates.length > 0) {
        return candidates[Math.floor(Math.random() * candidates.length)];
    }
    
    return null;
}

function shootAtGoal(power) {
    const ballCell = getCellWithBall();
    const team = gameState.currentTurn;
    
    if (!ballCell) {
        log('No ball to shoot!');
        return;
    }
    
    if (!ballCell.player || ballCell.player.team !== team) {
        log('You need to have the ball to shoot!');
        return;
    }
    
    const goalX = team === 'player' ? 16 : 0;
    const dist = Math.abs(ballCell.x - goalX);
    const opposingTeam = team === 'player' ? 'ai' : 'player';
    
    if (dist > 4) {
        log('Too far from goal!');
        return;
    }
    
    const targetGoalY = 6;
    const shotLine = getHexLine(ballCell.x, ballCell.y, goalX, targetGoalY);
    const shotDistance = distance(ballCell.x, ballCell.y, goalX, targetGoalY);
    
    log(`📊 Shot from (${ballCell.x},${ballCell.y}) to goal at x=${goalX}: Distance=${dist} hexes`);
    log(`📊 Shot line covers ${shotLine.length} hexes to goal center`);
    
    for (const cell of shotLine) {
        const threat = getDefensiveThreat(cell, opposingTeam);
        if (threat) {
            const defenderCell = threat.defenderCell;
            const threatCell = threat.threatCell;
            const defenderDistance = distance(ballCell.x, ballCell.y, threatCell.x, threatCell.y);
            
            const deflectionChance = Math.max(0, 0.20 - (defenderDistance - 1) * 0.05);
            const interceptionChance = Math.max(0, 0.15 - (defenderDistance - 1) * 0.05);
            
            const threatLabel = threat.marked ? `marked lane (${threatCell.x},${threatCell.y}) from defender at (${defenderCell.x},${defenderCell.y})` : `defender at (${defenderCell.x},${defenderCell.y})`;
            log(`🧑 ${threatLabel}, ${defenderDistance} hexes from shooter: Block=${(interceptionChance*100).toFixed(0)}%, Deflect=${(deflectionChance*100).toFixed(0)}%`);
            
            const roll = Math.random();
            let result = 'CLEAR';
            if (roll < interceptionChance) result = 'BLOCKED';
            else if (roll < (interceptionChance + deflectionChance)) result = 'DEFLECTED';
            log(`🎲 Defender roll: ${(roll*100).toFixed(1)}% = ${result}`);
            
            if (roll < interceptionChance) {
                ballCell.ball = false;
                defenderCell.ball = true;
                log(`🧔 BLOCKED! ${opposingTeam === 'player' ? 'Your' : 'AI'} defender blocked the shot!`);
                
                if (opposingTeam !== gameState.currentTurn) {
                    handleTurnover(opposingTeam, 'blocked shot');
                }
                return;
            } else if (roll < (interceptionChance + deflectionChance)) {
                const bounceDistance = Math.max(1, shotDistance - defenderDistance);
                const bouncedCell = getRandomNearbyCell(threatCell, bounceDistance);
                
                if (bouncedCell) {
                    ballCell.ball = false;
                    bouncedCell.ball = true;
                    log(`💫 Shot deflected! Ball bounced to (${bouncedCell.x}, ${bouncedCell.y})`);
                    
                    if (bouncedCell.player && bouncedCell.player.team === opposingTeam) {
                        log(`👍 ${opposingTeam === 'player' ? 'You' : 'AI'} recovered the deflection!`);
                        handleTurnover(opposingTeam, 'deflected shot to opponent');
                        return;
                    } else {
                        log(`⚽ Ball is loose! Turn ends.`);
                        gameState.actionsRemaining = 0;
                        return;
                    }
                } else {
                    ballCell.ball = false;
                    defenderCell.ball = true;
                    log(`💫 Shot deflected! Defender got the ball at (${defenderCell.x}, ${defenderCell.y})`);
                    
                    if (opposingTeam !== gameState.currentTurn) {
                        handleTurnover(opposingTeam, 'deflected shot to defender');
                        return;
                    }
                }
                
                gameState.actionsRemaining = 0;
                return;
            }
        }
    }
    
    const finalPower = power * (1 - dist * 0.1);
    
    log(`🎯 Shot power: ${(power*100).toFixed(0)}% base, ${(finalPower*100).toFixed(0)}% after distance penalty`);
    
    const shotRoll = Math.random();
    log(`🎲 Shot roll: ${(shotRoll*100).toFixed(1)}% (needs < ${(finalPower*100).toFixed(0)}%) = ${shotRoll < finalPower ? 'GOAL' : 'MISS'}`);
    
    if (shotRoll < finalPower) {
        if (team === 'player') {
            gameState.playerScore++;
            log('⚽ GOAL! Player scores!');
            resetField('ai');
        } else {
            gameState.aiScore++;
            log('AI scores!');
            resetField('player');
        }
        
        setTimeout(() => {
            endTurnAfterShot();
        }, 1000);
    } else {
        log('Shot missed!');
        ballCell.ball = false;
        
        const defendingTeam = team === 'player' ? 'ai' : 'player';
        
        const goalKickY = Math.random() < 0.5 ? 5 : 7;
        const goalKickCell = getCell(goalX, goalKickY);
        
        if (goalKickCell) {
            gameState.goalKickPending = true;
            goalKickCell.ball = true;
            log(`🥅 Goal kick! Ball at (${goalX}, ${goalKickY})`);
            
            const defenders = gameState.field.filter(cell =>
                cell.player && cell.player.team === defendingTeam
            );
            
            if (defenders.length > 0) {
                const defenderDistances = defenders.map(def => ({
                    cell: def,
                    dist: distance(def.x, def.y, goalX, goalKickY)
                }));
                
                defenderDistances.sort((a, b) => a.dist - b.dist);
                
                const minDist = defenderDistances[0].dist;
                const closestDefenders = defenderDistances.filter(d => d.dist === minDist);
                
                if (closestDefenders.length === 1) {
                    const defToMove = closestDefenders[0].cell;
                    defToMove.player = null;
                    goalKickCell.player = { team: defendingTeam, id: 1 };
                    log(`${defendingTeam === 'player' ? 'Your' : 'AI'} defender moved to collect the ball`);
                    
                    startRepositioning(team, defendingTeam);
                } else {
                    if (defendingTeam === 'player') {
                        log(`⚡ Choose which defender collects the ball!`);
                        startGoalKickSelection(closestDefenders, goalKickCell, team, defendingTeam);
                    } else {
                        const defToMove = closestDefenders[Math.floor(Math.random() * closestDefenders.length)].cell;
                        defToMove.player = null;
                        goalKickCell.player = { team: defendingTeam, id: 1 };
                        log(`AI defender moved to collect the ball`);
                        
                        startRepositioning(team, defendingTeam);
                    }
                }
            } else {
                startRepositioning(team, defendingTeam);
            }
        }
    }
}

function startGoalKickSelection(closestDefenders, goalKickCell, shootingTeam, defendingTeam) {
    gameState.gamePhase = 'goal_kick_selection';
    gameState.goalKickDefenders = closestDefenders;
    gameState.goalKickCell = goalKickCell;
    gameState.goalKickShootingTeam = shootingTeam;
    gameState.goalKickDefendingTeam = defendingTeam;
    render();
}

function selectGoalKickDefender(defenderCell) {
    const { goalKickCell, goalKickShootingTeam, goalKickDefendingTeam } = gameState;
    
    defenderCell.player = null;
    goalKickCell.player = { team: goalKickDefendingTeam, id: 1 };
    
    log(`Defender at (${defenderCell.x}, ${defenderCell.y}) moved to collect the ball`);
    
    gameState.gamePhase = 'action';
    gameState.goalKickDefenders = null;
    gameState.goalKickCell = null;
    gameState.goalKickShootingTeam = null;
    gameState.goalKickDefendingTeam = null;
    
    startRepositioning(goalKickShootingTeam, goalKickDefendingTeam);
}

function executeCommandTackle(tacklerCell, ballCarrierCell) {
    if (!tacklerCell || !tacklerCell.player || !ballCarrierCell || !ballCarrierCell.ball) return;
    const success = rollD6Required('Tackle', 4);
    if (success) {
        ballCarrierCell.ball = false;
        tacklerCell.ball = true;
        setControlledPossession(tacklerCell.player.team);
        log(`Tackle won: possession moves to (${tacklerCell.x}, ${tacklerCell.y}).`);
    } else {
        setPlayerOffBalance(tacklerCell.player.team, tacklerCell.player.id);
        log('Tackle missed: tackler is off balance until their next activation.');
    }
}

function stealBall(tacklerCell, successChance) {
    const ballCell = getCellWithBall();
    if (!ballCell || !tacklerCell || !tacklerCell.player) return;
    const requiredRoll = successChance >= 0.5 ? 4 : 5;
    const success = rollD6Required('Tackle', requiredRoll);

    if (success) {
        ballCell.ball = false;
        tacklerCell.ball = true;
        setControlledPossession(tacklerCell.player.team);
        log(`Ball stolen. Now at (${tacklerCell.x}, ${tacklerCell.y}).`);
    } else {
        setPlayerOffBalance(tacklerCell.player.team, tacklerCell.player.id);
        log('Tackle failed. Opponent keeps possession and tackler is off balance.');
    }
}

function placePlayer(team, id, x, y, hasBall = false) {
    const cell = getCell(x, y);
    if (!cell) return;

    cell.player = { team, id };
    cell.ball = hasBall;
}

function setupRestartFormation(teamWithBall = 'player') {
    gameState.field.forEach(cell => {
        cell.player = null;
        cell.ball = false;
    });
    gameState.defensiveMarks = [];
    gameState.offBalancePlayers = [];
    gameState.airborneBall = null;
    gameState.loosePossessionTeam = null;

    const attackingTeam = teamWithBall;
    const defendingTeam = teamWithBall === 'player' ? 'ai' : 'player';
    const attackingDirection = attackingTeam === 'player' ? 1 : -1;

    placePlayer(attackingTeam, 1, 8, 6, true);

    placePlayer(attackingTeam, 2, 8 - attackingDirection, 2);
    placePlayer(attackingTeam, 3, 8 - attackingDirection, 9);
    placePlayer(attackingTeam, 4, 8 - attackingDirection * 3, 4);
    placePlayer(attackingTeam, 5, 8 - attackingDirection * 3, 7);

    placePlayer(defendingTeam, 1, 8 + attackingDirection * 2, 4);
    placePlayer(defendingTeam, 2, 8 + attackingDirection * 2, 8);
    placePlayer(defendingTeam, 3, 8 + attackingDirection * 4, 2);
    placePlayer(defendingTeam, 4, 8 + attackingDirection * 4, 6);
    placePlayer(defendingTeam, 5, 8 + attackingDirection * 4, 10);
}

function resetField(teamWithBall = 'player') {
    setupRestartFormation(teamWithBall);
    startKickoffPass(teamWithBall);
    gameState.defensiveMarks = [];
    gameState.offBalancePlayers = [];
    gameState.airborneBall = null;
    gameState.loosePossessionTeam = null;
}

// ========================================
// BUY SYSTEM
// ========================================

function buyCard(card) {
    if (gameState.coins < card.cost) {
        log('Not enough coins!');
        return;
    }
    
    gameState.coins -= card.cost;
    gameState.playerDiscard.push({...card, uid: generateId()});
    
    const index = gameState.market.findIndex(c => c.uid === card.uid);
    if (index !== -1) {
        gameState.market.splice(index, 1);
        
        const newCard = drawMarketCard();
        if (newCard) {
            gameState.market.push(newCard);
            log(`Bought ${card.name}! (${gameState.marketDeck.length} cards left in market deck)`);
        } else {
            log(`Bought ${card.name}! Market deck is empty.`);
        }
    }
    
    render();
}

// ========================================
// DEFENSIVE REACTION (for long passes)
// ========================================

function startDefensiveReaction(defendingTeam) {
    gameState.gamePhase = 'defensive_reaction';
    gameState.repositionTeam = defendingTeam;
    gameState.repositionRange = 1;
    
    if (defendingTeam === 'ai') {
        log('AI defender reacts to long pass...');
        setTimeout(aiDefensiveReaction, 500);
    } else {
        log('⚡ Long pass detected! Move 1 defender up to 1 space to intercept.');
        render();
    }
}

function aiDefensiveReaction() {
    const ballCell = getCellWithBall();
    const targetCell = gameState.pendingPass.targetCell;
    
    const aiPlayers = gameState.field.filter(c => c.player && c.player.team === 'ai');
    const passLine = getHexLine(ballCell.x, ballCell.y, targetCell.x, targetCell.y);
    
    let bestPlayer = null;
    let bestDistance = Infinity;
    
    for (const player of aiPlayers) {
        for (const lineCell of passLine) {
            const dist = distance(player.x, player.y, lineCell.x, lineCell.y);
            if (dist < bestDistance) {
                bestDistance = dist;
                bestPlayer = player;
            }
        }
    }
    
    if (bestPlayer && passLine.length > 0) {
        const targets = getValidMoveTargets(bestPlayer, 1);
        const closerTargets = targets.filter(t => {
            const newDist = Math.min(...passLine.map(lc => distance(t.x, t.y, lc.x, lc.y)));
            const oldDist = Math.min(...passLine.map(lc => distance(bestPlayer.x, bestPlayer.y, lc.x, lc.y)));
            return newDist < oldDist;
        });
        
        if (closerTargets.length > 0) {
            movePlayer(bestPlayer, closerTargets[0]);
            log(`AI moved defender to (${closerTargets[0].x}, ${closerTargets[0].y})`);
        }
    }
    
    completeDefensiveReaction();
}

function completeDefensiveReaction() {
    gameState.gamePhase = 'action';
    const { targetCell, passingTeam, opposingTeam } = gameState.pendingPass;
    gameState.pendingPass = null;
    
    log('Executing pass...');
    setTimeout(() => {
        executePass(targetCell, passingTeam, opposingTeam);
    }, 300);
}

function reactiveDefenseMove(fromCell, toCell) {
    movePlayer(fromCell, toCell);
    log(`Defender moved to (${toCell.x}, ${toCell.y})`);
    completeDefensiveReaction();
}

// ========================================
// REPOSITIONING PHASE (after missed shots)
// ========================================

function startRepositioning(shootingTeam, defendingTeam) {
    gameState.gamePhase = 'reposition_shooter';
    gameState.repositionTeam = shootingTeam;
    gameState.repositionRange = 1;
    
    const shooters = gameState.field.filter(cell =>
        cell.player && cell.player.team === shootingTeam
    );
    gameState.repositionsRemaining = shooters.map(cell => ({
        x: cell.x,
        y: cell.y,
        moved: false
    }));
    
    if (shootingTeam === 'ai') {
        setTimeout(() => aiReposition(defendingTeam), 500);
    } else {
        log('Reposition your players (up to 1 space each). Click "End Repositioning" when done.');
        render();
    }
}

function aiReposition(defendingTeam) {
    gameState.repositionsRemaining.forEach(pos => {
        const cell = getCell(pos.x, pos.y);
        if (cell && cell.player) {
            const validMoves = getValidMoveTargets(cell, gameState.repositionRange);
            if (validMoves.length > 0) {
                const targetX = gameState.repositionTeam === 'ai' ? 0 : 16;
                const bestMove = validMoves.sort((a, b) =>
                    Math.abs(a.x - targetX) - Math.abs(b.x - targetX)
                )[0];
                movePlayer(cell, bestMove);
            }
        }
    });
    
    if (gameState.gamePhase === 'reposition_shooter') {
        startDefenderRepositioning(defendingTeam);
    } else {
        endRepositioning();
    }
}

function startDefenderRepositioning(defendingTeam) {
    gameState.gamePhase = 'reposition_defender';
    gameState.repositionTeam = defendingTeam;
    gameState.repositionRange = 2;
    
    const ballCell = getCellWithBall();
    const defenders = gameState.field.filter(cell =>
        cell.player &&
        cell.player.team === defendingTeam &&
        cell !== ballCell
    );
    gameState.repositionsRemaining = defenders.map(cell => ({
        x: cell.x,
        y: cell.y,
        moved: false
    }));
    
    if (defendingTeam === 'ai') {
        setTimeout(() => aiReposition(null), 500);
    } else {
        log('Reposition your defenders (up to 2 spaces each, except ball carrier). Click "End Repositioning" when done.');
        render();
    }
}

function endRepositioning() {
    gameState.gamePhase = 'action';
    gameState.repositionTeam = null;
    gameState.repositionRange = 0;
    gameState.repositionsRemaining = [];
    
    log('Repositioning complete. Turn ending...');
    
    setTimeout(() => {
        endTurnAfterShot();
    }, 500);
}

function endTurnAfterShot() {
    const shootingTeam = gameState.currentTurn;
    const shouldStartGoalKick = gameState.goalKickPending;
    
    const ballCell = getCellWithBall();
    if (ballCell && ballCell.player) {
        gameState.currentTurn = ballCell.player.team;
    } else {
        gameState.currentTurn = shootingTeam === 'player' ? 'ai' : 'player';
    }

    if (shouldStartGoalKick) {
        startGoalKickPass(gameState.currentTurn);
    } else if (!gameState.kickoffPending && getCellWithBall()?.x === 8 && getCellWithBall()?.y === 6) {
        startKickoffPass(gameState.currentTurn);
    }
    
    gameState.actionsRemaining = ACTIONS_PER_TURN;
    gameState.coins = 0;
    
    if (gameState.currentTurn === 'player') {
        gameState.playerCoachUsed = false;
    } else {
        gameState.aiCoachUsed = false;
    }
    
    const newHand = gameState.currentTurn === 'player' ? gameState.playerHand : gameState.aiHand;
    const cardsToDraw = HAND_SIZE - newHand.length;
    if (cardsToDraw > 0) {
        drawCards(gameState.currentTurn, cardsToDraw);
    }
    
    if (!gameState.goalKickPending) {
        log(`${gameState.currentTurn === 'player' ? 'Your' : 'AI'} turn starts with possession!`);
    }
    
    if (gameState.currentTurn === 'ai') {
        render();
        if (gameState.goalKickPending) {
            aiTakeGoalKickPass();
        } else {
            setTimeout(aiTakeTurn, 1000);
        }
    } else {
        render();
    }
}

function repositionPlayer(fromCell, toCell) {
    movePlayer(fromCell, toCell);
    
    const pos = gameState.repositionsRemaining.find(p => p.x === fromCell.x && p.y === fromCell.y);
    if (pos) pos.moved = true;
    
    render();
}

function endTurn() {
    if (gameState.kickoffPending || gameState.goalKickPending) {
        log(gameState.kickoffPending
            ? 'Kickoff must be a free medium pass before ending the turn.'
            : 'Goal kick must be a free long pass to a teammate before ending the turn.');
        return;
    }

    const currentTeam = gameState.currentTurn;
    const hand = currentTeam === 'player' ? gameState.playerHand : gameState.aiHand;
    
    const cardsToDraw = HAND_SIZE - hand.length;
    if (cardsToDraw > 0) {
        drawCards(currentTeam, cardsToDraw);
        log(`${currentTeam === 'player' ? 'You' : 'AI'} drew ${cardsToDraw} card${cardsToDraw > 1 ? 's' : ''} (${hand.length} cards in hand)`);
    } else {
        log(`${currentTeam === 'player' ? 'You' : 'AI'} kept ${hand.length} cards in hand`);
    }
    
    render();
    
    setTimeout(() => {
        if (currentTeam === 'player') {
            gameState.currentTurn = 'ai';
            clearDefensiveMarksForTeam('player');
            gameState.actionsRemaining = ACTIONS_PER_TURN;
            gameState.coins = 0;
            gameState.aiCoachUsed = false;
            log(gameState.manualControlMode ? '🔴 Red turn (Manual Control)' : 'Red turn started');
            render();
            
            if (!gameState.manualControlMode) {
                setTimeout(aiTakeTurn, 1000);
            }
        } else {
            gameState.currentTurn = 'player';
            clearDefensiveMarksForTeam('ai');
            gameState.actionsRemaining = ACTIONS_PER_TURN;
            gameState.coins = 0;
            gameState.playerCoachUsed = false;
            log(gameState.manualControlMode ? '🔵 Blue turn (Manual Control)' : 'Your turn!');
            render();
        }
    }, 800);
}

function handleTurnover(newPossessionTeam, reason) {
    log(`⚡ TURNOVER! ${newPossessionTeam === 'player' ? 'You' : 'AI'} gained possession - ${reason}`);
    
    gameState.currentTurn = newPossessionTeam;
    gameState.actionsRemaining = ACTIONS_PER_TURN;
    gameState.coins = 0;
    
    if (newPossessionTeam === 'player') {
        gameState.playerCoachUsed = false;
    } else {
        gameState.aiCoachUsed = false;
    }
    
    const newHand = newPossessionTeam === 'player' ? gameState.playerHand : gameState.aiHand;
    const cardsToDraw = HAND_SIZE - newHand.length;
    if (cardsToDraw > 0) {
        drawCards(newPossessionTeam, cardsToDraw);
    }
    
    if (newPossessionTeam === 'ai') {
        log('AI turn started');
        render();
        setTimeout(aiTakeTurn, 1000);
    } else {
        log('Your turn!');
        render();
    }
}

function getCommandActionLabel(card, third, action) {
    return card.command.actionLabels?.[`${third}.${action}`] || action;
}
