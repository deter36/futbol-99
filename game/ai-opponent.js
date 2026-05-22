/*
 * ai-opponent.js — How the computer decides what to do
 * All the logic for the AI player: picking which cards to play,
 * deciding where to move, when to pass or shoot, and buying from
 * the market. The AI uses a simple priority system (shoot > move
 * toward goal > pass forward > move toward ball).
 */

function aiTakeTurn() {
    log('🤖 AI is thinking...');

    if (gameState.kickoffPending && gameState.currentTurn === 'ai') {
        aiTakeKickoffPass();
    } else if (gameState.goalKickPending && gameState.currentTurn === 'ai') {
        aiTakeGoalKickPass();
    }

    gameState.aiPhase = 'playing_economy';
    gameState.aiActionQueue = [];
    
    if (gameState.aiDebugMode) {
        prepareAIActions();
        render();
    } else {
        executeAllAIActions();
    }
}

function prepareAIActions() {
    const economyCards = gameState.aiHand.filter(c => c.type === CARD_TYPES.ECONOMY);
    economyCards.forEach(card => {
        gameState.aiActionQueue.push({ type: 'economy', card });
    });
    
    gameState.aiActionQueue.push({ type: 'plan_action' });
    
    log(`🎯 AI ready. Click "Next AI Action" to execute.`);
}

function executeNextAIAction() {
    if (gameState.aiActionQueue.length === 0) {
        log('❌ No AI actions queued');
        return;
    }
    
    const action = gameState.aiActionQueue.shift();
    
    if (action.type === 'end_turn') {
        log('✅ AI ending turn');
        gameState.aiPhase = 'idle';
        setTimeout(endTurn, 500);
        return;
    }
    
    if (action.type === 'plan_action') {
        if (gameState.actionsRemaining > 0) {
            const nextAction = planNextAction();
            if (nextAction) {
                gameState.aiActionQueue.unshift(nextAction);
                gameState.aiActionQueue.push({ type: 'plan_action' });
            } else {
                const buyActions = planAIBuys();
                gameState.aiActionQueue.push(...buyActions);
                gameState.aiActionQueue.push({ type: 'end_turn' });
            }
        } else {
            const buyActions = planAIBuys();
            gameState.aiActionQueue.push(...buyActions);
            gameState.aiActionQueue.push({ type: 'end_turn' });
        }
        render();
        return;
    }
    
    if (action.type === 'economy') {
        log(`💰 AI plays ${action.card.name}`);
        playCard(action.card, 'ai');
    } else if (action.type === 'buy') {
        executeBuyAction(action);
    } else {
        executeAIAction(action);
    }
    
    render();
}

function executeAllAIActions() {
    const economyCards = gameState.aiHand.filter(c => c.type === CARD_TYPES.ECONOMY);
    economyCards.forEach(card => {
        playCard(card, 'ai');
    });
    
    let actionsUsed = 0;
    while (actionsUsed < ACTIONS_PER_TURN && gameState.aiHand.length > 0) {
        const action = planNextAction();
        if (!action) break;
        if (executeAIAction(action)) {
            actionsUsed++;
        } else {
            break;
        }
    }
    
    aiBuyCards();
    log('AI ending turn');
    setTimeout(endTurn, 1000);
}

function planNextAction() {
    const ballCell = getCellWithBall();
    const aiHasBall = ballCell && ballCell.player && ballCell.player.team === 'ai';
    
    // Priority 1: SHOOT if close to goal with ball
    if (aiHasBall) {
        const distToGoal = ballCell.x;
        const shotCards = gameState.aiHand.filter(c => c.type === CARD_TYPES.SHOT);
        
        if (distToGoal <= 4 && shotCards.length > 0) {
            const bestShot = shotCards.sort((a, b) => b.effect.power - a.effect.power)[0];
            return { type: 'shoot', card: bestShot };
        }
    }
    
    // Priority 2: MOVE toward goal if we have ball
    if (aiHasBall) {
        const moveCards = gameState.aiHand.filter(c => c.type === CARD_TYPES.MOVEMENT);
        if (moveCards.length > 0) {
            const card = moveCards[0];
            const targets = getValidMoveTargets(ballCell, card.effect.range);
            const bestMove = targets.sort((a, b) => a.x - b.x)[0];
            if (bestMove) {
                return { type: 'move', card: card, from: ballCell, to: bestMove };
            }
        }
    }
    
    // Priority 3: PASS to better position
    if (aiHasBall) {
        const passCards = gameState.aiHand.filter(c => c.type === CARD_TYPES.PASS);
        if (passCards.length > 0) {
            const card = passCards[0];
            const aiPlayers = gameState.field.filter(c =>
                c.player && c.player.team === 'ai' && c !== ballCell
            );
            
            if (aiPlayers.length > 0) {
                const betterPositioned = aiPlayers.filter(p => p.x < ballCell.x);
                if (betterPositioned.length > 0) {
                    const target = betterPositioned.sort((a, b) => a.x - b.x)[0];
                    const dist = distance(ballCell.x, ballCell.y, target.x, target.y);
                    if (dist <= card.effect.range) {
                        return { type: 'pass', card: card, to: target };
                    }
                }
            }
        }
    }
    
    // Priority 4: MOVE any player toward ball or goal
    const moveCards = gameState.aiHand.filter(c => c.type === CARD_TYPES.MOVEMENT);
    if (moveCards.length > 0) {
        const card = moveCards[0];
        const aiPlayers = gameState.field.filter(c => c.player && c.player.team === 'ai');
        
        for (const player of aiPlayers) {
            const targets = getValidMoveTargets(player, card.effect.range);
            if (ballCell && !aiHasBall) {
                const closerToBall = targets.filter(t =>
                    distance(t.x, t.y, ballCell.x, ballCell.y) < distance(player.x, player.y, ballCell.x, ballCell.y)
                );
                if (closerToBall.length > 0) {
                    return { type: 'move', card: card, from: player, to: closerToBall[0] };
                }
            } else {
                const closerToGoal = targets.filter(t => t.x < player.x);
                if (closerToGoal.length > 0) {
                    return { type: 'move', card: card, from: player, to: closerToGoal[0] };
                }
            }
        }
    }
    
    return null;
}

