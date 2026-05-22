/*
 * display.js — Drawing the field, cards, and scoreboard on screen
 * Everything that updates what you see: rendering the hex grid with
 * players and ball, drawing cards in your hand, showing the market,
 * updating the score/turn indicator, and highlighting valid moves.
 * This file reads gameState but never changes the rules.
 */

function render() {
    renderField();
    renderHand();
    renderMarket();
    renderUI();
}

function renderField() {
    const fieldElement = document.getElementById('soccer-field');
    fieldElement.innerHTML = '';
    renderZoneLabels(fieldElement);
    
    for (let x = 0; x < FIELD_WIDTH; x++) {
        const colDiv = document.createElement('div');
        colDiv.className = 'hex-column';
        if (x % 2 === 1) colDiv.classList.add('odd');
        
        if (x % 2 === 1) {
            renderHalfCell(x, 'top', colDiv);
        }

        const colHeight = getColumnHeight(x);
        for (let y = 0; y < colHeight; y++) {
            const cell = getCell(x, y);
            if (cell) {
                renderCell(cell, colDiv);
            }
        }

        if (x % 2 === 1) {
            renderHalfCell(x, 'bottom', colDiv);
        }
        
        fieldElement.appendChild(colDiv);
    }
}

function renderZoneLabels(fieldElement) {
    const labels = [
        ['third-label', 'third-defensive', 'DEFENSIVE'],
        ['third-label', 'third-midfield', 'MIDFIELD'],
        ['third-label', 'third-attacking', 'ATTACKING'],
        ['lane-label', 'lane-left', 'LEFT'],
        ['lane-label', 'lane-center', 'CENTER'],
        ['lane-label', 'lane-right', 'RIGHT']
    ];

    labels.forEach(([baseClass, positionClass, text]) => {
        const label = document.createElement('div');
        label.className = `zone-label ${baseClass} ${positionClass}`;
        label.textContent = text;
        fieldElement.appendChild(label);
    });

}

function renderHalfCell(x, position, container) {
    const halfDiv = document.createElement('div');
    const third = x <= 5 ? 'defensive' : x <= 10 ? 'midfield' : 'attacking';
    const lane = position === 'top' ? 'left' : 'right';

    halfDiv.className = `half-cell zone-${third} zone-${lane}`;
    if (position === 'bottom') halfDiv.classList.add('bottom');
    halfDiv.title = `${third} third / ${lane} lane edge`;
    container.appendChild(halfDiv);
}

