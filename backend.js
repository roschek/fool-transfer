const Game = require('../Game');

const _assign = require('lodash/assign');
const _forIn = require('lodash/forIn');
const _indexOf = require('lodash/indexOf');
const _filter = require('lodash/filter');
const _find = require('lodash/find');
const _shuffle = require('lodash/shuffle');

const GameLogic = require('./src/Game');

class FoolClassic extends Game {
    constructor() {
        super();

        this.options = {
            startCardsCount: 6,
            firstRoundCardsLimit: 5,
            roundCardsLimit: 6,
        };
    }

    initGame(io, roomId, options, gameEvents) {
        super.initGame(io, roomId, options, gameEvents);

        this.options = _assign({}, this.options, options);

        this.turnTimer = new this.timer(io, roomId, options);
        this.game = new GameLogic(this.options);
    }

    onDisconnect() {
        this.activePlayersInRoom--;
        this.closeGameListeners();
    }

    nodeRemovePlayer(userId, hardDelete) {
        this.game.removePlayer(userId, hardDelete);
        super.nodeRemovePlayer(userId, hardDelete);

        const onlinePlayers = Object.keys(this.players).map(userId => this.players[userId]).filter(player => player.isOnline);

        if (this.game.started && onlinePlayers.length <= 1) {
            this.onGameOver();
        }

    }

    joinPlayer(user) {
        //console.log('join player', user.userId, 'for game ' + this.constructor.name);
        let player = this.game.getPlayer(user.userId);

        if (!player) {
            player = this.game.addPlayer(user.userId, user.isRobot);
        }

        player.setOnline().setSocketId(user.id);
        this.players = this.game.players;
    }

    initPlayer(io, socket, user, roomId, options, callbacks) {
        super.initPlayer(io, socket, user, roomId, options, callbacks);

        if (!user.isRobot) {
            this.handlers = {
                'playCard': this.onPlayCard.bind(this),
                'skipStep': this.onSkipStep.bind(this),
                'disconnect': this.onDisconnect.bind(this),
                'leaveRoom': this.onLeaveRoom.bind(this),
                'changeMode': this.onChangeMode.bind(this)
            };

            for (let eventName in this.handlers) {
                if (this.handlers.hasOwnProperty(eventName)) {
                    this.socket.on(eventName, this.handlers[eventName]);
                }
            }
        }

        return new Promise((resolve, reject) => {
            this.getGameData()
                .then(gameData => {
                    socket.emit('initGame', {
                        userId: user.userId,
                        index: gameData.userIndex,
                        cardTrump: gameData.lastCard,
                        playerCards: gameData.playerCards,
                        options: this.options,
                    });
                    resolve();
                })
                .catch(error => {
                    reject(error);
                });
        });
    }

    onGameStart({players, forPlayer}) {
        this.players = this.game.players;
        this.game.started = true;

        let prevPlayer = null;
        this.game.queue = _shuffle(this.game.queue);
        this.game.queue.forEach((userId, index) => {
            if (prevPlayer) {
                prevPlayer.next = this.players[userId];
            }
            this.players[userId].index = index;
            prevPlayer = this.players[userId];
        });

        _forIn(this.players, (_, playerId) => {
            const player = this.game.getPlayer(playerId);

            const needCardsCount = player.needCards();
            if (needCardsCount) {
                const newCards = this.game.takeCardsFromDeck(needCardsCount);
                player.addCards(newCards, this.game.trump);
            }
        });

        super.onGameStart({players, forPlayer});

        if (this.game.isFirstRound()) {

            const round = {
                takerPlayer: null,
                activePlayerId: this.game.getCurrentPlayer().userId,
                fakePlayers: this.game.preparePlayers(),
                deckCardsCount: this.game.deck.length,
                tableCards: this.game.table,
                lastCard: this.game.getLastCard(),
            };

            const players = this.game.players;
            this.io.to(this.roomId).emit('newRound', {round: round});

            _forIn(players, player => {
                this.io.to(player.socketId).emit('newRound', {
                    userId: player.userId,
                    cards: player.cards,
                    round: round,
                });
            });

            const activePlayer = this.game.getPlayer(round.activePlayerId);

            if (activePlayer.isRobot) {
                // задержка для первого хода робота
                setTimeout(() => {
                    this.robotPlay(activePlayer);
                }, 2000);
            }
        }

        this.game.timerId = this.turnTimer.start(this.onNextPlayerTurn.bind(this), this.game.timerId);
    }

