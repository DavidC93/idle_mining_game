/* Achievement checking. Cheap enough to run a few times a second. */
(function (G) {
  'use strict';

  function check(s) {
    var earned = null;
    for (var i = 0; i < G.ACHIEVEMENTS.length; i++) {
      var a = G.ACHIEVEMENTS[i];
      if (s.achievements[a.id]) continue;
      if (a.test(s)) {
        s.achievements[a.id] = Date.now();
        (earned || (earned = [])).push(a);
        G.bus.emit('achievement', { s: s, ach: a });
      }
    }
    return earned;
  }

  function count(s) {
    var n = 0;
    for (var i = 0; i < G.ACHIEVEMENTS.length; i++) if (s.achievements[G.ACHIEVEMENTS[i].id]) n++;
    return n;
  }

  function rewardText(a) {
    if (!a.reward) return '';
    var labels = {
      power: 'עוצמת כרייה', yield: 'כמות משאבים', price: 'מחירי מכירה',
      forge: 'מהירות היתוך', crew: 'תפוקת צוות', luck: 'מזל', critMult: 'נזק קריטי'
    };
    if (a.reward.mult) return '+' + Math.round(a.reward.v * 100) + '% ' + labels[a.reward.mult];
    return '+' + (a.reward.v * 100).toFixed(1) + '% ' + (labels[a.reward.add] || a.reward.add);
  }

  G.Achievements = { check: check, count: count, rewardText: rewardText };
})(typeof globalThis.MG !== 'undefined' ? globalThis.MG : (globalThis.MG = {}));
