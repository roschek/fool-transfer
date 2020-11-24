const ranks = ['6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
const suits = ['heart', 'diamond', 'spades', 'clubs'];
const symbols = {'heart': '♥', 'clubs': '♣', 'spades': '♠', 'diamond': '♦'};

const variants = {
    'label': '',
    'data': {},
};

const widgets = {
    left: [],
    right: ['ModulePlayers'],
    bottom: ['ModuleChat'],
};

const turnTime = 30;
const canPlayWithComputer = true;
const canPlaySingle = false;
const stopGameIfPlayerLeave = false;

const scoreType = 'score';

const fake = {
    scoreMin: 1,
    scoreMax: 12,
    upScoreMin: 1,
    upScoreMax: 2,
    playTimeMin: 3 * 60 * 1000,
    playTimeMax: 5 * 60 * 1000,
};
module.exports = {
    fake,
    ranks,
    suits,
    symbols,
    variants,
    turnTime,
    canPlayWithComputer,
    canPlaySingle,
    stopGameIfPlayerLeave,
    scoreType,
    widgets,
};