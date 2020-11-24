const BasePlayer = require('../../Player');

const _forEach = require('lodash/forEach');

module.exports = class Player extends BasePlayer {

    constructor(userId, type = 0) {
        super(userId, type);

        this.cards = [];
        this.dropCards = [];
        this.startCardsCount = 6;
        this.isTransferMode = false;
        this.isAttacker = 0;
        this.isDefender = 0;
        this.isTaker = 0;
        this.isCompleted = 0;

        this.isOnline = false;
        this.next = null;

        this.index = -1;
    }

    getNext() {
        return this.next;
    }

    resetState() {
        this.active = 0;
        this.isAttacker = 0;
        this.isDefender = 0;

        this.isTaker = 0;
        this.isCompleted = 0;
        this.dropCards = [];
    }

    pickUpCard(index) {
        const card = this.cards.splice(index, 1)[0];
        this.dropCards.push(card);

        return card;

    }

    getCard(index) {
        return this.cards[index];
    }

    getCards() {
        _forEach(this.cards, card => {
            card.open();
        });

        return this.cards;
    }

    needCards() {
        const droppedCardsCount = this.isTaker ? this.getDropCardsCount : 0;
        const needCardsCount = this.startCardsCount - (this.getCardsCount + droppedCardsCount);

        return needCardsCount > 0 ? needCardsCount : 0;
    }

    get inGame() {
        return !this.isLeft() && this.isOnline;
    }

    get getCardsCount() {
        return this.cards.length;
    }

    get getDropCardsCount() {
        return this.dropCards.length;
    }

    addCards(cards, trump) {
        _forEach(cards, card => {
            card.unSlung()
            card.unCover()
                .open();

            this.cards.push(card);
        });

        this.cards = this.sortCards(this.cards, trump);
    }

    canPlayCard(cardIndex) {
        const card = this.getCard(cardIndex);

        return card && this.isActive() && !this.isLeft() && !card.isDown;
    }

    getAction() {
        return this.isAttacker ? 'slung' : 'cover';
    }

    setOnline() {
        this.isOnline = true;
        return this;
    }

    setSocketId(socketId) {
        this.socketId = socketId;
        return this;
    }

    sortCards(cards, trump) {
        cards.sort((card1, card2) => {
            if(card1.rank === card2.rank)
                return 0;

            return card1.rank < card2.rank ? 1 : -1;
        });

        cards.sort((card1, card2) => {
            return card1.suit === trump ? 1 : -1;
        });

        return cards;
    }
};
