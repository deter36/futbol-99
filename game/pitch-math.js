/*
 * pitch-math.js — How hexagons connect, neighbor logic, distance
 * The hex grid math that makes the field work: figuring out which
 * cells are next to each other, how far apart two cells are,
 * pathfinding for movement costs, and line-of-sight for passes.
 */

function getCell(x, y) {
    return gameState.field.find(cell => cell.x === x && cell.y === y);
}

function getCellWithPlayer(team, playerId) {
    return gameState.field.find(cell =>
        cell.player && cell.player.team === team && cell.player.id === playerId
    );
}

function getCellWithBall() {
    return gameState.field.find(cell => cell.ball);
}

function isAirborneBallCell(cell) {
    return !!(gameState.airborneBall && cell &&
        gameState.airborneBall.x === cell.x &&
        gameState.airborneBall.y === cell.y);
}

function clearAirborneBall() {
    gameState.airborneBall = null;
}

function setControlledPossession(team) {
    gameState.loosePossessionTeam = null;
    if (team) {
        gameState.currentTurn = team;
    }
}

function setLoosePossession(team) {
    gameState.loosePossessionTeam = team || gameState.offenseTeam || gameState.currentTurn;
}

function distance(x1, y1, x2, y2) {
    // Hexagonal distance calculation for flat-top hexes (odd-q offset)
    // Convert to axial coordinates for proper hex distance
    const q1 = x1;
    const r1 = y1 - (x1 - (x1 & 1)) / 2;
    const q2 = x2;
    const r2 = y2 - (x2 - (x2 & 1)) / 2;
    
    return (Math.abs(q1 - q2) + Math.abs(q1 + r1 - q2 - r2) + Math.abs(r1 - r2)) / 2;
}

function getColumnHeight(x) {
    return x % 2 === 0 ? FIELD_HEIGHT : FIELD_HEIGHT - 1;
}

function getPitchZones(cell, perspectiveTeam = 'player') {
    let third = cell.x <= 5 ? 'defensive' : cell.x <= 10 ? 'midfield' : 'attacking';
    if (perspectiveTeam === 'ai') {
        if (third === 'defensive') third = 'attacking';
        else if (third === 'attacking') third = 'defensive';
    }
    const shortColumn = cell.x % 2 === 1;
    let lane = cell.y <= 3 ? 'left' : cell.y <= 8 ? 'center' : 'right';
    let laneLabel = lane;
    let lanes = [lane];

    if (shortColumn && cell.y === 3) {
        lane = 'left';
        laneLabel = 'left/center';
        lanes = ['left', 'center'];
    } else if (shortColumn && cell.y === 8) {
        lane = 'center';
        laneLabel = 'center/right';
        lanes = ['center', 'right'];
    }

    return {
        third,
        lane,
        lanes,
        laneLabel
    };
}

function teamHasBall(team) {
    const ballCell = getCellWithBall();
    if (isAirborneBallCell(ballCell)) return false;
    return !!(ballCell && ballCell.player && ballCell.player.team === team);
}

function getActiveCardEffect(card, team = gameState.currentTurn) {
    if (card.defenseEffect && !teamHasBall(team)) {
        return card.defenseEffect;
    }
    return card.effect;
}

function getCardDisplay(card, team = null) {
    const isDefense = team && card.defenseEffect && !teamHasBall(team);
    if (!isDefense) {
        return {
            name: card.name,
            type: card.type,
            description: card.description,
            isDefense: false
        };
    }

    return {
        name: card.defenseEffect.name,
        type: 'defense',
        description: card.defenseEffect.description,
        isDefense: true
    };
}

function getCardSideState(card, team = null) {
    if (!team || !card.defenseEffect) {
        return 'offense';
    }
    return teamHasBall(team) ? 'offense' : 'defense';
}

function clearDefensiveMarksForTeam(team) {
    gameState.defensiveMarks = gameState.defensiveMarks.filter(mark => mark.team !== team);
}