    onNextPlayerTurn() {
        try {
            const player = this.game.getCurrentPlayer();

            if (!this.game.getPlayer(player.userId)) {
                return this.newGameRound();
            }

            if (player.isAttacker && !this.game.state.attackers.length) {
                return this.newGameRound();
            }


            player.deactivate();
            let nextPlayer = null;

            const log = {
                userId: player.userId,
                passTurn: true,
            };

            if (player.isDefender) {

                this.game.setTaker(player);
                nextPlayer = this.game.getPreviousPlayer(player);

                // Если кто то взял, все остальные могут снова подкинуть
                this.game.state.attackers.forEach(playerId => this.players[playerId].isCompleted = 0);

                const countPlayersInGame = this.game.getCountPlayersInGame();
                if (!this.game.deck.length && !nextPlayer.cards.length && countPlayersInGame <= 2) {

                    player.score = 0;
                    nextPlayer.score = countPlayersInGame;

                    this.game.lefts.push(player);
                    this.game.lefts.push(nextPlayer);

                    player.left = 1;
                    nextPlayer.left = 1;

                    super.updateLog(this.roomId, log);
                    this.updateScores();
                    this.onGameOver();

                    return false;
                }

                if (this.game.slungCardsLimitReached(player)) {
                    this.newGameRound();

                    return false;
                }
            }

            if (player.isAttacker) {
                player.isCompleted = 1;
                nextPlayer = this.game.getNextAttacker(player);
            }

            super.updateLog(this.roomId, log);
            this.updateScores();

            //console.log(' ##### NEXT PLAYER fired');

            if (nextPlayer) {
                this.game.setCurrentPlayer(nextPlayer);

                if (nextPlayer.isRobot)
                    this.robotPlay(nextPlayer);

                this.io.to(this.roomId).emit('stepSkipped', {
                    takerId: player.isTaker ? player.userId : null,
                    nextPlayerId: nextPlayer.userId,
                });

                this.game.timerId = this.turnTimer.restart(this.onNextPlayerTurn.bind(this), this.game.timerId);
                return false;
            }

            this.newGameRound();
        } catch (e) {
            console.log(e);
        }
    }

    onPlayCard({cardIndex}) {
        this.callbacks.playCard(this.io, this.user.userId, this.roomId, {cardIndex: cardIndex});
    }

    onChangeMode() {
        this.callbacks.changeMode(this.io, this.user.userId, this.roomId);
    }

//проверка есть ли отбитые карты перед возможностью перевести ход
    nodeChangeMode(userId) {
        const cardsConsidere = this.players[userId].cards.filter((elem) => this.game.table[0].rank === elem.rank).length
        const cardsIsSlung = this.game.table.filter((card) => !card.isSlung).length
        if (cardsConsidere !== 0 && cardsIsSlung === 0) {
            this.players[userId].isTransferMode = !this.players[userId].isTransferMode
        }
    }


