<template>
    <div>
        <template v-if="!app">
            <GameLoader/>
        </template>
        <template v-show="app">
            <div class="game" ref="game" id="game"></div>
        </template>
    </div>
</template>

<script>
import GameLoader from '../../../js/components/game/Loader';

import gameMixins from '../../../js/mixins/game';
import {mapState, mapGetters, mapMutations} from 'vuex';
import {SET_CURRENT_PLAYER, SET_STATE} from '../../../js/store/types';
import {roomInPlay} from '../../../js/utils/room';

import * as PIXI from 'pixi.js-legacy';
import PIXISound from 'pixi-sound';

import _ from 'lodash';

let buttonStyle, statusStyle;

const fontFamily = {
    name: 'PlayRegular',
    url: '/fonts/playregular-webfont.ttf',
};

export default {
    name: 'Fool',
    components: {
        GameLoader,
    },
    mixins: [gameMixins],
    created() {
        this.init();
    },

    data() {
        return {
            loader: null,
            app: null,
            game: null,

            sound: null,

            grid: [],

            cards: {
                deck: [],
                table: [],
                trump: undefined,
            },

            activePlayerId: null,
            deckCardsCount: 0,
            deckCardsCountDigit: null,

            containers: {
                players: {},
            },

            textures: [],
            control2: {},
            sprites: {
                bg: undefined,
                avatarBg: undefined,
                controls: {
                    container: {},
                    take: {},
                    beat: {},
                    transfer: {},
                    give: {},
                    width: 0,
                    height: 30,
                },
                cards: {},
                avatars: {},

                myCards: null,
                tableCards: null,
                tableHoverCards: null,
                deckCards: null,
                otherCards: {},
                otherCardsCount: {},
            },

            view: {
                paddingX: 0,
                paddingY: 0,
                boardWidth: 0,
                boardHeight: 0,

                myCards: {
                    width: 0,
                    height: 0,
                    x: 0,
                    y: 0,
                },

                tableCards: {},
                deckCards: {},
                otherCards: {},

                cardWidth: 0,
                cardHeight: 0,
                myCardPaddingX: 0,

                tableCardPaddingX: 0,
                tableCardPaddingY: 0,
            },

            maxPhoneBoardWidth: 411,

            maxPaddingX: 10,
            maxPaddingY: 10,
            maxBoardWidth: 870,
            maxBoardHeight: 512,
            maxMyCardsWidth: 620,
            maxTableCardsWidth: 500,
            maxDeckCardsWidth: 180,
            maxOtherCardsWidth: 300,
            maxCardWidth: 118,
            maxCardHeight: 180,
            maxAvatarWidth: 55,
            maxAvatarHeight: 55,
            maxAvatarBorder: 3,
            maxMyCardPaddingX: 25,

            otherCardRatio: 0.4,
            tableCardRatio: 0.7,

            sizeRatio: 1,

            playerStatuses: {
                isDefender: lang('game.fool.beats'),
                isActive: lang('game.fool.moving'),
                isTaker: lang('game.fool.takes'),
            },
        };
    },

    computed: {
        ...mapState({
            user: state => state.user,
            socket: state => state.socket,
            gameSpace: state => state.game.space,
            roomId: state => state.room.id,
            gameStatus: state => state.room.game.status,
            volume: state => state.room.volume,
            currentPlayer: state => state.room.currentPlayer,
        }),

        ...mapGetters({
            room: 'room/getData',
        }),

        sortedPlayers() {
            const players = Object.assign({}, this.players);

            const length = Object.keys(this.players).length;
            const diff = players[this.user.userId].index;

            for (let userId in players) {
                players[userId].index -= diff;

                if (players[userId].index < 0)
                    players[userId].index = length - players[userId].index * -1;
            }

            return players;
        },

        currentPlayer() {
            return this.players[this.activePlayerId];
        },
    },

    methods: {
        ...mapMutations('room', {
            setRoomState: SET_STATE,
            setCurrentPlayer: SET_CURRENT_PLAYER,
        }),

        canvasResize() {
            const parent = this.app.view.parentNode;

            if (PIXI.utils.isMobile.phone) {
                this.view.boardWidth = window.innerWidth;
                this.view.boardHeight = window.outerHeight;
                this.sizeRatio = window.innerWidth / this.maxPhoneBoardWidth;
            } else {
                this.sizeRatio = parent.clientWidth / this.maxBoardWidth;
                this.view.boardWidth = this.maxBoardWidth * this.sizeRatio;
                this.view.boardHeight = this.maxBoardHeight * this.sizeRatio;
            }

            this.app.renderer.resize(this.view.boardWidth, this.view.boardHeight);

            this.view.paddingX = this.maxPaddingX * this.sizeRatio;
            this.view.paddingY = this.maxPaddingY * this.sizeRatio;

            this.view.cardWidth = this.maxCardWidth * this.sizeRatio;
            this.view.cardHeight = this.maxCardHeight * this.sizeRatio;

            this.view.tableCardWidth = this.maxCardWidth * this.sizeRatio * this.tableCardRatio;
            this.view.tableCardHeight = this.maxCardHeight * this.sizeRatio * this.tableCardRatio;

            this.view.deckCardWidth = this.view.tableCardWidth * 0.7;
            this.view.deckCardHeight = this.view.tableCardHeight * 0.7;

            this.view.otherCardWidth = this.maxCardWidth * this.sizeRatio * this.otherCardRatio;
            this.view.otherCardHeight = this.maxCardHeight * this.sizeRatio * this.otherCardRatio;

            this.view.avatarWidth = this.maxAvatarWidth * this.sizeRatio;
            this.view.avatarHeight = this.maxAvatarHeight * this.sizeRatio;
            this.view.avatarBorder = this.maxAvatarBorder * this.sizeRatio;

            const playersCount = Object.keys(this.sortedPlayers).length;

            for (let userId in this.sortedPlayers) {
                if (!this.isCurrentUser(userId)) {

                    if (playersCount === 2) {
                        this.containers.players[userId].x = this.view.paddingX;
                        this.containers.players[userId].y = this.view.paddingY;
                    } else if (playersCount === 3) {
                        if (this.sortedPlayers[userId].index === 1) {
                            this.containers.players[userId].x = this.view.paddingX;
                            this.containers.players[userId].y = this.view.paddingY;
                        } else if (this.sortedPlayers[userId].index === 2) {
                            this.containers.players[userId].x = this.view.boardWidth / 2;
                            this.containers.players[userId].y = this.view.paddingY;
                        }
                    } else if (playersCount === 4) {
                        if (this.sortedPlayers[userId].index === 1) {
                            this.containers.players[userId].x = this.view.paddingX;
                            this.containers.players[userId].y = this.view.paddingY;
                        } else if (this.sortedPlayers[userId].index === 2) {
                            this.containers.players[userId].x = this.view.paddingX + this.view.boardWidth / 3;
                            this.containers.players[userId].y = this.view.paddingY;
                        } else if (this.sortedPlayers[userId].index === 3) {
                            this.containers.players[userId].x = this.view.paddingX + this.view.boardWidth / 3 * 2;
                            this.containers.players[userId].y = this.view.paddingY;
                        }
                    }
                }
            }

            this.sprites.myCards.x = this.view.boardWidth / 2;
            this.sprites.myCards.y = this.view.boardHeight - this.view.cardHeight;

            this.view.tableCardPaddingX = 5 * this.sizeRatio;
            this.view.tableCardPaddingY = 20 * this.sizeRatio;

            if (PIXI.utils.isMobile.phone) {
                this.sprites.tableCards.x = this.view.boardWidth / 2 - this.view.tableCardWidth / 2 - this.view.deckCardHeight / 2;
                this.sprites.tableCards.y = this.view.paddingY + this.view.otherCardHeight * 2;
                this.sprites.tableHoverCards.x = this.sprites.tableCards.x + this.view.tableCardPaddingX;
                this.sprites.tableHoverCards.y = this.sprites.tableCards.y + this.view.tableCardPaddingY;
            } else {
                this.sprites.tableCards.x = this.view.boardWidth / 2 - this.view.tableCardWidth / 2;
                this.sprites.tableCards.y = this.view.boardHeight / 3 - this.view.tableCardHeight / 4;
                this.sprites.tableHoverCards.x = this.sprites.tableCards.x + this.view.tableCardPaddingX;
                this.sprites.tableHoverCards.y = this.sprites.tableCards.y + this.view.tableCardPaddingY;
            }

            if (PIXI.utils.isMobile.phone) {
                this.sprites.deckCards.x = this.view.boardWidth - this.view.deckCardWidth / 2 - this.view.paddingX * 2;
                this.sprites.deckCards.y = this.view.boardHeight / 2 + this.view.deckCardWidth;
            } else {
                this.sprites.deckCards.x = this.view.boardWidth - this.view.deckCardWidth - this.view.paddingX * 2;
                this.sprites.deckCards.y = this.view.boardHeight / 2 - this.view.deckCardHeight / 2;
            }

            // Размеры карт и обложки
            for (let textureName in this.cardTextures) {
                this.sprites.cards[textureName].width = this.view.cardWidth;
                this.sprites.cards[textureName].height = this.view.cardHeight;

                this.view.myCardPaddingX = this.maxMyCardPaddingX * this.sizeRatio;
            }

            // Размеры аватарок
            for (let userId in this.players) {
                if (!this.isCurrentUser(this.players[userId].userId)) {
                    if (Object.keys(this.players).length === 2) {
                        this.sprites.avatars[userId].width = this.view.avatarWidth;
                        this.sprites.avatars[userId].height = this.view.avatarHeight;
                    }
                }
            }


            // Кнопки управления
            this.sprites.controls.width = this.view.deckCardWidth;
            this.sprites.controls.container.x = this.sprites.deckCards.x - this.sprites.controls.width / 2;
            this.sprites.controls.container.y = this.sprites.deckCards.y + this.view.deckCardHeight;

            if (PIXI.utils.isMobile.phone) {
                const bg = this.app.stage.getChildByName('tilingBg');

                if (bg)
                    this.app.stage.removeChild(bg);

                this.sprites.bg = new PIXI.TilingSprite(
                    this.loader.resources.bg.texture,
                    this.view.boardWidth,
                    this.view.boardHeight);

                this.sprites.bg.zIndex = 0;
                this.sprites.bg.name = 'tilingBg';
                this.app.stage.addChild(this.sprites.bg);
            }

            this.drawBoard();

            this.app.stage.hitArea = new PIXI.Rectangle(0, 0, this.view.boardWidth, this.view.boardHeight);
            this.app.stage.interactive = true;
        },

        init() {
            this.resetState();

            this.checkRoomExists();
            this.socketListeners();

            this.loader = new PIXI.Loader();

            this.sound = PIXISound;
            this.sound.add('turn', '/games/assets/reversi/turn3.mp3');

            this.errorsHandle();
        },

        socketListeners() {
            this.socket.on('initGame', this.initGame.bind(this));
            this.socket.on('gameStarted', this.gameStarted.bind(this));

            this.socket.on('newRound', this.onNewRound.bind(this));
            this.socket.on('cardPlayed', this.onCardPlayed.bind(this));
            this.socket.on('stepSkipped', this.onStepSkipped.bind(this));

            //this.socket.on('playerDisconnect', this.destroyBattleField.bind(this));
            this.socket.on('playerLeft', this.onPlayerLeft.bind(this));
        },

        initGame({userId, cardTrump, options}) {
            this.resetState();

            this.options = options;
            this.cards.trump = cardTrump;
        },

        onNewRound({userId, cards, round}) {
            this.deckCardsCount = round.deckCardsCount;
            this.cards.table = round.tableCards ? round.tableCards : [];

            if (round.lastCard)
                this.cards.trump = round.lastCard;

            this.cards.deck = this.makeDeck();
            this.$set(this.cards.deck, this.cards.deck.length - 1, this.cards.trump);

            if (round.takerPlayerId)
                this.players[round.takerPlayerId].isTaker = 0;

            const diff = this.cards.deck.length - round.deckCardsCount;

            if (diff > 0)
                this.cards.deck.splice(0, diff);

            for (let playerId in round.fakePlayers) {
                playerId = +playerId;
                const cards = this.dealtCards(playerId, round.fakePlayers[playerId].cards);

                this.$set(this.players, playerId, Object.assign(this.players[playerId], round.fakePlayers[playerId]));
                this.$set(this.players[playerId], 'cards', cards);
                this.$set(this.players[playerId], 'index', round.fakePlayers[playerId].index);
            }

            if (cards)
                this.$set(this.players[userId], 'cards', cards);

            this.setNextPlayerId(round.activePlayerId);
            this.players[round.activePlayerId].isActive = 1;

            if (this.sprites.myCards)
                this.drawBoard();
        },

        gameStarted({players, forPlayer}) {

            if (!forPlayer || forPlayer === this.user.userId) {

                this.loader.add(fontFamily.name, fontFamily.url);

                if (!this.loader.resources.cards)
                    this.loader.add('cards', '/games/assets/fool-classic/sprites.json');

                if (!this.loader.resources.controls)
                    this.loader.add('controls', '/games/assets/fool-classic/sprites2.json');

                if (!this.loader.resources.suits)
                    this.loader.add('suits', '/games/assets/fool-classic/suits.json');

                if (!this.loader.resources.bg) {
                    if (PIXI.utils.isMobile.phone)
                        this.loader.add('bg', '/games/assets/fool-classic/card-field4.jpg');
                    else
                        this.loader.add('bg', '/games/assets/fool-classic/bg2.jpg');
                }

                this.$refs.game.innerHTML = null;

                if (players && players.length > 0) {
                    const playersLength = players.length;
                    for (let index = 0; index < playersLength; index++) {
                        const userId = players[index].userId;
                        this.$set(this.players, userId, Object.assign({}, players[index]));

                        if (!this.loader.resources['player' + userId])
                            this.loader.add('player' + userId, players[index].avatar);
                    }

                    this.setRoomState(this.gameStatuses.play);
                }


                this.app = new PIXI.Application({
                    autoResize: true,
                    resolution: devicePixelRatio,
                    antialias: true,
                    transparent: true,
                });

                this.app.stage.sortableChildren = true;
                this.app.renderer.plugins.interaction.autoPreventDefault = false;
                this.app.renderer.view.style.touchAction = 'auto';

                this.$refs.game.appendChild(this.app.view);

                this.loader.load(() => {
                    buttonStyle = new PIXI.TextStyle({
                        fontFamily: fontFamily.name,
                        fontSize: 14,
                        fontWeight: 'normal',
                        fill: '#fff',
                        isDigit: 1,
                        letterSpacing: 0.5,
                    });

                    statusStyle = buttonStyle;

                    this.cardTextures = this.loader.resources.cards.textures;
                    this.controlTextures = this.loader.resources.controls.textures;
                    this.suitsTextures = this.loader.resources.suits.textures;

                    this.prepareSprites();

                    if (!PIXI.utils.isMobile.phone) {
                        this.app.stage.addChild(this.sprites.bg);
                    }
                    this.sprites.myCards = new PIXI.Container();
                    this.sprites.myCards.zIndex = 1;
                    this.sprites.tableCards = new PIXI.Container();
                    this.sprites.tableCards.zIndex = 1;
                    this.sprites.tableHoverCards = new PIXI.Container();
                    this.sprites.tableHoverCards.zIndex = 1;
                    this.sprites.deckCards = new PIXI.Container();
                    this.sprites.deckCards.zIndex = 1;
                    this.sprites.controls.container = new PIXI.Container();
                    this.sprites.controls.container.zIndex = 1;
                    this.sprites.controls.container.visible = false;

                    this.app.stage.addChild(this.sprites.deckCards);
                    this.app.stage.addChild(this.sprites.myCards);
                    this.app.stage.addChild(this.sprites.tableCards);
                    this.app.stage.addChild(this.sprites.tableHoverCards);
                    this.app.stage.addChild(this.sprites.controls.container);

                    for (let userId in this.players) {
                        if (!this.isCurrentUser(userId)) {
                            this.$set(this.sprites.otherCards, userId, new PIXI.Container());
                            this.sprites.otherCards[userId].zIndex = 1;

                            this.$set(this.containers.players, userId, new PIXI.Container());
                            this.containers.players[userId].zIndex = 1;

                            this.containers.players[userId].addChild(this.sprites.otherCards[userId]);
                            this.app.stage.addChild(this.containers.players[userId]);
                        }
                    }

                    window.addEventListener('resize', this.canvasResize, false);
                    this.canvasResize();

                    for (let userId in this.players) {
                        if (!this.isCurrentUser(userId)) {
                            this.drawAvatar(userId);
                            this.drawStatuses(userId);
                        }
                    }

                    this.setPlayersStatus();
                    this.drawControls();
                });
            }

        },

        prepareSprites() {
            const self = this;

            function onCardClick() {
                self.socket.emit('playCard', {
                    cardIndex: this.index,
                });
            }

            for (let textureName in this.cardTextures) {
                this.sprites.cards[textureName] = new PIXI.Sprite(this.cardTextures[textureName]);

                if (textureName !== 'back') {
                    this.sprites.cards[textureName].interactive = true;
                    this.sprites.cards[textureName].on('pointerdown', onCardClick);
                }
            }

            if (!PIXI.utils.isMobile.phone)
                this.sprites.bg = new PIXI.Sprite(this.loader.resources.bg.texture);

            const digitStyle = new PIXI.TextStyle({
                fontFamily: fontFamily.name,
                fontSize: 24,
                fontWeight: 'normal',
                fill: '#fff',
                isDigit: 1,
            });

            let avatarTexture = {};

            for (let userId in this.players) {
                if (!this.isCurrentUser(this.players[userId].userId)) {
                    avatarTexture = PIXI.Texture.from(this.players[userId].avatar);
                    avatarTexture.transparent = true;
                    this.sprites.avatars[userId] = new PIXI.Sprite(avatarTexture);
                    this.sprites.otherCardsCount[userId] = new PIXI.Text('0', digitStyle);
                    this.sprites.otherCardsCount[userId].roundPixels = true;

                }
            }

            this.deckCardsCountDigit = new PIXI.Text(this.deckCardsCount, digitStyle);
            this.deckCardsCountDigit.roundPixels = true;
        },

        drawBoard() {
            if (this.sprites.myCards) {
                this.sprites.myCards.removeChildren();
            }

            if (this.sprites.tableCards) {
                this.sprites.tableCards.removeChildren();
            }

            if (this.sprites.tableHoverCards) {
                this.sprites.tableHoverCards.removeChildren();
            }

            if (this.sprites.deckCards) {
                this.sprites.deckCards.removeChildren();
            }

            this.drawPlayers();
            this.drawTable();
            this.drawDeck();
        },

        drawPlayers() {
            let card;
            const players = this.players;

            for (let userId in players) {
                if (userId in this.sprites.otherCards)
                    this.sprites.otherCards[userId].removeChildren();

                const playerCardsLength = players[userId].cards.length;

                const slunged = _.filter(this.cards.table, card => card.isSlung);
                const notCovered = this.cards.table.length - slunged.length < slunged.length;

                if (this.isCurrentUser(players[userId].userId)) {
                    if (players[userId].isActive) {
                        this.sprites.controls.container.visible = true;
                        if (players[userId].isDefender) {
                            this.sprites.controls.take.visible = true;
                            this.control2.visible = true;
                            this.sprites.controls.beat.visible = false;
                            this.sprites.controls.give.visible = false;
                        } else {
                            if (this.cards.table.length) {
                                if (notCovered) {
                                    this.sprites.controls.take.visible = false;
                                    this.sprites.controls.give.visible = true;
                                    this.control2.visible = false;
                                    this.sprites.controls.beat.visible = false;

                                } else {
                                    this.sprites.controls.take.visible = false;
                                    this.control2.visible = false;
                                    this.sprites.controls.give.visible = false;
                                    this.sprites.controls.beat.visible = true;

                                }
                            } else {
                                this.sprites.controls.container.visible = false;
                                this.sprites.controls.take.visible = false;
                                this.control2.visible = false;
                                this.sprites.controls.beat.visible = false;
                                this.sprites.controls.give.visible = false;
                            }
                        }
                    } else
                        this.sprites.controls.container.visible = false;
                } else {
                    const activePlayerCircle = this.containers.players[userId].getChildByName('activePlayerCircle');
                    if (activePlayerCircle)
                        activePlayerCircle.visible = +this.activePlayerId === +userId;
                }

                let lastCardX = 0;

                for (let cardIndex = 0; cardIndex < playerCardsLength; cardIndex++) {
                    const currentCard = players[userId].cards[cardIndex];

                    if (!currentCard.isDown)
                        card = this.sprites.cards[currentCard.suit + '_' + currentCard.rank];
                    else
                        card = new PIXI.Sprite(this.cardTextures.back);

                    card.index = cardIndex;
                    card.angle = 0;
                    card.y = 0;
                    card.anchor.set(0, 0);

                    if (this.isCurrentUser(players[userId].userId)) {
                        card.width = this.view.cardWidth * 0.85;
                        card.height = this.view.cardHeight * 0.85;
                        card.x = this.view.myCardPaddingX * card.index;

                        this.sprites.myCards.addChild(card);
                    } else {
                        card.width = this.view.otherCardWidth;
                        card.height = this.view.otherCardHeight;
                        card.x = this.view.avatarWidth + (this.view.myCardPaddingX * card.index) / 10;

                        this.sprites.otherCards[userId].addChild(card);

                        lastCardX = card.x;
                    }
                }

                if (!this.isCurrentUser(players[userId].userId)) {
                    this.sprites.otherCardsCount[userId].x = lastCardX + this.view.otherCardWidth / 2;
                    this.sprites.otherCardsCount[userId].y = this.view.otherCardHeight / 2;

                    this.sprites.otherCardsCount[userId].anchor.set(0.5, 0.5);
                    this.sprites.otherCardsCount[userId].text = this.sprites.otherCards[userId].children.length;
                    this.sprites.otherCards[userId].addChild(this.sprites.otherCardsCount[userId]);
                }

                this.sprites.myCards.pivot.x = ((this.sprites.myCards.children.length - 1) * this.view.myCardPaddingX + this.view.cardWidth) / 2;
            }
            this.setPlayersStatus();
        },

        drawTable() {
            let card;
            let slungY = 0;
            let hoverY = 0;

            for (let i = 0, s = 0, h = 0; i < this.cards.table.length; i++) {
                const currentCard = this.cards.table[i];

                card = this.sprites.cards[currentCard.suit + '_' + currentCard.rank];
                card.index = i;

                card.width = this.view.tableCardWidth;
                card.height = this.view.tableCardHeight;

                card.angle = 0;
                card.anchor.set(0, 0);

                if (currentCard.isSlung) {
                    card.y = slungY;
                    card.x = (card.width + this.view.tableCardPaddingX) * s;
                    this.sprites.tableCards.addChild(card);
                    s++;

                    if (PIXI.utils.isMobile.phone) {
                        if (this.sprites.tableCards.children.length === 3) {
                            slungY = this.view.tableCardHeight + this.view.tableCardPaddingY + this.view.tableCardPaddingY / 2;
                            s = 0;
                        }
                    }
                } else {
                    card.y = hoverY;
                    card.x = (card.width + this.view.tableCardPaddingX) * h;
                    this.sprites.tableHoverCards.addChild(card);
                    h++;

                    if (PIXI.utils.isMobile.phone) {
                        if (this.sprites.tableHoverCards.children.length === 3) {
                            hoverY = this.view.tableCardHeight + this.view.tableCardPaddingY + this.view.tableCardPaddingY / 2;
                            h = 0;
                        }
                    }
                }
            }

            if (!PIXI.utils.isMobile.phone) {
                this.sprites.tableCards.pivot.x = ((this.sprites.tableCards.children.length - 1) * this.view.tableCardWidth) / 2;
                this.sprites.tableHoverCards.pivot.x = ((this.sprites.tableCards.children.length - 1) * this.view.tableCardWidth) / 2;
            } else {
                this.sprites.tableCards.pivot.x = (Math.min((this.sprites.tableCards.children.length - 1), 2) * this.view.tableCardWidth) / 2;
                this.sprites.tableHoverCards.pivot.x = (Math.min((this.sprites.tableCards.children.length - 1), 2) * this.view.tableCardWidth) / 2;
            }
        },
        drawButtonControl(width, height) {
            const control = new PIXI.Graphics();


            control.beginFill(0x68a56b);
            control.alpha = 0.5;
            control.interactive = true;
            control.buttonMode = true;

            control.lineStyle(1, 0x182341);

            control.drawRoundedRect(0, 0, width, height, 5);
            control.name = 'controlButton';
            control.endFill();
            return control
        },
        drawControls() {
            const control = this.drawButtonControl(60, 30)
            control.on('pointerdown', this.skipStep);
            this.control2 = this.drawButtonControl(120, 30)
            this.control2.on('changeMode', this.changeMode);
            this.control2.x = this.sprites.controls.width - 180;

            this.sprites.controls.take = new PIXI.Text(lang('game.fool.i_take'), buttonStyle);
            this.sprites.controls.roundPixels = true;
            this.sprites.controls.take.anchor.set(0.5, 0.5);
            this.sprites.controls.take.position.set(this.sprites.controls.width / 2, this.sprites.controls.height / 2);

            this.sprites.controls.give = new PIXI.Text(lang('game.fool.take_it'), buttonStyle);
            this.sprites.controls.roundPixels = true;
            this.sprites.controls.give.anchor.set(0.5, 0.5);
            this.sprites.controls.give.position.set(this.sprites.controls.width / 2, this.sprites.controls.height / 2);

            this.sprites.controls.beat = new PIXI.Text(lang('game.fool.beat'), buttonStyle);
            this.sprites.controls.roundPixels = true;
            this.sprites.controls.beat.anchor.set(0.5, 0.5);
            this.sprites.controls.beat.position.set(this.sprites.controls.width / 2, this.sprites.controls.height / 2);

            this.sprites.controls.transfer = new PIXI.Text(lang('game.fool.transfer'), buttonStyle);
            this.sprites.controls.roundPixels = true;
            this.sprites.controls.transfer.anchor.set(0.5, 0.5);
            this.sprites.controls.transfer.position.set(60, this.sprites.controls.height / 2);

            this.sprites.controls.beat.visible = false;
            this.sprites.controls.take.visible = false;
            this.sprites.controls.give.visible = false;

            this.sprites.controls.container.addChild(control);
            this.sprites.controls.container.addChild(this.control2);

            this.sprites.controls.container.addChild(this.sprites.controls.take);
            this.control2.addChild(this.sprites.controls.transfer);
            this.sprites.controls.container.addChild(this.sprites.controls.beat);
            this.sprites.controls.container.addChild(this.sprites.controls.give);
        },

        drawStatuses(userId) {
            _.forIn(this.playerStatuses, (label, name) => {
                const container = new PIXI.Container();

                container.position.set(0, this.view.avatarHeight);

                container.name = name;
                container.visible = false;

                const labelBg = new PIXI.Graphics();

                labelBg.lineStyle(1, 0xffffff, 0.9);
                labelBg.beginFill(0x68a56b);
                labelBg.drawRoundedRect(0, 0, this.view.avatarWidth + this.view.avatarBorder * 4, this.view.avatarWidth / 2.5, 5);
                labelBg.endFill();

                labelBg.position.x = (this.view.avatarWidth + this.view.avatarBorder * 2) / 2;
                labelBg.pivot.x = labelBg.width / 2;

                labelBg.zIndex = 2;

                const statusLabel = new PIXI.Text(label, statusStyle);
                statusLabel.zIndex = 2;
                statusLabel.anchor.set(0.5, 0.5);
                statusLabel.position.set(labelBg.width / 2, labelBg.height / 2);
                statusLabel.roundPixels = true;

                labelBg.addChild(statusLabel);
                container.addChild(labelBg);

                this.containers.players[userId].addChild(container);
            });
        },

        drawAvatar(userId) {
            const avatarRadius = this.view.avatarWidth / 2;

            const x = this.view.avatarBorder;
            const y = this.view.avatarBorder;

            const avatarTexture = this.loader.resources['player' + userId].texture;

            const scale = this.view.avatarWidth / avatarTexture.width;
            const avatar = new PIXI.Graphics();

            avatar.beginTextureFill({
                texture: avatarTexture,
                color: 0xffffff,
                alpha: 1,
                matrix: new PIXI.Matrix(scale, 0, 0, scale, x, y)
            });

            avatar.lineStyle(4, 0x247cda);
            avatar.drawCircle(x + avatarRadius, y + avatarRadius, avatarRadius);
            avatar.endFill();

            const activePlayerCircle = new PIXI.Graphics();

            activePlayerCircle.lineStyle(4, 0xe7603e);
            activePlayerCircle.drawCircle(x + avatarRadius, y + avatarRadius, avatarRadius);
            activePlayerCircle.endFill();

            activePlayerCircle.name = 'activePlayerCircle';
            activePlayerCircle.visible = false;
            activePlayerCircle.zIndex = 2;

            avatar.zIndex = 1;
            avatar.name = 'player' + userId;

            this.containers.players[userId].addChild(avatar);
            this.containers.players[userId].addChild(activePlayerCircle);
        },

        drawDeck() {
            let card;

            const cardDeckReverse = this.cards.deck.slice().reverse();
            const deckLength = cardDeckReverse.length;

            for (let i = 0; i < deckLength; i++) {
                const currentCard = cardDeckReverse[i];

                if (i === 0)
                    card = this.sprites.cards[currentCard.suit + '_' + currentCard.rank];
                else
                    card = new PIXI.Sprite(this.cardTextures.back);

                card.index = i;

                card.width = this.view.deckCardWidth;
                card.height = this.view.deckCardHeight;

                if (i === 0) {
                    card.anchor.set(0.5, 0.5);
                } else {
                    card.angle = 90;
                    card.anchor.set(0, 0.5);
                }

                this.sprites.deckCards.addChild(card);
            }

            if (deckLength > 1) {
                if (PIXI.utils.isMobile) {
                    this.deckCardsCountDigit.anchor.set(0.5, -0.3);
                } else {
                    this.deckCardsCountDigit.anchor.set(0.5, -0.5);
                }

                this.deckCardsCountDigit.text = deckLength;

                this.sprites.deckCards.addChild(this.deckCardsCountDigit);
            } else if (!deckLength) {
                const suit = new PIXI.Sprite(this.suitsTextures[this.cards.trump.suit]);

                suit.width = 40;
                suit.height = 40;

                suit.anchor.set(0.5, 0.5);

                this.sprites.deckCards.addChild(suit);
            }
        },

        dealtCards(userId, cardsCount) {
            const cards = [];

            while (cardsCount) {
                cards.push({isDown: 1});
                cardsCount--;
            }

            return cards;
        },

        onCardPlayed({playerId, cardIndex, card, nextPlayerId}) {
            this.players[playerId].cards.splice(cardIndex, 1);
            this.cards.table.push(card);
            this.setNextPlayerId(nextPlayerId);

            this.drawBoard();

            if (this.volume)
                this.sound.play('turn');
        },

        onStepSkipped({takerId, nextPlayerId}) {
            if (takerId)
                this.setTakerPlayer(takerId);

            this.setNextPlayerId(nextPlayerId);
            this.drawBoard();
        },

        playCard(cardIndex) {
            this.socket.emit('playCard', {
                cardIndex: cardIndex,
            });
        },

        skipStep() {
            if (this.cards.table.length)
                this.socket.emit('skipStep');
        },
        changeMode() {
            const coverCards = this.cards.table.filter((card) => {
                return !card.isSlung
            })

            if (coverCards.length === 0) {
                this.socket.emit('changeMode');
            }
        },
        makeDeck() {
            const initDeck = [];

            while (this.deckCardsCount) {
                initDeck.push({isDown: 1, isSelected: 0});
                this.deckCardsCount--;
            }

            return _.shuffle(initDeck);
        },

        resetState() {
            this.players = {};
            this.cards.deck = [];
            this.cards.table = [];
            this.cards.trump = undefined;

            this.setRoomState(this.gameStatuses.init);
        },

        setNextPlayerId(playerId) {
            if (playerId) {
                for (let userId in this.players) {
                    this.players[userId].isActive = 0;
                }
                this.players[playerId].isActive = 1;
                this.activePlayerId = playerId;
            }
        },

        setTakerPlayer(playerId) {
            this.players[playerId].isTaker = 1;
        },

        setPlayersStatus() {
            for (let userId in this.players) {
                if (!this.isCurrentUser(userId)) {
                    _.forIn(this.playerStatuses, (label, name) => {
                        const status = this.containers.players[userId].getChildByName(name);
                        if (status) {
                            if (this.players[userId].isLeave) {
                                status.visible = false;
                            } else if (this.players[userId].isDefender) {
                                if (name !== 'isActive')
                                    status.visible = !!(status && this.players[userId][name]);
                                else
                                    status.visible = false;
                            } else
                                status.visible = !!(status && this.players[userId][name]);
                        }
                    });
                }
            }
        },

        onPlayerLeft({playerId}) {
            if (this.players[playerId] && this.containers.players[playerId]) {
                const avatarContainer = this.containers.players[playerId].getChildByName('player' + playerId);
                this.$set(this.players[playerId], 'isLeave', 1);

                if (avatarContainer)
                    avatarContainer.alpha = 0.5;

                _.forIn(this.playerStatuses, (label, name) => {
                    const status = this.containers.players[playerId].getChildByName(name);
                    if (status)
                        status.visible = false;
                });
            }
        },

        errorsHandle() {
            this.socket.on('userError', error => {
                console.log("error:", error);
            });
        },

        roomInPlay,
    },

    watch: {
        activePlayerId(current) {
            this.setCurrentPlayer(this.players[current]);
        }
    }
};
</script>
<style src="../scss/game.scss" lang="scss"></style>