function renderCell(cell, container) {
    {
        const cellDiv = document.createElement('div');
        cellDiv.className = 'field-cell';
        cellDiv.setAttribute('role', 'gridcell');
        cellDiv.setAttribute('aria-label', `Cell ${cell.x}, ${cell.y}`);
        const zones = getPitchZones(cell);
        cellDiv.classList.add(`zone-${zones.third}`, `zone-${zones.lane}`);
        cellDiv.title = `${zones.third} third / ${zones.laneLabel} lane`;
        
        if (cell.x === 0 && cell.y >= 5 && cell.y <= 7) {
            cellDiv.classList.add('near-goal-left');
        } else if (cell.x === 16 && cell.y >= 5 && cell.y <= 7) {
            cellDiv.classList.add('near-goal-right');
        }

        const isMarkedZone = gameState.defensiveMarks.some(mark =>
            mark.zones.some(zone => zone.x === cell.x && zone.y === cell.y)
        );
        if (isMarkedZone) {
            cellDiv.classList.add('marked-zone');
        }
        
        if (cell.player) {
            const playerIcon = document.createElement('div');
            playerIcon.className = `player-token ${cell.player.team === 'player' ? 'player-team' : 'ai-team'}`;
            if (isPlayerOffBalance(cell.player.team, cell.player.id)) {
                playerIcon.classList.add('off-balance');
            }
            playerIcon.textContent = cell.player.team === 'player' ? 'B' : 'R';
            playerIcon.title = `${cell.player.team === 'player' ? 'Blue team' : 'Red team'}${isPlayerOffBalance(cell.player.team, cell.player.id) ? ' - off balance' : ''}`;
            cellDiv.appendChild(playerIcon);
            
            if (cell.ball) {
                const ballIcon = document.createElement('div');
                ballIcon.textContent = '⚽';
                if (isAirborneBallCell(cell)) {
                    ballIcon.className = 'airborne-ball';
                    ballIcon.title = 'Airborne ball';
                }
                ballIcon.style.fontSize = '1.1rem';
                ballIcon.style.marginTop = '-4px';
                cellDiv.appendChild(ballIcon);
            }
        } else if (cell.ball) {
            const ballIcon = document.createElement('div');
            ballIcon.textContent = isAirborneBallCell(cell) ? '⚽' : '⚽';
            if (isAirborneBallCell(cell)) {
                ballIcon.className = 'airborne-ball';
                ballIcon.title = 'Airborne ball';
            }
            ballIcon.style.fontSize = '1.6rem';
            cellDiv.appendChild(ballIcon);
        }
        
        // GOAL KICK SELECTION MODE
        if (gameState.gamePhase === 'goal_kick_selection') {
            const tiedDefenders = gameState.goalKickDefenders.map(d => d.cell);
            const isTiedDefender = tiedDefenders.some(d => d.x === cell.x && d.y === cell.y);
            
            if (isTiedDefender) {
                cellDiv.classList.add('valid-target');
                cellDiv.onclick = () => {
                    selectGoalKickDefender(cell);
                };
            }
        }
        // DEFENSIVE REACTION MODE
        else if (gameState.gamePhase === 'defensive_reaction' && gameState.repositionTeam === 'player') {
            const defenders = gameState.field.filter(c =>
                c.player && c.player.team === 'player'
            );
            
            if (gameState.selectedPlayer) {
                const dist = distance(gameState.selectedPlayer.x, gameState.selectedPlayer.y, cell.x, cell.y);
                if (dist === 1 && !cell.player) {
                    cellDiv.classList.add('valid-move');
                    cellDiv.onclick = () => {
                        reactiveDefenseMove(gameState.selectedPlayer, cell);
                        gameState.selectedPlayer = null;
                    };
                }
            } else if (cell.player && cell.player.team === 'player') {
                cellDiv.classList.add('valid-target');
                cellDiv.onclick = () => {
                    gameState.selectedPlayer = cell;
                    render();
                };
            }
        }
        // REPOSITIONING MODE
        else if (gameState.gamePhase.startsWith('reposition') && gameState.repositionTeam === 'player') {
            const canReposition = gameState.repositionsRemaining.find(p =>
                p.x === cell.x && p.y === cell.y && !p.moved
            );
            
            if (gameState.selectedPlayer) {
                const dist = distance(gameState.selectedPlayer.x, gameState.selectedPlayer.y, cell.x, cell.y);
                if (dist <= gameState.repositionRange && !cell.player && dist > 0) {
                    cellDiv.classList.add('valid-move');
                    cellDiv.onclick = () => {
                        repositionPlayer(gameState.selectedPlayer, cell);
                        gameState.selectedPlayer = null;
                        render();
                    };
                }
            } else if (canReposition && cell.player) {
                cellDiv.classList.add('valid-target');
                cellDiv.onclick = () => {
                    gameState.selectedPlayer = cell;
                    render();
                };
            }
        }
        // NORMAL CARD PLAY MODE
        else if (gameState.selectedCard) {
            const effect = getActiveCardEffect(gameState.selectedCard, gameState.currentTurn);
            
            if (effect.type === 'command') {
                const commandState = gameState.commandActivation;

                if (commandState?.phase === 'select') {
                    if (isSelectedForCommand(cell)) {
                        cellDiv.classList.add('selected');
                    } else if (canSelectForCommand(cell, gameState.selectedCard)) {
                        cellDiv.classList.add('valid-target');
                        cellDiv.onclick = () => selectCommandPlayer(cell, gameState.selectedCard);
                    }
                } else if (commandState?.phase === 'move') {
                    if (gameState.selectedPlayer) {
                        const moveCost = getMovementCostDistance(gameState.selectedPlayer, cell, gameState.currentTurn);
                        const moveRange = getCommandMoveRangeForCell(gameState.selectedPlayer, effect.moveRange);
                        if (moveCost > 0 && moveCost <= moveRange && !cell.player) {
                            cellDiv.classList.add('valid-move');
                            cellDiv.onclick = () => {
                                const movedPlayerId = gameState.selectedPlayer.player.id;
                                movePlayer(gameState.selectedPlayer, cell);
                                commandState.movedPlayerIds.push(movedPlayerId);
                                gameState.selectedPlayer = null;
                                log(`Moved activated player to (${cell.x}, ${cell.y}) for ${moveCost} movement.`);
                                render();
                            };
                        }
                    } else if (canMoveCommandPlayer(cell)) {
                        cellDiv.classList.add('valid-target');
                        cellDiv.onclick = () => {
                            gameState.selectedPlayer = cell;
                            render();
                        };
                    }
                } else if (commandState?.phase === 'act') {
                    if (gameState.selectedPlayer && commandState.action) {
                        if (isValidCommandActionTarget(commandState.action, gameState.selectedPlayer, cell)) {
                            const alreadySelected = gameState.selectedMarkCells.some(markCell => markCell.x === cell.x && markCell.y === cell.y);
                            cellDiv.classList.add(alreadySelected ? 'selected' : 'valid-target');
                            cellDiv.onclick = () => resolveCommandActionTarget(cell);
                        }
                    } else {
                        const isActivated = !!getSelectedCommandPlayer(cell);
                        if (isActivated && getCommandActionsForCell(gameState.selectedCard, cell).length > 0) {
                            cellDiv.classList.add('valid-target');
                            cellDiv.onclick = () => chooseCommandActionPlayer(cell);
                        }
                    }
                }
            }

            else if (effect.type === 'move') {
                if (gameState.selectedPlayer) {
                    const dist = distance(gameState.selectedPlayer.x, gameState.selectedPlayer.y, cell.x, cell.y);
                    if (dist <= effect.range && !cell.player) {
                        cellDiv.classList.add('valid-move');
                        cellDiv.onclick = () => executeCardEffect(gameState.selectedCard, cell);
                    }
                } else {
                    const alreadyMoved = gameState.multiMove && gameState.multiMove.movedPlayerIds.includes(cell.player?.id);
                    if (cell.player && cell.player.team === gameState.currentTurn && !alreadyMoved) {
                        cellDiv.classList.add('valid-target');
                        cellDiv.onclick = () => {
                            gameState.selectedPlayer = cell;
                            render();
                        };
                    }
                }
            }

            else if (effect.type === 'mark') {
                if (!gameState.selectedPlayer && cell.player && cell.player.team === gameState.currentTurn) {
                    cellDiv.classList.add('valid-target');
                    cellDiv.onclick = () => {
                        gameState.selectedPlayer = cell;
                        gameState.selectedMarkCells = [];

                        if (effect.count === 'all') {
                            applyDefensiveMark(gameState.selectedCard, cell, getAdjacentCells(cell.x, cell.y));
                        } else {
                            log(`${effect.name}: choose ${effect.count} adjacent coverage hexes.`);
                            render();
                        }
                    };
                } else if (gameState.selectedPlayer) {
                    const adjacentCells = getAdjacentCells(gameState.selectedPlayer.x, gameState.selectedPlayer.y);
                    const isAdjacent = adjacentCells.some(adjacent => adjacent.x === cell.x && adjacent.y === cell.y);
                    const alreadySelected = gameState.selectedMarkCells.some(markCell => markCell.x === cell.x && markCell.y === cell.y);

                    if (isAdjacent) {
                        cellDiv.classList.add(alreadySelected ? 'selected' : 'valid-target');
                        cellDiv.onclick = () => {
                            if (alreadySelected) {
                                gameState.selectedMarkCells = gameState.selectedMarkCells.filter(markCell => !(markCell.x === cell.x && markCell.y === cell.y));
                            } else if (gameState.selectedMarkCells.length < effect.count) {
                                gameState.selectedMarkCells.push(cell);
                            }

                            if (gameState.selectedMarkCells.length === effect.count) {
                                applyDefensiveMark(gameState.selectedCard, gameState.selectedPlayer, gameState.selectedMarkCells);
                            } else {
                                render();
                            }
                        };
                    }
                }
            }
            
            else if (effect.type === 'pass') {
                const ballCell = getCellWithBall();
                if (ballCell) {
                    const dist = distance(ballCell.x, ballCell.y, cell.x, cell.y);
                    if (dist > 0 && dist <= effect.range) {
                        cellDiv.classList.add('valid-target');
                        
                        cellDiv.onclick = () => {
                            const hasTeamPlayer = cell.player && cell.player.team === gameState.currentTurn;
                            const selectedPassCard = gameState.selectedCard;

                            if (selectedPassCard.mustTargetTeammate && !hasTeamPlayer) {
                                log(`${selectedPassCard.name} must target a teammate.`);
                                return;
                            }
                            
                            if (!hasTeamPlayer) {
                                const confirmed = confirm(
                                    `Pass to empty space at (${cell.x}, ${cell.y})?\n\n` +
                                    `This is risky! The ball might go out of bounds or be intercepted.`
                                );
                                if (!confirmed) {
                                    return;
                                }
                            }
                            
                            const card = selectedPassCard;
                            const team = gameState.currentTurn;
                            passBall(cell);
                            if (card.isKickoff) {
                                gameState.kickoffPending = false;
                                log('Kickoff complete. Play is live.');
                                gameState.selectedCard = null;
                                startPlanningRound();
                                return;
                            } else if (card.isGoalKick) {
                                gameState.goalKickPending = false;
                                log('Goal kick complete. Play is live.');
                                gameState.selectedCard = null;
                                startPlanningRound();
                                return;
                            } else {
                                gameState.actionsRemaining--;
                                discardCard(card, team);
                            }
                            gameState.selectedCard = null;
                            render();
                        };
                    }
                }
            }

            else if (effect.type === 'goal_kick_clear') {
                const clearCell = gameState.selectedPlayer || getCellWithBall();
                if (clearCell && isInClearFan(clearCell, cell, gameState.currentTurn)) {
                    cellDiv.classList.add('valid-target');
                    cellDiv.onclick = () => {
                        executeClear(clearCell, cell);
                        gameState.goalKickPending = false;
                        gameState.selectedCard = null;
                        gameState.selectedPlayer = null;
                        log('Goal kick CLEAR complete. Play is live.');
                        startPlanningRound();
                    };
                }
            }
            
            else if (effect.type === 'defend') {
                const ballCell = getCellWithBall();
                const opposingTeam = gameState.currentTurn === 'player' ? 'ai' : 'player';
                
                if (ballCell && ballCell.player && ballCell.player.team === opposingTeam) {
                    const myPlayers = gameState.field.filter(c =>
                        c.player && c.player.team === gameState.currentTurn
                    );
                    
                    const canTackle = myPlayers.some(playerCell => {
                        const dist = distance(playerCell.x, playerCell.y, ballCell.x, ballCell.y);
                        return dist <= effect.range;
                    });
                    
                    if (canTackle && cell === ballCell) {
                        cellDiv.classList.add('valid-target');
                        cellDiv.onclick = () => executeCardEffect(gameState.selectedCard, cell);
                    }
                }
            }

            else if (effect.type === 'press_tackle') {
                const ballCell = getCellWithBall();
                const opposingTeam = gameState.currentTurn === 'player' ? 'ai' : 'player';

                if (ballCell && ballCell.player && ballCell.player.team === opposingTeam) {
                    if (gameState.selectedPlayer) {
                        const distFromStart = distance(gameState.selectedPlayer.x, gameState.selectedPlayer.y, cell.x, cell.y);
                        const distToBall = distance(cell.x, cell.y, ballCell.x, ballCell.y);
                        const alreadyAdjacent = distance(gameState.selectedPlayer.x, gameState.selectedPlayer.y, ballCell.x, ballCell.y) <= 1;

                        if (cell === ballCell && alreadyAdjacent) {
                            cellDiv.classList.add('valid-target');
                            cellDiv.onclick = () => executeCardEffect(gameState.selectedCard, cell);
                        } else if (!cell.player && distFromStart > 0 && distFromStart <= effect.moveRange && distToBall <= 1) {
                            cellDiv.classList.add('valid-move');
                            cellDiv.onclick = () => executeCardEffect(gameState.selectedCard, cell);
                        }
                    } else if (cell.player && cell.player.team === gameState.currentTurn) {
                        cellDiv.classList.add('valid-target');
                        cellDiv.onclick = () => {
                            gameState.selectedPlayer = cell;
                            render();
                        };
                    }
                }
            }

            else if (effect.type === 'move_mark') {
                if (gameState.pendingMoveMark) {
                    const defenderCell = getCell(gameState.pendingMoveMark.defender.x, gameState.pendingMoveMark.defender.y);
                    const adjacentCells = getAdjacentCells(defenderCell.x, defenderCell.y);
                    const isAdjacent = adjacentCells.some(adjacent => adjacent.x === cell.x && adjacent.y === cell.y);
                    const alreadySelected = gameState.selectedMarkCells.some(markCell => markCell.x === cell.x && markCell.y === cell.y);

                    if (isAdjacent) {
                        cellDiv.classList.add(alreadySelected ? 'selected' : 'valid-target');
                        cellDiv.onclick = () => {
                            if (alreadySelected) {
                                gameState.selectedMarkCells = gameState.selectedMarkCells.filter(markCell => !(markCell.x === cell.x && markCell.y === cell.y));
                            } else if (gameState.selectedMarkCells.length < effect.markCount) {
                                gameState.selectedMarkCells.push(cell);
                            }

                            if (gameState.selectedMarkCells.length === effect.markCount) {
                                applyDefensiveMark(gameState.selectedCard, defenderCell, gameState.selectedMarkCells);
                            } else {
                                render();
                            }
                        };
                    }
                } else if (gameState.selectedPlayer) {
                    const dist = distance(gameState.selectedPlayer.x, gameState.selectedPlayer.y, cell.x, cell.y);
                    if (dist > 0 && dist <= effect.moveRange && !cell.player) {
                        cellDiv.classList.add('valid-move');
                        cellDiv.onclick = () => {
                            movePlayer(gameState.selectedPlayer, cell);
                            gameState.pendingMoveMark = { defender: { x: cell.x, y: cell.y } };
                            gameState.selectedPlayer = null;
                            gameState.selectedMarkCells = [];
                            log(`${effect.name}: moved defender. Choose ${effect.markCount} adjacent coverage hexes.`);
                            render();
                        };
                    }
                } else if (cell.player && cell.player.team === gameState.currentTurn) {
                    cellDiv.classList.add('valid-target');
                    cellDiv.onclick = () => {
                        gameState.selectedPlayer = cell;
                        render();
                    };
                }
            }
            
            else if (effect.type === 'combo') {
                const ballCell = getCellWithBall();
                const actions = effect.actions;
                const [moveType, moveRange] = actions[0].split(':');
                const range = parseInt(moveRange);
                
                if (gameState.selectedPlayer) {
                    const dist = distance(gameState.selectedPlayer.x, gameState.selectedPlayer.y, cell.x, cell.y);
                    if (dist <= range && !cell.player) {
                        cellDiv.classList.add('valid-move');
                        cellDiv.onclick = () => executeCardEffect(gameState.selectedCard, cell);
                    }
                } else {
                    if (cell === ballCell && cell.player && cell.player.team === gameState.currentTurn) {
                        cellDiv.classList.add('valid-target');
                        cellDiv.onclick = () => {
                            gameState.selectedPlayer = cell;
                            render();
                        };
                    }
                }
            }
        }
        // COMBO PASS TARGET SELECTION
        else if (gameState.comboPassPending) {
            const ballCell = getCellWithBall();
            if (ballCell) {
                const dist = distance(ballCell.x, ballCell.y, cell.x, cell.y);
                if (dist > 0 && dist <= gameState.comboPassPending.range) {
                    cellDiv.classList.add('valid-target');
                    cellDiv.onclick = () => {
                        passBall(cell);
                        gameState.actionsRemaining--;
                        discardCard(gameState.comboPassPending.card, gameState.currentTurn);
                        gameState.comboPassPending = null;
                        gameState.selectedCard = null;
                        render();
                    };
                }
            }
        }
        
        if (gameState.selectedPlayer === cell && cell.player && cell.player.team === gameState.currentTurn) {
            cellDiv.classList.add('selected');
        }
        
        container.appendChild(cellDiv);
    }
}

