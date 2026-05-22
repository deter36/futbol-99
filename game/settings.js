/*
 * settings.js — Numbers you'd tweak (field size, hand size, actions per turn)
 * If you want to change how big the field is, how many cards you draw,
 * or how many actions each turn gets, this is the only file you need to touch.
 */

const FIELD_WIDTH = 17;
const FIELD_HEIGHT = 13;
const HAND_SIZE = 6;
const MARKET_SIZE = 6;
const ACTIONS_PER_TURN = 3;
const PLAYERS_PER_TEAM = 5;

const CARD_TYPES = {
    COMMAND: 'command',
    MOVEMENT: 'movement',
    PASS: 'pass',
    SHOT: 'shot',
    ECONOMY: 'economy',
    COACH: 'coach',
    // Legacy/deprecated
    DEFEND: 'defend'
};

// Card type color mapping
const CARD_TYPE_COLORS = {
    command: { primary: '#455A64', secondary: '#78909C' },
    movement: { primary: '#4CAF50', secondary: '#81C784' },
    pass: { primary: '#2196F3', secondary: '#64B5F6' },
    shot: { primary: '#F44336', secondary: '#E57373' },
    economy: { primary: '#FFC107', secondary: '#FFD54F' },
    coach: { primary: '#9C27B0', secondary: '#BA68C8' },
    defense: { primary: '#607D8B', secondary: '#90A4AE' }
};
