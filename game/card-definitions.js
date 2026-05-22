/*
 * card-definitions.js — The actual cards (L1, C2, R3, etc.) and what they do
 * This is where every card in the game is defined: its name, which lane
 * it activates, what actions are available in each third, and the factory
 * functions that build them. If you want to add or change a card, do it here.
 * (Deck shuffling/drawing/discarding lives in deck-management.js)
 */

const STARTER_CARDS = [
    createLaneCommandCard('l1', 'L1', 'left', 1, {
        defensive: ['tackle', 'pass lane', 'clear'],
        midfield: ['pass lane', 'pass inside', 'dribble'],
        attacking: ['cross', 'pass lane', 'dribble']
    }),
    createLaneCommandCard('l2', 'L2', 'left', 2, {
        defensive: ['mark 2', 'clear'],
        midfield: ['mark 2', 'pass lane'],
        attacking: ['cross', 'pass inside']
    }),
    createLaneCommandCard('l3', 'L3', 'left', 3, {
        defensive: ['mark 3'],
        midfield: ['pass lane', 'mark 2'],
        attacking: ['cross', 'shoot']
    }, {
        actionLabels: { 'attacking.shoot': 'shoot (+1 required roll)' }
    }),
    createLaneCommandCard('c1', 'C1', 'center', 1, {
        defensive: ['tackle', 'pass outside', 'clear', 'header'],
        midfield: ['pass lane', 'pass outside', 'dribble'],
        attacking: ['shoot', 'pass lane', 'pass outside', 'dribble', 'header']
    }),
    createLaneCommandCard('c2', 'C2', 'center', 2, {
        defensive: ['mark 2', 'pass lane', 'clear', 'header'],
        midfield: ['mark 2', 'pass lane'],
        attacking: ['shoot', 'pass lane', 'pass outside', 'header']
    }),
    createLaneCommandCard('c3', 'C3', 'center', 3, {
        defensive: ['mark 3'],
        midfield: ['pass lane', 'mark 2'],
        attacking: ['shoot', 'pass lane']
    }),
    createLaneCommandCard('r1', 'R1', 'right', 1, {
        defensive: ['tackle', 'pass lane', 'clear'],
        midfield: ['pass lane', 'pass inside', 'dribble'],
        attacking: ['cross', 'pass lane', 'dribble']
    }),
    createLaneCommandCard('r2', 'R2', 'right', 2, {
        defensive: ['mark 2', 'clear'],
        midfield: ['mark 2', 'pass lane'],
        attacking: ['cross', 'pass inside']
    }),
    createLaneCommandCard('r3', 'R3', 'right', 3, {
        defensive: ['mark 3'],
        midfield: ['pass lane', 'mark 2'],
        attacking: ['cross', 'shoot']
    }, {
        actionLabels: { 'attacking.shoot': 'shoot (+1 required roll)' }
    }),
    createThirdCommandCard('attack_111', 'A 1/1/1', 'attacking', {
        attacking: ['pass inside', 'shoot', 'dribble', 'header']
    }),
    createThirdCommandCard('defend_111', 'D 1/1/1', 'defensive', {
        defensive: ['mark 2', 'clear', 'pass lane']
    }),
    createSplitLaneCommandCard('lr_11', 'L+R 1/1', ['left', 'right'], {
        defensive: ['mark 2', 'clear'],
        midfield: ['pass lane', 'dribble'],
        attacking: ['cross', 'pass inside']
    })
];

const MARKET_CARDS = [];

function createLaneCommandCard(id, name, lane, count, actions, options = {}) {
    return createCommandCard(id, name, {
        mode: 'lane',
        lanes: [lane],
        count,
        actions,
        actionLabels: options.actionLabels || {}
    });
}

function createSplitLaneCommandCard(id, name, lanes, actions, options = {}) {
    return createCommandCard(id, name, {
        mode: 'split-lane',
        lanes,
        perLane: 1,
        actions,
        actionLabels: options.actionLabels || {}
    });
}

function createThirdCommandCard(id, name, third, actions, options = {}) {
    return createCommandCard(id, name, {
        mode: 'third',
        third,
        lanes: ['left', 'center', 'right'],
        perLane: 1,
        actions,
        actionLabels: options.actionLabels || {}
    });
}

function createCommandCard(id, name, command) {
    const description = getCommandDescription(command);
    return {
        id,
        name,
        type: CARD_TYPES.COMMAND,
        cost: 0,
        description,
        effect: { type: 'command', moveRange: 5, command },
        command
    };
}

function getCommandDescription(command) {
    if (command.mode === 'lane') {
        return `Activate up to ${command.count} in ${command.lanes[0].toUpperCase()}. Move first, then 1 acts.`;
    }
    if (command.mode === 'split-lane') {
        return `Activate 1 in LEFT and 1 in RIGHT. Move first, then 1 acts.`;
    }
    return `Activate 1 per lane in ${command.third.toUpperCase()}. Move first, then 1 acts.`;
}