function canUseHandCard(team) {
    if (gameState.gamePhase === 'planning_offense') {
        return team === gameState.offenseTeam && (gameState.manualControlMode || team === 'player');
    }
    if (gameState.gamePhase === 'planning_defense') {
        return team === gameState.defenseTeam && (gameState.manualControlMode || team === 'player');
    }
    return gameState.gamePhase === 'action' && gameState.currentTurn === team && (gameState.manualControlMode || team === 'player');
}

function renderPlanningStatus(container) {
    if (!['planning_offense', 'planning_defense', 'choose_defense_card', 'resolving_card'].includes(gameState.gamePhase)) return;

    const status = document.createElement('div');
    status.className = 'hand-section';
    const label = document.createElement('h3');
    label.className = 'hand-label active-turn';

    if (gameState.gamePhase === 'planning_offense') {
        label.textContent = `Offense planning: ${gameState.plannedOffense.length}/3 cards`;
    } else if (gameState.gamePhase === 'planning_defense') {
        label.textContent = `Defense planning: ${gameState.plannedDefense.length}/3 cards`;
    } else if (gameState.gamePhase === 'choose_defense_card') {
        label.textContent = 'Defense response: choose one planned card';
    } else {
        label.textContent = `${gameState.resolvingRole === 'offense' ? 'Offense' : 'Defense'} resolving ${gameState.selectedCard?.name || ''}`;
    }
    status.appendChild(label);

    status.appendChild(renderPlannedArea());
    renderCommandActionPanel(status);
    container.appendChild(status);
}