    nodePlayCard(userId, {cardIndex}) {

        try {
            const player = this.game.getPlayer(userId);
            let card = null;
            let nextPlayer = null;

            this.active(userId);
            console.log('player.isAttacker', player.isAttacker, userId)
            console.log('player.isDefender', player.isDefender, userId)
            console.log('player.canPlayCard(cardIndex)', player.canPlayCard(cardIndex))
            if (!player || !player.canPlayCard(cardIndex))
                return false;

            if (player.isAttacker) {
                if (!this.game.allowRanks.length)
                    card = player.pickUpCard(cardIndex);
                else if (_indexOf(this.game.allowRanks, player.getCard(cardIndex).rank) >= 0)
                    card = player.pickUpCard(cardIndex);
                else
                    return false;
            }


            if (player.isDefender) {
                if (player.isTransferMode && !this.game.isFirstRound()) {

                    if (this.game.checkTransfer(player.getCard(cardIndex), this.game.table[0])) {
                        card = player.pickUpCard(cardIndex);//выбранная карта
                        const nextPlayer = this.game.getNextPlayer(player)
                        this.game.setCurrentPlayer(nextPlayer)
                        player.isDefender = 0
                        this.game.setDefender(nextPlayer)
                        this.game.setAttackers()

                        player.isTransferMode = false

                    }
                } else {
                    if (this.game.checkCover(player.getCard(cardIndex))) {
                        card = player.pickUpCard(cardIndex);
                    }

                    else
                        return false;
                }

            }


            if (card) {
                if (player.isAttacker)
                    this.game.previousAttackerId = player.userId;

                nextPlayer = player.isAttacker ? this.game.getDefender() : this.game.getPreviousAttacker();
                player.deactivate();

                if (nextPlayer && nextPlayer.isTaker) {
                    const cacheNextPlayer = nextPlayer;
                    if (player.isCompleted) {
                        nextPlayer = this.game.getNextAttacker(player);

                        if (!nextPlayer)
                            nextPlayer = this.game.getNextPlayer(cacheNextPlayer);
                    } else
                        nextPlayer = player;
                } else if (!nextPlayer)
                    nextPlayer = player;

                if (player.isDefender && player.isRobot) {
                   let notCoveredCards = this.game.table.filter((card) => !card.isCovered)
                    if (notCoveredCards.length > 1) {
                        nextPlayer = player
                          card.cover();
                           notCoveredCards[0].cover();
                           notCoveredCards[0].slung()
                           this.robotPlay(nextPlayer)
                    }
                              }

                card.open();
                this.game.table.push(card);
                this.game.allowRanks.push(card.rank);

                this.game.setCurrentPlayer(nextPlayer);
                if (player.isAttacker) {
                    card.slung();

                    if (!this.game.state.attackers.includes(player.userId)) {
                        this.game.state.attackers.push(player.userId);
                    }

                    if (!player.cards.length) {
                        player.isCompleted = 1;
                    }
                }


                this.io.to(this.roomId).emit('cardPlayed', {
                    playerId: userId,
                    cardIndex: cardIndex,
                    card: card,
                    nextPlayerId: nextPlayer.userId,
                });

                // У игрока и в колоде не осталось карт
                if (!this.game.deck.length && !player.cards.length) {
                    const countPlayersInGame = this.game.getCountPlayersInGame();

                    if (countPlayersInGame === 2) {
                        if (nextPlayer.cards.length === 1 && nextPlayer.isDefender) {
                            // У единственного противника одна карта

                            this.updateLog(card, player.getAction(), userId, this.roomId);
                            this.game.timerId = this.turnTimer.restart(this.onNextPlayerTurn.bind(this), this.game.timerId);

                            this.game.setCurrentPlayer(nextPlayer);
                            if (nextPlayer.isRobot) {
                                this.robotPlay(nextPlayer);
                            }


                            return false;
                        }

                        if (!nextPlayer.cards.length && nextPlayer.userId !== player.userId) {

                            player.score = 0;
                            nextPlayer.score = 0;

                            this.game.lefts.push(player);
                            this.game.lefts.push(nextPlayer);

                            player.left = 1;
                            nextPlayer.left = 1;

                            this.updateLog(card, player.getAction(), userId, this.roomId);
                            this.updateScores();
                            this.onGameOver();

                            return false;
                        }
                    }

                    this.game.lefts.push(player);

                    player.left = 1;
                    player.score = countPlayersInGame;

                    if (countPlayersInGame === 2) {
                        this.game.lefts.push(nextPlayer);
                        nextPlayer.left = 1;

                        this.updateLog(card, player.getAction(), userId, this.roomId);
                        this.updateScores();
                        this.onGameOver();

                        return false;
                    }

                    if (player.isDefender) {
                        this.updateLog(card, player.getAction(), userId, this.roomId);
                        this.newGameRound();

                        return false;
                    }
                }

                if (player.isDefender && (this.game.slungCardsLimitReached(player) || player.userId === nextPlayer.userId)) {
                    let notCoveredCards = this.game.table.filter((card) => !card.isCovered)

                    if (notCoveredCards.length) {
                        return false
                    }

                    this.updateLog(card, player.getAction(), userId, this.roomId);
                    this.newGameRound();

                    return false;
                }

                if (player.isAttacker) {
                    let slungCardsLimit = this.game.isFirstRound() ? this.options.firstRoundCardsLimit : this.options.roundCardsLimit;
                    const slungCards = _filter(this.game.table, card => card.isSlung);
                    const taker = _find(this.game.players, player => player.isTaker);

                    if (taker) {
                        const takerCardsCount = taker.cards.length + (this.game.table.length - slungCards.length);

                        if (takerCardsCount < slungCardsLimit)
                            slungCardsLimit = takerCardsCount;

                        if (slungCardsLimit === slungCards.length) {
                            this.updateLog(card, player.getAction(), userId, this.roomId);
                            this.newGameRound();

                            return false;
                        }
                    }
                }

                this.updateLog(card, player.getAction(), userId, this.roomId);
                this.game.timerId = this.turnTimer.restart(this.onNextPlayerTurn.bind(this), this.game.timerId);

                this.game.setCurrentPlayer(nextPlayer);
                if (nextPlayer.isRobot)
                    this.robotPlay(nextPlayer);
            }
        } catch (e) {
            console.log(e);
        }
    }

