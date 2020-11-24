import Vue from 'vue';
import FoolCap from './view/Game';

import alertPlugin from '../../js/plugins/alert.plugin';
import onClickInGame from '../../js/utils/alert';

import _get from 'lodash/get';

Vue.prototype.lang = string => _get(window.i18n, string);
Vue.use(alertPlugin);

document.addEventListener('click', onClickInGame);
const leaveButton = document.querySelector('[data-leave]');
if(leaveButton) {
    leaveButton.addEventListener('click', function() {
        if(leaveButton.dataset.leave)
            window.location.href = leaveButton.dataset.leave;
    });
}

new Vue({
    el: '#game',
    render: h => h(FoolCap),
});