function renderPlannedArea() {
    const area = document.createElement('div');
    area.className = 'planned-area';
    area.appendChild(renderPlannedRow('Offense Planned', gameState.plannedOffense, {
        currentIndex: gameState.resolvingRole === 'offense' ? gameState.offenseResolveIndex : -1,
        resolvedBefore: gameState.offenseResolveIndex
    }));
    area.appendChild(renderPlannedRow('Defense Planned', gameState.plannedDefense, {
        clickable: gameState.gamePhase === 'choose_defense_card',
        currentCard: gameState.resolvingRole === 'defense' ? gameState.selectedCard : null
    }));
    return area;
}

function renderPlannedRow(title, cards, options = {}) {
    const row = document.createElement('div');
    row.className = 'planned-row';

    const label = document.createElement('div');
    label.className = 'planned-title';
    label.textContent = title;
    row.appendChild(label);

    const cardWrap = document.createElement('div');
    cardWrap.className = 'planned-cards';

    for (let i = 0; i < 3; i++) {
        const card = cards[i];
        if (!card) {
            const placeholder = document.createElement('div');
            placeholder.className = 'planned-placeholder';
            placeholder.textContent = `Slot ${i + 1}`;
            cardWrap.appendChild(placeholder);
            continue;
        }

        const cardDiv = createCardElement(card, false, card === gameState.selectedCard ? gameState.currentTurn : null);
        if (options.currentIndex === i || options.currentCard?.uid === card.uid) {
            cardDiv.classList.add('current-card');
        }
        if (options.resolvedBefore && i < options.resolvedBefore) {
            cardDiv.classList.add('resolved-card');
        }
        if (options.clickable) {
            cardDiv.classList.add('clickable');
            cardDiv.onclick = () => chooseDefenseResponse(card);
        } else {
            cardDiv.onclick = null;
        }
        cardWrap.appendChild(cardDiv);
    }

    row.appendChild(cardWrap);
    return row;
}