    onSkipStep() {
        this.callbacks.skipStep(this.io, this.user.userId, this.roomId);
    }

    nodeSkipStep() {
        this.onNextPlayerTurn();
    }

    newGameRound() {

        const round = this.game.newRound();
        const players = round.players;
        /*for( let playerId in players){
            console.log(players[playerId].cards)
        }*/

        if (this.game.getCountPlayersInGame() === 1) {
            const player = players[round.activePlayerId];
            this.game.lefts.push(player);
            player.left = 1;
            player.score = 1;
            //this.updateLog(card, player.getAction(), userId, this.roomId);
            this.updateScores();
            this.onGameOver();

            return false;
        }

        delete round.players;

        this.io.to(this.roomId).emit('newRound', {round: round});

        _forIn(players, player => {
            this.io.to(player.socketId).emit('newRound', {
                userId: player.userId,
                cards: player.cards,
                round: round,
            });
        });

        const activePlayer = this.game.getPlayer(round.activePlayerId);
        if (activePlayer.isRobot)
            this.robotPlay(activePlayer);

        this.game.timerId = this.turnTimer.restart(this.onNextPlayerTurn.bind(this), this.game.timerId);
    }

    nodeGetGameData(userId) {
        const player = this.game.getPlayer(userId);
        return {
            userIndex: player.index,
            lastCard: this.game.getLastCard(),
            playerCards: player.getCards(),
        };
    }

    updateLog(card, action, userId, roomId) {
        const log = {
            userId: userId,
            passTurn: false,
            cardName: card.name,
            cardSuit: card.suit,
            action: action,
        };

        super.updateLog(roomId, log);
    }

    updateScores() {
        this.players = this.game.players;
        this.sendScores();
    }

    robotPlay(robot) {
        let robotPlayWait = robot.isRobot === 1 ? 500 : 1000 + Math.floor(Math.random() * 3000);
        const robotPassWait = robot.isRobot === 1 ? 500 : 1000 + Math.floor(Math.random() * 1000);

        if (this.game.getTaker() && robot.cards.length === 1) {
            robotPlayWait -= robotPassWait;
        }

        const {card, cardIndex} = this.game.getRobotCard(robot);

        if (!card) {
            setTimeout(() => {
                return this.onNextPlayerTurn();
            }, robotPassWait);
        } else {
            setTimeout(() => {
                if (robot.isTransferMode /*&& !this.game.isFirstRound()*/) {
                    const nextPlayer = this.game.getNextPlayer(robot)
                    this.game.setDefender(nextPlayer)
                    robot.isDefender = 0;
                    this.game.setCurrentPlayer(nextPlayer)
                    this.game.setAttackers()
                    robot.isTransferMode = false

                }
                return this.nodePlayCard(robot.userId, {cardIndex: cardIndex});
            }, robotPlayWait);
        }
    }

    onGameOver() {
        if (this.game.losers.length) {
            for (let i = 0; i < this.game.losers.length; i++) {
                const loser = this.game.losers.reverse()[i];
                loser.score = -(i + 1);

                if (this.game.queue.includes(loser.userId)) {
                    this.game.restorePlayer(loser);
                }
            }
        }

        this.players = this.game.players;
        super.onGameOver();
    }
}

module.exports.Game = FoolClassic;
