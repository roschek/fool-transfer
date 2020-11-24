<template>
    <div
        class="gamecard_stack"
        :class="cardClasses"
    >
        <template v-if="card && !card.isDown">
            <div class="rank">{{ card.name }}</div>
            <div class="rank">{{ symbols[`${card.suit}`] }}</div>
            <div class="rank bottom">{{ symbols[`${card.suit}`] }}</div>
            <div class="rank bottom">{{ card.name }}</div>
        </template>
    </div>
</template>
<script>
    import {symbols} from "../../src/settings.js";

    export default {
        name: "Card",

        props: {
            card: Object,
        },

        data: function() {
            return {
                symbols: symbols,
            };
        },

        computed: {
            cardClasses() {
                return [
                    this.card && !this.card.isDown ? this.card.suit : 'down',
                    this.card.isSelected ? 'selected' : 'not_selected',
                ];
            }
        },
    };
</script>