function renderCommandActionPanel(container) {
    if (gameState.gamePhase !== 'resolving_card' || !gameState.commandActivation) return;

    const panel = document.createElement('div');
    panel.className = 'action-panel';

    const title = document.createElement('div');
    title.className = 'action-panel-title';

    if (gameState.commandActivation.phase === 'select') {
        const selected = gameState.commandActivation.selectedPlayers.length;
        title.textContent = selected === 0
            ? 'Select players to activate on the pitch.'
            : `${selected} player${selected === 1 ? '' : 's'} activated. Select more or start movement.`;
        panel.appendChild(title);
    } else if (gameState.commandActivation.phase === 'move') {
        title.textContent = 'Move activated players on the pitch, then resolve command.';
        panel.appendChild(title);
    } else if (gameState.commandActivation.phase === 'act') {
        if (!gameState.selectedPlayer) {
            title.textContent = 'Select one activated player on the pitch to take the action.';
            panel.appendChild(title);
        } else {
            const actions = getCommandActionsForCell(gameState.selectedCard, gameState.selectedPlayer);
            title.textContent = `Choose action for player at (${gameState.selectedPlayer.x}, ${gameState.selectedPlayer.y}).`;
            panel.appendChild(title);

            const buttons = document.createElement('div');
            buttons.className = 'action-buttons';
            actions.forEach(action => {
                const button = document.createElement('button');
                button.className = 'action-choice-btn';
                if (gameState.commandActivation.action === action) button.classList.add('selected');
                const third = getPitchZones(gameState.selectedPlayer, gameState.currentTurn).third;
                button.textContent = getCommandActionLabel(gameState.selectedCard, third, action);
                button.onclick = () => chooseCommandAction(action);
                buttons.appendChild(button);
            });
            panel.appendChild(buttons);

            const hint = document.createElement('div');
            hint.className = 'command-summary';
            hint.textContent = gameState.commandActivation.action
                ? `Now select the target for ${gameState.commandActivation.action} on the pitch.`
                : 'After choosing an action, valid targets will be highlighted on the pitch.';
            panel.appendChild(hint);
        }
    }

    container.appendChild(panel);
}