function expireDefensiveMarks() {
    gameState.defensiveMarks = gameState.defensiveMarks.filter(mark =>
        gameState.resolutionStep <= (mark.createdStep || 0) + 2
    );
}

function clearMarksForActivatedPlayer(team, playerId) {
    gameState.defensiveMarks = gameState.defensiveMarks.filter(mark =>
        !(mark.team === team && mark.defender.id === playerId && gameState.resolutionStep > (mark.createdStep || 0))
    );
}

function generateId() {
    return Math.random().toString(36).substr(2, 9);
}

function shuffleDeck(deck) {
    for (let i = deck.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [deck[i], deck[j]] = [deck[j], deck[i]];
    }
}

function drawCards(team, count) {
    const deck = team === 'player' ? gameState.playerDeck : gameState.aiDeck;
    const hand = team === 'player' ? gameState.playerHand : gameState.aiHand;
    const discard = team === 'player' ? gameState.playerDiscard : gameState.aiDiscard;
    
    for (let i = 0; i < count; i++) {
        if (deck.length === 0) {
            deck.push(...discard);
            discard.length = 0;
            shuffleDeck(deck);
        }
        
        if (deck.length > 0) {
            hand.push(deck.pop());
        }
    }
}

// Convert offset coordinates to axial for hex math
function offsetToAxial(x, y) {
    const q = x;
    const r = y - (x - (x & 1)) / 2;
    return { q, r };
}

function axialToOffset(q, r) {
    const x = q;
    const y = r + (q - (q & 1)) / 2;
    return { x, y };
}

// Get all hexes along line from start to end
function getHexLine(x1, y1, x2, y2) {
    const start = offsetToAxial(x1, y1);
    const end = offsetToAxial(x2, y2);
    
    const dist = Math.max(
        Math.abs(start.q - end.q),
        Math.abs(start.r - end.r),
        Math.abs(start.q + start.r - end.q - end.r)
    );
    
    const hexes = [];
    
    for (let i = 0; i <= dist; i++) {
        const t = dist === 0 ? 0 : i / dist;
        const q = Math.round(start.q + (end.q - start.q) * t);
        const r = Math.round(start.r + (end.r - start.r) * t);
        const offset = axialToOffset(q, r);
        
        // Skip start and end hexes
        if (i > 0 && i < dist) {
            const cell = getCell(offset.x, offset.y);
            if (cell) {
                hexes.push(cell);
            }
        }
    }
    
    return hexes;
}

function getAdjacentCells(x, y) {
    // Hexagonal grid adjacency (odd-q offset coordinates for flat-top hexes)
    const cells = [];
    const isOddCol = x % 2 === 1;
    
    // All columns have these 4 directions
    if (x > 0) cells.push(getCell(x - 1, y)); // W
    if (x < FIELD_WIDTH - 1) cells.push(getCell(x + 1, y)); // E
    if (y > 0) cells.push(getCell(x, y - 1)); // N
    if (y < FIELD_HEIGHT - 1) cells.push(getCell(x, y + 1)); // S
    
    // Diagonal neighbors depend on odd/even column
    if (isOddCol) {
        // Odd columns: SW and SE are offset down
        if (x > 0 && y < FIELD_HEIGHT - 1) cells.push(getCell(x - 1, y + 1)); // SW
        if (x < FIELD_WIDTH - 1 && y < FIELD_HEIGHT - 1) cells.push(getCell(x + 1, y + 1)); // SE
    } else {
        // Even columns: NW and NE are offset up
        if (x > 0 && y > 0) cells.push(getCell(x - 1, y - 1)); // NW
        if (x < FIELD_WIDTH - 1 && y > 0) cells.push(getCell(x + 1, y - 1)); // NE
    }
    
    return cells.filter(c => c);
}

