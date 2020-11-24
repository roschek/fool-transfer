// Lodash

const _assign = require('lodash/assign');
const _forEach = require('lodash/forEach');
const _shuffle = require('lodash/shuffle');
const _indexOf = require('lodash/indexOf');
const _filter = require('lodash/filter');
const _keys = require('lodash/keys');
const _findKey = require('lodash/findKey');
const _findIndex = require('lodash/findIndex');
const _forIn = require('lodash/forIn');
const _pickBy = require('lodash/pickBy');
const _sortBy = require('lodash/sortBy');


// Game classes
const Player = require('./Player');
const Card = require('./Card');

//Settings
const {ranks, suits} = require('./settings.js');

module.exports = class Game {
    static startCardsCount = 6;
    static firstRoundLimitCards = 5;
    static roundLimitCards = 6;

    constructor() {
        this.deck = this.makeDeck();
        this.lastCard = this.getLastCard();
        this.lastCard.open();

        this.table = [];
        this.allowRanks = [];
        this.out = [];
        this.trump = this.getTrump();

        this.players = {};
        this.losers = [];
        this.lefts = [];

        this.round = 1;

        this.timerId = null;
        this.counter = 0;
        this.previousAttackerId = null;

        this.state = {
            currentPlayer: null,
            defender: null,
            taker: null,
            attackers: [],

        };

        this.queue = [];
        this.started = false;
    }

    makeDeck() {
        const initDeck = [];

        _forEach(ranks, rank => {
            _forEach(suits, suit => {
                if (suit === 'spades' || suit === 'clubs') {
                    initDeck.push(new Card(rank, suit, 'black'));
                } else {
                    initDeck.push(new Card(rank, suit, 'red'));
                }
            });
        });

        return _shuffle(initDeck);
    }

    removePlayers() {
        _forIn(this.players, player => {
            if (!player.cards.length && !this.deck.length && !player.isLeft()) {
                player.left = 1;
                this.lefts.push(player);
            }
        });
    }

    getCountPlayersInGame() {
        return _keys(_pickBy(this.players, player => player.inGame)).length;
    }

    get getMaxIndex() {
        return _keys(this.players).length - 1;
    }

    preparePlayers() {
        const players = {};

        _forIn(this.players, (player, userId) => {
            players[userId] = _assign({}, player);
            players[userId].cards = players[userId].cards.length;
            delete players[userId].next;
        });

        return players;
    }

    dealCards(userId) {
        if (this.deck.length) {
            const player = this.getPlayer(userId);
            const needCardsCount = player.needCards();

            if (needCardsCount) {
                const newCards = this.takeCardsFromDeck(needCardsCount);
                player.addCards(newCards, this.trump);
            }
        }
    }

    takeCardsFromDeck(count) {
        return this.deck.splice(0, count)
    }


    newRound() {
        this.round++;

        this.state.attackers.forEach(attackerId => {
            if (attackerId) {
                this.dealCards(attackerId);
            }
        });

        // Раздаем тому кто отбивался
        const defenderId = _findKey(this.players, player => player.isDefender);
        if (defenderId) {
            this.dealCards(defenderId);
        }

        //
        const noCardsPlayerIds = Object
            .keys(this.players)
            .filter(playerId => !this.players[playerId].getCardsCount && !this.players[playerId].isLeft());

        const countPlayersInGame = this.getCountPlayersInGame();

        noCardsPlayerIds.forEach(playerId => {
            const player = this.getPlayer(playerId);
            this.lefts.push(player);

            player.left = 1;
            player.score = countPlayersInGame;
        });

        this.removePlayers();

        const taker = this.getTaker();
        const defender = this.getDefender();
        const currentPlayer = this.getCurrentPlayer();

        let newCurrentPlayer = null;

        if (taker) {
            taker.addCards(this.table.slice(), this.trump);
            newCurrentPlayer = this.getNextPlayer(taker);
        } else {
            if (!defender.inGame || !this.getPlayer(defender.userId)) {
                newCurrentPlayer = this.getNextPlayer(defender);
            } else {
                newCurrentPlayer = defender;
            }
        }

        if (!this.getPlayer(currentPlayer.userId)) {
            newCurrentPlayer = this.getNextPlayer(currentPlayer);
        }

        this.resetStatePlayers();

        const newDefender = this.getNextPlayer(newCurrentPlayer);

        this.setCurrentPlayer(newCurrentPlayer);
        this.setDefender(newDefender);
        this.setAttackers();

        this.moveCardsToOut();

        return {
            takerPlayerId: taker ? taker.userId : null,
            activePlayerId: newCurrentPlayer.userId,
            fakePlayers: this.preparePlayers(),
            players: this.players,
            deckCardsCount: this.deck.length,
        };
    }

    resetStatePlayers() {
        this.state = {
            currentPlayer: null,
            defender: null,
            taker: null,
            attackers: [],
        };

        _forIn(this.players, player => {
            player.resetState();
        });
    }

    getRandomPlayer() {
        const playerIds = _keys(this.players);
        const randomId = _shuffle(playerIds)[0];

        return this.players[randomId];
    }

    getPlayers() {
        return this.players;
    }

    getPlayer(userId) {
        return this.players[userId] || null;
    }

    getPlayerByIndex(index) {
        const playerIds = Object.keys(this.players);
        const players = playerIds.map(playerId => this.players[playerId]);
        const player = players.find(player => player.index === index);

        return player || null;
    }

    restorePlayer(player) {
        this.players[player.userId] = player;
    }

    addPlayer(userId, type = 0) {
        const player = new Player(userId, type);

        player.startCardsCount = Game.startCardsCount;

        this.players[userId] = player;
        this.queue.push(userId);

        return player;
    }

    setPlayerOnline(userId) {
        this.players[userId].isOnline = true;
    }

    removePlayer(userId, hardDelete = false) {
        if (!this.players[userId]) {
            return false;
        }

        if (hardDelete) {
            this.queue = this.queue.filter(id => id !== userId);
        } else {
            const index = _findIndex(this.losers, loser => loser.userId === userId);

            if (index < 0) {
                this.losers.push(this.players[userId]);
            }
        }
    }

    getDefender() {
        return this.state.defender;
    }

    getCurrentPlayer() {
        if (this.isFirstRound() && !this.table.length) {
            this.identifyFirstPlayerId();
        }

        return this.state.currentPlayer;
    }

    getNextPlayer(player) {
        let nextPlayer = player.getNext();

        if (nextPlayer === null && player.index === this.getMaxIndex) {
            nextPlayer = this.getPlayerByIndex(0);
        }

        return nextPlayer.inGame ? nextPlayer : this.getNextPlayer(nextPlayer);

        /*let nextIndex = 0;

        if (index + 1 < this.counter) {
            nextIndex = index + 1;
        }

        const userId = _findKey(this.players, player => player.index === nextIndex);

        if (!userId) {
            return this.getNextPlayer(nextIndex);
        }

        return this.players[userId].inGame ? this.players[userId] : this.getNextPlayer(nextIndex);*/
    }

    getPreviousPlayer(currentPlayer) {
        const prevIndex = currentPlayer.index > 0 ? currentPlayer.index - 1 : this.getMaxIndex;

        let prevPlayer = this.getPlayerByIndex(prevIndex);

        return prevPlayer.inGame ? prevPlayer : this.getPreviousPlayer(prevPlayer);

        /*let nextIndex = this.counter - 1;

        if (index - 1 >= 0) {
            nextIndex = index - 1;
        }

        const userId = _findKey(this.players, player => player.index === nextIndex);

        if (!userId) {
            return this.getPreviousPlayer(nextIndex);
        }

        return this.players[userId].inGame ? this.players[userId] : this.getPreviousPlayer(nextIndex);*/
    }

    getPreviousAttacker() {
        const previousAttacker = this.players[this.previousAttackerId];

        return previousAttacker && previousAttacker.inGame ? previousAttacker : this.getNextAttacker(previousAttacker);
    }

    getNextAttacker(player) {
        const attackers = _pickBy(this.players, player => !player.isDefender && player.inGame && !player.isCompleted);
        //const attackers = _filter(this.state.attackers, player => player.inGame && !player.isCompleted);

        let nextPlayer = this.getNextPlayer(player);

        if (!_keys(attackers).length) {
            return null;
        }

        if (nextPlayer.isDefender || !nextPlayer.inGame || nextPlayer.isCompleted) {
            return this.getNextAttacker(nextPlayer);
        }

        return nextPlayer;
    }

    getTrump() {
        return this.getLastCard().suit;
    }

    getLastCard() {
        return this.deck[this.deck.length - 1];
    }

    checkCover(coverCard) {

        if (!this.table.length) {
            return false;
        }

        let holdCard
        const notCoveredCards = this.table.filter((card) => !card.isCovered)

        holdCard = notCoveredCards[0];
        if (holdCard.suit === coverCard.suit) {
            return coverCard.rank - holdCard.rank > 0;
        } else {
            return coverCard.suit === this.trump;
        }

    }

    checkTransfer(transferCard, card) {
        if (this.isFirstRound()) {//проверил не первый ли это раунд
            return false
        }
        return transferCard.rank === card.rank
    }


    identifyFirstPlayerId() {
        const trumps = {};
        let currentPlayer = null;

        _forIn(this.players, player => {
            _forEach(player.cards, card => {
                if (card.suit === this.trump) {
                    trumps[card.rank] = player.index;
                }
            });
        });

        const trumpRanks = _keys(trumps);

        if (!trumpRanks.length) {
            currentPlayer = this.getRandomPlayer();
        } else {
            const min = Math.min(...trumpRanks);
            const userId = _findKey(this.players, player => player.index === trumps[min]);
            currentPlayer = this.players[userId];
        }

        const defender = this.getNextPlayer(currentPlayer);

        this.setCurrentPlayer(currentPlayer);
        this.setDefender(defender);
        this.setAttackers();
    }

    setCurrentPlayer(player) {
        if (player) {
            player.activate();
        }

        this.state.currentPlayer = player;
    }

    setDefender(player) {
        player.isDefender = 1;
        player.isAttacker = 0;
        this.state.defender = player;

    }

    setAttackers() {
        const defenderPlayer = this.state.defender;

        _forIn(this.players, player => {
            if (defenderPlayer.userId !== player.userId) {
                this.players[player.userId].isAttacker = 1;
            }

        });
    }

    setTaker(player) {
        player.isTaker = 1;
        this.state.taker = player;
    }

    getTaker() {
        return this.state.taker;
    }

    slungCardsLimitReached(player) {
        const slungCards = _filter(this.table, card => card.isSlung);
        const defenderCardsCount = player.cards.length + (this.table.length - slungCards.length);

        let slungCardsLimit = this.isFirstRound() ? Game.firstRoundLimitCards : Game.roundLimitCards;

        if (defenderCardsCount < slungCardsLimit) {
            slungCardsLimit = defenderCardsCount;
        }

        return slungCards.length === slungCardsLimit;
    }

    isFirstRound() {
        return this.round === 1;
    }

    moveCardsToOut() {
        for (let i = 0; i < this.table.length; i++) {
            this.out.push(this.table[i]);
        }

        this.table = [];
        this.allowRanks = [];
    }

    getRobotCard(robot) {
        let robotCardIndex = null;

        if (robot.isDefender) {


            let notCoveredCards = this.table.filter((card) => !card.isCovered)
            let cardToCover = notCoveredCards[0];
                    console.log('not covered',cardToCover)
            if (!notCoveredCards.length) {
                return {
                    card: null,
                    cardIndex: null,
                };
            }
            //карты которыми может перевести
            if (this.table.filter((card) => !card.isCovered).length) {
                robotCardIndex = _findIndex(robot.cards, card => {
                    return card.rank === cardToCover.rank
                })
            }

            if (robotCardIndex < 0) {

                    const robotCards = _filter(robot.cards, card => {
                        return card.suit === cardToCover.suit && card.rank - cardToCover.rank > 0;
                    });
                    if (robotCards.length) {
                        const sorted = _sortBy(robotCards, [function (card) {
                            return card.rank;
                        }]);

                         robotCardIndex = _findIndex(robot.cards, card => sorted[0].suit === card.suit && sorted[0].rank === card.rank);
                    } else {
                        const robotTrumps = _filter(robot.cards, card => {
                            if (cardToCover.suit === this.trump) {
                                return card.suit === this.trump && card.rank - cardToCover.rank > 0;
                            } else {
                                return card.suit === this.trump;
                            }
                        });

                        if (robotTrumps.length) {
                            const sorted = _sortBy(robotTrumps, [function (card) {
                                return card.rank;
                            }]);

                            robotCardIndex = _findIndex(robot.cards, card => sorted[0].suit === card.suit && sorted[0].rank === card.rank);
                        }
                    }


            } else {
                robot.isTransferMode = true;
            }


        } else {
            if (!this.allowRanks.length) {
                robotCardIndex = 0;
            } else {
                robotCardIndex = _findIndex(robot.cards, card => {
                    const allowIndex = _indexOf(this.allowRanks, card.rank);

                    return allowIndex >= 0;
                });
                robotCardIndex = robotCardIndex >= 0 ? robotCardIndex : null;
            }
        }


        return robotCardIndex !== null ? {
            card: robot.getCard(robotCardIndex),
            cardIndex: robotCardIndex,
        } : {
            card: null,
            cardIndex: null,
        };
    }
};