function renderHand() {
    const handElement = document.getElementById('hand');
    if (!handElement) return;
    
    handElement.innerHTML = '';
    renderPlanningStatus(handElement);
    
    if (gameState.manualControlMode) {
        const playerSection = document.createElement('div');
        playerSection.className = 'hand-section';
        const playerLabel = document.createElement('h3');
        playerLabel.textContent = `🔵 Blue Hand ${gameState.currentTurn === 'player' ? '(YOUR TURN)' : ''}`;
        playerLabel.className = 'hand-label';
        if (gameState.currentTurn === 'player') playerLabel.classList.add('active-turn');
        playerSection.appendChild(playerLabel);
        
        const playerCards = document.createElement('div');
        playerCards.className = 'hand-cards';
        
        if (gameState.playerCoach) {
            const coachDiv = createCardElement(gameState.playerCoach, false, 'player');
            coachDiv.classList.add('active-coach');
            if (gameState.playerCoachUsed) {
                coachDiv.classList.add('coach-used');
                coachDiv.style.opacity = '0.6';
            }
            const isPlayerTurn = gameState.currentTurn === 'player' && gameState.gamePhase === 'action';
            if (isPlayerTurn && !gameState.playerCoachUsed) {
                coachDiv.onclick = () => useCoachAbility('player');
                coachDiv.style.cursor = 'pointer';
                coachDiv.style.boxShadow = '0 0 15px rgba(156, 39, 176, 0.8)';
            } else {
                coachDiv.style.cursor = 'not-allowed';
            }
            playerCards.appendChild(coachDiv);
        }
        
        gameState.playerHand.forEach(card => {
            const cardDiv = createCardElement(card, false, 'player');
            if (!cardDiv) return;
            
            if (canUseHandCard('player')) {
                cardDiv.onclick = () => playCard(card, 'player');
            } else {
                cardDiv.style.opacity = '0.6';
                cardDiv.style.cursor = 'not-allowed';
            }
            
            if (gameState.selectedCard && gameState.selectedCard.uid === card.uid) {
                cardDiv.classList.add('selected');
            }
            playerCards.appendChild(cardDiv);
        });
        playerSection.appendChild(playerCards);
        handElement.appendChild(playerSection);
        
        const aiSection = document.createElement('div');
        aiSection.className = 'hand-section';
        const aiLabel = document.createElement('h3');
        aiLabel.textContent = `🔴 Red Hand ${gameState.currentTurn === 'ai' ? '(YOUR TURN)' : ''}`;
        aiLabel.className = 'hand-label';
        if (gameState.currentTurn === 'ai') aiLabel.classList.add('active-turn');
        aiSection.appendChild(aiLabel);
        
        const aiCards = document.createElement('div');
        aiCards.className = 'hand-cards';
        
        if (gameState.aiCoach) {
            const coachDiv = createCardElement(gameState.aiCoach, false, 'ai');
            coachDiv.classList.add('active-coach');
            if (gameState.aiCoachUsed) {
                coachDiv.classList.add('coach-used');
                coachDiv.style.opacity = '0.6';
            }
            const isAiTurn = gameState.currentTurn === 'ai' && gameState.gamePhase === 'action';
            if (isAiTurn && !gameState.aiCoachUsed) {
                coachDiv.onclick = () => useCoachAbility('ai');
                coachDiv.style.cursor = 'pointer';
                coachDiv.style.boxShadow = '0 0 15px rgba(156, 39, 176, 0.8)';
            } else {
                coachDiv.style.cursor = 'not-allowed';
            }
            aiCards.appendChild(coachDiv);
        }
        
        gameState.aiHand.forEach(card => {
            const cardDiv = createCardElement(card, false, 'ai');
            if (!cardDiv) return;
            
            if (canUseHandCard('ai')) {
                cardDiv.onclick = () => playCard(card, 'ai');
            } else {
                cardDiv.style.opacity = '0.6';
                cardDiv.style.cursor = 'not-allowed';
            }
            
            if (gameState.selectedCard && gameState.selectedCard.uid === card.uid) {
                cardDiv.classList.add('selected');
            }
            aiCards.appendChild(cardDiv);
        });
        aiSection.appendChild(aiCards);
        handElement.appendChild(aiSection);
    } else {
        if (gameState.playerCoach) {
            const coachDiv = createCardElement(gameState.playerCoach, false, 'player');
            coachDiv.classList.add('active-coach');
            if (gameState.playerCoachUsed) {
                coachDiv.classList.add('coach-used');
                coachDiv.style.opacity = '0.6';
            }
            const isPlayerTurn = gameState.currentTurn === 'player' && gameState.gamePhase === 'action';
            if (isPlayerTurn && !gameState.playerCoachUsed) {
                coachDiv.onclick = () => useCoachAbility('player');
                coachDiv.style.cursor = 'pointer';
                coachDiv.style.boxShadow = '0 0 15px rgba(156, 39, 176, 0.8)';
            } else {
                coachDiv.style.cursor = 'not-allowed';
            }
            handElement.appendChild(coachDiv);
        }
        
        if (gameState.playerHand && gameState.playerHand.length > 0) {
            gameState.playerHand.forEach(card => {
                const cardDiv = createCardElement(card, false, 'player');
                if (!cardDiv) return;
                
                const canUseCard = canUseHandCard('player');
                const isPlayerRepositioning = gameState.gamePhase.startsWith('reposition') && gameState.repositionTeam === 'player';
                
                if (canUseCard) {
                    cardDiv.onclick = () => playCard(card);
                } else {
                    if (!isPlayerRepositioning) {
                        cardDiv.style.opacity = '0.6';
                        cardDiv.style.cursor = 'not-allowed';
                    }
                }
                
                if (gameState.selectedCard && gameState.selectedCard.uid === card.uid) {
                    cardDiv.classList.add('selected');
                }
                
                handElement.appendChild(cardDiv);
            });
        }
    }
}