function getMarkedThreat(cell, defendingTeam) {
    for (const mark of gameState.defensiveMarks) {
        if (mark.team !== defendingTeam) continue;

        const defenderCell = mark.defender.id
            ? getCellWithPlayer(defendingTeam, mark.defender.id)
            : getCell(mark.defender.x, mark.defender.y);
        if (!defenderCell || !defenderCell.player || defenderCell.player.team !== defendingTeam) continue;

        const coversCell = mark.zones.some(zone => zone.x === cell.x && zone.y === cell.y);
        if (coversCell) {
            return {
                defenderCell,
                threatCell: cell,
                marked: true
            };
        }
    }

    return null;
}

function getDefensiveThreat(cell, defendingTeam) {
    if (cell.player && cell.player.team === defendingTeam) {
        return {
            defenderCell: cell,
            threatCell: cell,
            marked: false
        };
    }

    return getMarkedThreat(cell, defendingTeam);
}

function isMarkedByTeam(cell, markingTeam) {
    return !!getMarkedThreat(cell, markingTeam);
}

function getPlayerStateKey(team, playerId) {
    return `${team}:${playerId}`;
}

function isPlayerOffBalance(team, playerId) {
    const key = getPlayerStateKey(team, playerId);
    return gameState.offBalancePlayers.some(entry =>
        typeof entry === 'string' ? entry === key : entry.key === key
    );
}

function setPlayerOffBalance(team, playerId) {
    const key = getPlayerStateKey(team, playerId);
    if (!isPlayerOffBalance(team, playerId)) {
        gameState.offBalancePlayers.push({
            key,
            team,
            playerId,
            createdStep: gameState.resolutionStep
        });
    }
}

function clearPlayerOffBalance(team, playerId) {
    const key = getPlayerStateKey(team, playerId);
    gameState.offBalancePlayers = gameState.offBalancePlayers.filter(entry =>
        typeof entry === 'string' ? entry !== key : entry.key !== key
    );
}

function clearExpiredOffBalanceForTeam(team) {
    gameState.offBalancePlayers = gameState.offBalancePlayers.filter(entry => {
        const entryTeam = typeof entry === 'string' ? entry.split(':')[0] : entry.team;
        const createdStep = typeof entry === 'string' ? -1 : entry.createdStep;
        return !(entryTeam === team && createdStep < gameState.resolutionStep);
    });
}

function getMovementCostDistance(fromCell, toCell, movingTeam) {
    const markingTeam = movingTeam === 'player' ? 'ai' : 'player';
    const startKey = `${fromCell.x},${fromCell.y}`;
    const targetKey = `${toCell.x},${toCell.y}`;
    const costs = new Map([[startKey, 0]]);
    const queue = [fromCell];

    while (queue.length > 0) {
        queue.sort((a, b) => costs.get(`${a.x},${a.y}`) - costs.get(`${b.x},${b.y}`));
        const current = queue.shift();
        const currentKey = `${current.x},${current.y}`;
        const currentCost = costs.get(currentKey);
        if (currentKey === targetKey) return currentCost;

        getAdjacentCells(current.x, current.y).forEach(next => {
            if (next.player && next !== toCell) return;
            const stepCost = isMarkedByTeam(current, markingTeam) ? 2 : 1;
            const nextCost = currentCost + stepCost;
            const nextKey = `${next.x},${next.y}`;
            if (!costs.has(nextKey) || nextCost < costs.get(nextKey)) {
                costs.set(nextKey, nextCost);
                queue.push(next);
            }
        });
    }

    return Infinity;
}

function getValidMoveTargets(fromCell, range) {
    const targets = [];
    for (let x = 0; x < FIELD_WIDTH; x++) {
        const colHeight = getColumnHeight(x);
        for (let y = 0; y < colHeight; y++) {
            const cell = getCell(x, y);
            if (cell && !cell.player && distance(fromCell.x, fromCell.y, x, y) <= range) {
                targets.push(cell);
            }
        }
    }
    return targets;
}

function log(message) {
    const logElement = document.getElementById('game-log');
    const p = document.createElement('p');
    p.textContent = message;
    logElement.insertBefore(p, logElement.firstChild);
    
    while (logElement.children.length > 20) {
        logElement.removeChild(logElement.lastChild);
    }
}
