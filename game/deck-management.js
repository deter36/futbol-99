/*
 * deck-management.js — Shuffling, drawing, and discarding cards
 * Handles building the starter and market decks, drawing cards into
 * hands, discarding after use, and the discard-for-coin option.
 * Basically the "card logistics" that aren't about what cards DO.
 */

function createStarterDeck() {
    return STARTER_CARDS.map(card => ({...card, uid: generateId()}));
}

function createMarketDeck() {
    // Market upgrades are paused while the new 12-card command deck is being prototyped.
    const deck = [];
    MARKET_CARDS.forEach(card => {
        for (let i = 0; i < 3; i++) {
            deck.push({...card, uid: generateId()});
        }
    });
    // Shuffle the deck
    return deck.sort(() => Math.random() - 0.5);
}

function drawMarketCard() {
    if (gameState.marketDeck.length === 0) {
        log('Market deck is empty!');
        return null;
    }
    return gameState.marketDeck.pop();
}

function getInitialMarketCards() {
    if (MARKET_CARDS.length === 0) {
        return [];
    }

    // Draw 5 cards from the shuffled market deck
    const initialCards = [];
    for (let i = 0; i < MARKET_SIZE; i++) {
        const card = drawMarketCard();
        if (card) initialCards.push(card);
    }
    return initialCards;
}

function discardCardForCoin(card, team = 'player') {
    // Any non-economy card can be discarded for 1 coin
    if (card.type === CARD_TYPES.ECONOMY) {
        log("Can't discard economy cards for coins - just play them!");
        return false;
    }
    
    // Can't discard the active coach card
    const activeCoach = team === 'player' ? gameState.playerCoach : gameState.aiCoach;
    if (activeCoach && card.uid === activeCoach.uid) {
        log("Can't discard your active coach card!");
        return false;
    }
    
    // No confirmation needed - just discard
    
    gameState.coins += 1;
    const hand = team === 'player' ? gameState.playerHand : gameState.aiHand;
    const discard = team === 'player' ? gameState.playerDiscard : gameState.aiDiscard;
    
    const index = hand.findIndex(c => c.uid === card.uid);
    if (index !== -1) {
        hand.splice(index, 1);
        discard.push(card);
    }
    
    log(`${team === 'player' ? 'You' : 'AI'} discarded ${card.name} for 1 coin`);
    render();
    return true;
}

function discardCard(card, team) {
    const hand = team === 'player' ? gameState.playerHand : gameState.aiHand;
    const discard = team === 'player' ? gameState.playerDiscard : gameState.aiDiscard;
    
    const index = hand.findIndex(c => c.uid === card.uid);
    if (index !== -1) {
        hand.splice(index, 1);
    }
    discard.push(card);
}

function discardCardOnce(card, team) {
    if (!card) return;
    const discard = team === 'player' ? gameState.playerDiscard : gameState.aiDiscard;
    if (!discard.some(discarded => discarded.uid === card.uid)) {
        discardCard(card, team);
    }
}

function removeCardFromHand(card, team) {
    const hand = team === 'player' ? gameState.playerHand : gameState.aiHand;
    const index = hand.findIndex(c => c.uid === card.uid);
    if (index !== -1) {
        hand.splice(index, 1);
        return true;
    }
    return false;
}