function executeAIAction(action) {
    try {
        switch (action.type) {
            case 'shoot':
                log(`AI plays ${action.card.name}`);
                playCard(action.card, 'ai');
                return true;
                
            case 'move':
                log(`AI plays ${action.card.name}: Moving from (${action.from.x},${action.from.y}) to (${action.to.x},${action.to.y})`);
                gameState.selectedPlayer = action.from;
                gameState.selectedCard = action.card;
                executeCardEffect(action.card, action.to);
                return true;
                
            case 'pass':
                log(`AI plays pass card to (${action.to.x},${action.to.y})`);
                passBall(action.to);
                gameState.actionsRemaining--;
                discardCard(action.card, 'ai');
                render();
                return true;
                
            default:
                return false;
        }
    } catch (e) {
        console.error('AI action failed:', e);
        return false;
    }
}

function planAIBuys() {
    const buyActions = [];
    let remainingCoins = gameState.coins;
    
    while (remainingCoins >= 3) {
        const affordableCards = gameState.market.filter(c => c.cost <= remainingCoins);
        if (affordableCards.length === 0) break;
        
        const priorities = [
            affordableCards.filter(c => c.type === CARD_TYPES.SHOT),
            affordableCards.filter(c => c.type === CARD_TYPES.MOVEMENT),
            affordableCards.filter(c => c.type === CARD_TYPES.PASS),
            affordableCards.filter(c => c.type === CARD_TYPES.ECONOMY)
        ];
        
        let bestCard = null;
        for (const group of priorities) {
            if (group.length > 0) {
                bestCard = group.sort((a, b) => b.cost - a.cost)[0];
                break;
            }
        }
        
        if (!bestCard) break;
        
        buyActions.push({ type: 'buy', card: bestCard });
        remainingCoins -= bestCard.cost;
    }
    
    return buyActions;
}

function executeBuyAction(action) {
    const card = gameState.market.find(c => c.uid === action.card.uid);
    if (!card) {
        log(`⚠️ Card no longer available`);
        return;
    }
    
    gameState.coins -= card.cost;
    gameState.aiDiscard.push({...card, uid: generateId()});
    
    const index = gameState.market.findIndex(c => c.uid === card.uid);
    if (index !== -1) {
        gameState.market.splice(index, 1);
        const newCard = drawMarketCard();
        if (newCard) {
            gameState.market.push(newCard);
        }
    }
    log(`🛍️ AI bought ${card.name} for ${card.cost} coins (${gameState.coins} remaining)`);
}

function aiBuyCards() {
    if (gameState.coins < 3) {
        return;
    }
    
    log(`AI shopping with ${gameState.coins} coins...`);
    
    while (gameState.coins >= 3) {
        const affordableCards = gameState.market.filter(c => c.cost <= gameState.coins);
        if (affordableCards.length === 0) {
            break;
        }
        
        const priorities = [
            affordableCards.filter(c => c.type === CARD_TYPES.SHOT),
            affordableCards.filter(c => c.type === CARD_TYPES.MOVEMENT),
            affordableCards.filter(c => c.type === CARD_TYPES.PASS),
            affordableCards.filter(c => c.type === CARD_TYPES.ECONOMY)
        ];
        
        let bestCard = null;
        for (const group of priorities) {
            if (group.length > 0) {
                bestCard = group.sort((a, b) => b.cost - a.cost)[0];
                break;
            }
        }
        
        if (!bestCard) break;
        
        gameState.coins -= bestCard.cost;
        gameState.aiDiscard.push({...bestCard, uid: generateId()});
        
        const index = gameState.market.findIndex(c => c.uid === bestCard.uid);
        if (index !== -1) {
            gameState.market.splice(index, 1);
            
            const newCard = drawMarketCard();
            if (newCard) {
                gameState.market.push(newCard);
            }
        }
        log(`AI bought ${bestCard.name} for ${bestCard.cost} coins (${gameState.coins} remaining)`);
    }
}
