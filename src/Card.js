const {parseInt: _parseInt} = require('lodash');

module.exports = class Card {

    constructor(name, suit, color) {
        this.name = name;
        this.suit = suit;
        this.color = color;
        this.isDown = 1;
        this.isCovered = 0;
        this.isSlung = 0;

        this.rank = Card.setRank(this.name);
    }

    open() {
        this.isDown = 0;
        return this;
    }

    close() {
        this.isDown = 1;
        return this;
    }

    slung() {
        this.isSlung = 1;
        return this;
    }
    cover() {
        this.isCovered = 1;
        return this;
    }
    unCover() {
        this.isCovered = 0;
        return this;
    }
    unSlung() {
        this.isSlung = 0;
        return this;
    }

    static setRank(name) {
        switch (name) {
            case 'A':
                return 14;
            case 'K':
                return 13;
            case 'Q':
                return 12;
            case 'J':
                return 11;
            default:
                return _parseInt(name);
        }
    }
};