function renderCoachCards() {
}

function renderMarket() {
    const marketElement = document.getElementById('market');
    marketElement.innerHTML = '';
    
    gameState.market.forEach(card => {
        const cardDiv = createCardElement(card, true);
        
        const canBuy = gameState.gamePhase === 'action' &&
                      (gameState.manualControlMode || gameState.currentTurn === 'player');
        
        if (canBuy) {
            cardDiv.onclick = () => buyCard(card);
            if (gameState.coins < card.cost) {
                cardDiv.classList.add('disabled');
            }
        } else {
            cardDiv.classList.add('disabled');
        }
        
        marketElement.appendChild(cardDiv);
    });
}

function createCardElement(card, showCost, team = null) {
    const cardDiv = document.createElement('div');
    cardDiv.className = `card ${card.type}`;
    cardDiv.setAttribute('role', 'button');
    cardDiv.setAttribute('tabindex', '0');

    const activeSide = getCardSideState(card, team);
    const offenseType = card.types && card.types.length > 1 ? card.types.join(' + ') : card.type;
    const ariaDescription = card.defenseEffect
        ? `${card.name} offense: ${card.description}; ${card.defenseEffect.name} defense: ${card.defenseEffect.description}`
        : `${card.name}, ${offenseType} card, ${card.description}`;
    cardDiv.setAttribute('aria-label', ariaDescription);

    if (card.types && card.types.length > 1 && !card.defenseEffect) {
        cardDiv.style.background = getComboGradient(card.types);
    }

    const stats = document.createElement('div');
    stats.className = 'card-stats';
    if (card.coins > 0) {
        stats.textContent = `+${card.coins} coins`;
    }

    if (card.type === CARD_TYPES.COMMAND) {
        renderCommandCard(cardDiv, card, showCost);
    } else if (card.defenseEffect) {
        cardDiv.classList.add('split-card');

        if (showCost) {
            const cost = document.createElement('div');
            cost.className = 'card-cost';
            cost.textContent = `${card.cost}💰`;
            cardDiv.appendChild(cost);
        }

        const offenseSide = createCardSide('OFFENSE', card.name, offenseType, card.description, activeSide === 'offense');
        const defenseSide = createCardSide('DEFENSE', card.defenseEffect.name, 'defense', card.defenseEffect.description, activeSide === 'defense');
        cardDiv.appendChild(offenseSide);
        cardDiv.appendChild(defenseSide);
    } else {
        const header = document.createElement('div');
        header.className = 'card-header';

        const name = document.createElement('div');
        name.className = 'card-name';
        name.textContent = getCardDisplay(card, team).name;
        header.appendChild(name);

        if (showCost) {
            const cost = document.createElement('div');
            cost.className = 'card-cost';
            cost.textContent = `${card.cost}💰`;
            header.appendChild(cost);
        }

        const type = document.createElement('div');
        type.className = 'card-type';
        type.textContent = getCardDisplay(card, team).type;

        const description = document.createElement('div');
        description.className = 'card-description';
        description.textContent = getCardDisplay(card, team).description;

        cardDiv.appendChild(header);
        cardDiv.appendChild(type);
        cardDiv.appendChild(description);
    }

    if (stats.textContent) cardDiv.appendChild(stats);

    return cardDiv;
}

function renderCommandCard(cardDiv, card, showCost) {
    const header = document.createElement('div');
    header.className = 'card-header';

    const name = document.createElement('div');
    name.className = 'card-name';
    name.textContent = card.name;
    header.appendChild(name);

    if (showCost) {
        const cost = document.createElement('div');
        cost.className = 'card-cost';
        cost.textContent = `${card.cost}💰`;
        header.appendChild(cost);
    }

    cardDiv.appendChild(header);

    ['attacking', 'midfield', 'defensive'].forEach(third => {
        const actions = card.command.actions[third];
        if (!actions) return;

        const section = document.createElement('div');
        section.className = 'command-section';

        const label = document.createElement('span');
        label.className = 'command-section-label';
        label.textContent = third[0].toUpperCase();

        section.appendChild(label);
        section.append(` ${actions.map(action => getCommandActionLabel(card, third, action)).join(', ')}`);
        cardDiv.appendChild(section);
    });
}

function createCardSide(mode, nameText, typeText, descriptionText, isActive) {
    const side = document.createElement('div');
    side.className = `card-side ${isActive ? 'active' : 'inactive'}`;
    side.title = `${nameText}: ${descriptionText}`;

    const modeLabel = document.createElement('div');
    modeLabel.className = 'card-mode';
    modeLabel.textContent = mode;

    const name = document.createElement('div');
    name.className = 'card-name';
    name.textContent = nameText;

    const type = document.createElement('div');
    type.className = 'card-type';
    type.textContent = typeText;

    const description = document.createElement('div');
    description.className = 'card-description';
    description.textContent = descriptionText;

    side.appendChild(modeLabel);
    side.appendChild(name);
    side.appendChild(type);
    side.appendChild(description);
    return side;
}

