/* Prestige layer: "התמוטטות" (cave-in) resets the run and pays out ליבות סלע
   (Bedrock Cores).

   Two currencies come out of one number, deliberately:
     - coresTotal  — every core ever earned, never spent, granting a flat +2%
                     mining power each. Prestiging is therefore never a loss.
     - cores       — the spendable pool for the talent tree below.
   That split removes the "should I save my angels?" agonising that sours a lot
   of idle prestige systems, and keeps every reset unambiguously good. */
(function (G) {
  'use strict';

  var PRESTIGE = {
    /* You cannot collapse the mine before this — it stops new players from
       burning their run for 2 cores and souring the mechanic. */
    minDepth: 1200,
    depthCoeff: 12,
    depthExp: 1.45,
    /* Gold contributes logarithmically. A power-law term here looked fine on
       paper and then paid out 10^21 cores, because gold spans sixty orders of
       magnitude over a long game while depth spans four. Depth is what the
       player is actually pushing against, so depth is what cores measure. */
    goldCoeff: 3,
    goldFloor: 1e6,
    perCorePower: 0.02
  };

  function coresFor(runDepth, runGold, bonusMult) {
    if (runDepth < PRESTIGE.minDepth) return 0;
    var a = PRESTIGE.depthCoeff * Math.pow(runDepth / 1000, PRESTIGE.depthExp);
    var b = 0;
    if (runGold > PRESTIGE.goldFloor) {
      b = PRESTIGE.goldCoeff * Math.log10(runGold / PRESTIGE.goldFloor);
    }
    return Math.floor((a + b) * (bonusMult || 1));
  }

  /* base/rate give cost(level) = base * rate^level. */
  var TALENTS = [
    { id: 'veteran', name: 'ותיק המעמקים', icon: '💪', max: 50, base: 3, rate: 1.20,
      desc: 'כל רמה: +30% לעוצמת הכרייה.', effect: { mult: 'power', per: 0.30 } },

    { id: 'richVeins', name: 'עורקים עשירים', icon: '🪨', max: 40, base: 4, rate: 1.22,
      desc: 'כל רמה: +25% לכמות המשאבים.', effect: { mult: 'yield', per: 0.25 } },

    { id: 'goldTouch', name: 'מגע הזהב', icon: '🪙', max: 40, base: 4, rate: 1.21,
      desc: 'כל רמה: +25% למחירי מכירה.', effect: { mult: 'price', per: 0.25 } },

    { id: 'momentum', name: 'תנופה', icon: '🌊', max: 30, base: 6, rate: 1.24,
      desc: 'כל רמה: +0.2 מ׳ להתקדמות בעומק לכל שבירה.', effect: { add: 'depthFlat', per: 0.2 } },

    { id: 'forgemaster', name: 'אמן הכבשן', icon: '🔥', max: 30, base: 5, rate: 1.22,
      desc: 'כל רמה: +35% למהירות ההיתוך.', effect: { mult: 'forge', per: 0.35 } },

    { id: 'prospector', name: 'מחפש מנוסה', icon: '🔭', max: 20, base: 8, rate: 1.28,
      desc: 'כל רמה: +2.5% לסיכוי למצוא נדירים.', effect: { add: 'luck', per: 0.025 } },

    { id: 'unstoppable', name: 'בלתי ניתן לעצירה', icon: '⚡', max: 20, base: 10, rate: 1.28,
      desc: 'כל רמה: +2% סיכוי קריטי ו‑+30% נזק קריטי.',
      effect: { multi: [{ add: 'crit', per: 0.02 }, { add: 'critMult', per: 0.30 }] } },

    { id: 'crewLegacy', name: 'מורשת הצוות', icon: '👥', max: 25, base: 7, rate: 1.22,
      desc: 'כל רמה: +30% לתפוקת הצוות.', effect: { mult: 'crew', per: 0.30 } },

    { id: 'deepStart', name: 'שורשים עמוקים', icon: '⬇', max: 24, base: 6, rate: 1.26,
      desc: 'כל רמה: מתחיל כל ריצה 150 מ׳ עמוק יותר (והשכבות עד שם פתוחות).',
      effect: { add: 'startDepth', per: 150 } },

    { id: 'heirloom', name: 'ירושת משפחה', icon: '⛏', max: 8, base: 15, rate: 1.45,
      desc: 'כל רמה: שומר דרגת מכוש אחת נוספת אחרי התמוטטות.',
      effect: { add: 'keepPick', per: 1 } },

    { id: 'foreman', name: 'מנהל עבודה', icon: '🌙', max: 20, base: 6, rate: 1.20,
      desc: 'כל רמה: +30% ליעילות לא־מקוונת ו‑+1 שעה לתקרת הצבירה.',
      effect: { multi: [{ add: 'offline', per: 0.30 }, { add: 'offlineCap', per: 3600 }] } },

    { id: 'coreAffinity', name: 'זיקה לליבה', icon: '💠', max: 25, base: 12, rate: 1.26,
      desc: 'כל רמה: +12% ליבות בהתמוטטות הבאה.', effect: { add: 'coreBonus', per: 0.12 } },

    { id: 'inheritance', name: 'הון פתיחה', icon: '💰', max: 15, base: 5, rate: 1.27,
      desc: 'כל רמה: מתחיל ריצה חדשה עם יותר כסף (גדל אקספוננציאלית).',
      effect: { add: 'startGoldLevels', per: 1 } },

    { id: 'stockpile', name: 'מחסן חירום', icon: '📦', max: 10, base: 20, rate: 1.35,
      desc: 'כל רמה: שומר 8% מהמשאבים בהתמוטטות.', effect: { add: 'keepRes', per: 0.08 } }
  ];

  var byId = {};
  for (var i = 0; i < TALENTS.length; i++) byId[TALENTS[i].id] = TALENTS[i];

  function talentCost(t, level) { return Math.ceil(t.base * Math.pow(t.rate, level)); }

  G.PRESTIGE = PRESTIGE;
  G.TALENTS = TALENTS;
  G.TALENT_BY_ID = byId;
  G.coresFor = coresFor;
  G.talentCost = talentCost;
})(typeof globalThis.MG !== 'undefined' ? globalThis.MG : (globalThis.MG = {}));