function getComboGradient(types) {
    const sortedTypes = [...types].sort();
    
    if (sortedTypes.length === 2) {
        const color1 = CARD_TYPE_COLORS[sortedTypes[0]]?.primary || '#666';
        const color2 = CARD_TYPE_COLORS[sortedTypes[1]]?.primary || '#666';
        return `linear-gradient(90deg, ${color1} 0%, ${color2} 100%)`;
    } else if (sortedTypes.length === 3) {
        const color1 = CARD_TYPE_COLORS[sortedTypes[0]]?.primary || '#666';
        const color2 = CARD_TYPE_COLORS[sortedTypes[1]]?.primary || '#666';
        const color3 = CARD_TYPE_COLORS[sortedTypes[2]]?.primary || '#666';
        return `linear-gradient(90deg, ${color1} 0%, ${color2} 50%, ${color3} 100%)`;
    }
    
    return 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)';
}

function renderUI() {
    document.getElementById('player-score').textContent = gameState.playerScore;
    document.getElementById('ai-score').textContent = gameState.aiScore;
    
    if (gameState.kickoffPending) {
        document.getElementById('current-turn').textContent = `${gameState.currentTurn === 'player' ? 'Your' : 'AI'} Kickoff`;
    } else if (gameState.goalKickPending) {
        document.getElementById('current-turn').textContent = `${gameState.currentTurn === 'player' ? 'Your' : 'AI'} Goal Kick`;
    } else if (gameState.gamePhase === 'goal_kick_selection') {
        document.getElementById('current-turn').textContent = 'Choose Defender for Goal Kick';
    } else if (gameState.gamePhase === 'defensive_reaction') {
        const team = gameState.repositionTeam === 'player' ? 'Your' : 'AI';
        document.getElementById('current-turn').textContent = `${team} Defensive Reaction`;
    } else if (gameState.gamePhase.startsWith('reposition')) {
        const phase = gameState.gamePhase === 'reposition_shooter' ? 'Shooter Repositioning' : 'Defender Repositioning';
        const team = gameState.repositionTeam === 'player' ? 'Your' : 'AI';
        document.getElementById('current-turn').textContent = `${team} ${phase}`;
    } else if (gameState.gamePhase === 'planning_offense') {
        document.getElementById('current-turn').textContent = `${gameState.offenseTeam === 'player' ? 'Player' : 'AI'} Offense Planning`;
    } else if (gameState.gamePhase === 'planning_defense') {
        document.getElementById('current-turn').textContent = `${gameState.defenseTeam === 'player' ? 'Player' : 'AI'} Defense Planning`;
    } else if (gameState.gamePhase === 'choose_defense_card') {
        document.getElementById('current-turn').textContent = 'Defense Response';
    } else if (gameState.gamePhase === 'resolving_card') {
        document.getElementById('current-turn').textContent = `${gameState.currentTurn === 'player' ? 'Player' : 'AI'} Resolving`;
    } else {
        document.getElementById('current-turn').textContent =
            gameState.currentTurn === 'player' ? 'Your Turn' : 'AI Turn';
    }
    
    document.getElementById('deck-count').textContent = gameState.playerDeck.length;
    document.getElementById('discard-count').textContent = gameState.playerDiscard.length;
    
    const endTurnBtn = document.getElementById('end-turn-btn');
    const finishMovementBtn = document.getElementById('finish-movement-btn');
    const endRepositionBtn = document.getElementById('end-reposition-btn');
    const nextAIActionBtn = document.getElementById('next-ai-action-btn');
    const canFinishMovement = !!(gameState.selectedCard &&
        gameState.multiMove &&
        gameState.multiMove.movedPlayerIds.length > 0);
    const canAdvanceCommand = !!(gameState.selectedCard &&
        gameState.commandActivation &&
        gameState.gamePhase === 'resolving_card');
    
    if (gameState.gamePhase.startsWith('planning') || gameState.gamePhase === 'choose_defense_card') {
        endTurnBtn.style.display = 'none';
        finishMovementBtn.style.display = 'none';
        endRepositionBtn.style.display = 'none';
        nextAIActionBtn.style.display = 'none';
    } else if (gameState.gamePhase.startsWith('reposition') && (gameState.repositionTeam === 'player' || gameState.manualControlMode)) {
        endTurnBtn.style.display = 'none';
        finishMovementBtn.style.display = 'none';
        endRepositionBtn.style.display = 'inline-block';
        nextAIActionBtn.style.display = 'none';
    } else {
        finishMovementBtn.style.display = (canFinishMovement || canAdvanceCommand) ? 'inline-block' : 'none';
        finishMovementBtn.textContent = canAdvanceCommand
            ? (gameState.commandActivation.selectedPlayers.length === 0
                ? 'Skip Command'
                : (gameState.commandActivation.phase === 'select' ? 'Start Movement' : 'Resolve Command'))
            : 'Finish Movement';
        endTurnBtn.style.display = (canFinishMovement || canAdvanceCommand) ? 'none' : 'inline-block';
        endRepositionBtn.style.display = 'none';
        
        if (gameState.manualControlMode) {
            endTurnBtn.textContent = `End ${gameState.currentTurn === 'player' ? '🔵 Blue' : '🔴 Red'} Turn`;
        } else {
            endTurnBtn.textContent = 'End Turn';
        }
    }
    
    if (gameState.aiDebugMode && gameState.currentTurn === 'ai' && gameState.aiPhase !== 'idle') {
        nextAIActionBtn.style.display = 'inline-block';
        const remaining = gameState.aiActionQueue.length;
        nextAIActionBtn.textContent = `⚙️ Next AI Action (${remaining} remaining)`;
    } else {
        nextAIActionBtn.style.display = 'none';
    }
}
