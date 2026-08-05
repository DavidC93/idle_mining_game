/* Achievements. Each one grants a small permanent multiplier that survives
   prestige, so the "background" progress bar never stops filling even during a
   run that is going badly. Cheap to write, disproportionately good at keeping
   people playing. */
(function (G) {
  'use strict';

  function depthTier(m, mult) {
    return { test: function (s) { return s.stats.maxDepthEver >= m; },
             goal: m, prog: function (s) { return s.stats.maxDepthEver; },
             reward: { mult: 'power', v: mult } };
  }
  function breakTier(n, mult) {
    return { test: function (s) { return s.stats.totalBreaks >= n; },
             goal: n, prog: function (s) { return s.stats.totalBreaks; },
             reward: { mult: 'yield', v: mult } };
  }
  function goldTier(n, mult) {
    return { test: function (s) { return s.stats.lifetimeGold >= n; },
             goal: n, prog: function (s) { return s.stats.lifetimeGold; },
             reward: { mult: 'price', v: mult } };
  }
  function smeltTier(n, mult) {
    return { test: function (s) { return s.stats.totalSmelted >= n; },
             goal: n, prog: function (s) { return s.stats.totalSmelted; },
             reward: { mult: 'forge', v: mult } };
  }

  var A = [
    { id: 'd1',  name: 'ראשית הדרך',      icon: '🌱', desc: 'הגע לעומק 50 מ׳.',       group: 'depth' },
    { id: 'd2',  name: 'מתחת לחצץ',       icon: '🪨', desc: 'הגע לעומק 200 מ׳.',      group: 'depth' },
    { id: 'd3',  name: 'כורה של ממש',     icon: '⛏', desc: 'הגע לעומק 500 מ׳.',      group: 'depth' },
    { id: 'd4',  name: 'עמוק מדי',        icon: '🕳', desc: 'הגע לעומק 1,600 מ׳.',    group: 'depth' },
    { id: 'd5',  name: 'נושם אש',         icon: '🌋', desc: 'הגע לעומק 2,600 מ׳.',    group: 'depth' },
    { id: 'd6',  name: 'צוללן תהום',      icon: '🌑', desc: 'הגע לעומק 4,000 מ׳.',    group: 'depth' },
    { id: 'd7',  name: 'נוגע בריק',       icon: '🌀', desc: 'הגע לעומק 6,000 מ׳.',    group: 'depth' },
    { id: 'd8',  name: 'ליבת כדור הארץ',  icon: '🔆', desc: 'הגע לעומק 8,500 מ׳.',    group: 'depth' },
    { id: 'd9',  name: 'לב סלע האם',      icon: '💠', desc: 'הגע לעומק 12,000 מ׳.',   group: 'depth' },
    { id: 'd10', name: 'מעבר לכל קרקעית', icon: '♾', desc: 'הגע לעומק 20,000 מ׳.',   group: 'depth' },

    { id: 'b1', name: 'מכה ראשונה',    icon: '👊', desc: 'שבור 100 סלעים.',          group: 'breaks' },
    { id: 'b2', name: 'שגרה',          icon: '🔁', desc: 'שבור 2,500 סלעים.',        group: 'breaks' },
    { id: 'b3', name: 'מנפץ סלעים',    icon: '💢', desc: 'שבור 25,000 סלעים.',       group: 'breaks' },
    { id: 'b4', name: 'כוח טבע',       icon: '🌪', desc: 'שבור 250,000 סלעים.',      group: 'breaks' },
    { id: 'b5', name: 'המכוש הנצחי',   icon: '♾', desc: 'שבור 2,500,000 סלעים.',    group: 'breaks' },

    { id: 'g1', name: 'המטבע הראשון',  icon: '🪙', desc: 'הרווח 1,000 זהב במצטבר.',  group: 'gold' },
    { id: 'g2', name: 'סוחר',          icon: '💵', desc: 'הרווח 1M זהב במצטבר.',     group: 'gold' },
    { id: 'g3', name: 'ברון מכרות',    icon: '🏦', desc: 'הרווח 1B זהב במצטבר.',     group: 'gold' },
    { id: 'g4', name: 'טייקון',        icon: '💎', desc: 'הרווח 1T זהב במצטבר.',     group: 'gold' },
    { id: 'g5', name: 'כלכלה עצמאית',  icon: '🌐', desc: 'הרווח 1Qa זהב במצטבר.',    group: 'gold' },

    { id: 's1', name: 'הצתה',          icon: '🔥', desc: 'התך 50 פריטים.',           group: 'smelt' },
    { id: 's2', name: 'נפח',           icon: '🔨', desc: 'התך 2,000 פריטים.',        group: 'smelt' },
    { id: 's3', name: 'מפעל',          icon: '🏭', desc: 'התך 100,000 פריטים.',      group: 'smelt' },
    { id: 's4', name: 'תעשייה כבדה',   icon: '⚙', desc: 'התך 5,000,000 פריטים.',    group: 'smelt' },

    { id: 'p1', name: 'התחלה מחדש',    icon: '🔄', desc: 'בצע התמוטטות פעם אחת.',
      test: function (s) { return s.stats.prestiges >= 1; }, goal: 1,
      prog: function (s) { return s.stats.prestiges; }, reward: { mult: 'power', v: 0.15 } },
    { id: 'p2', name: 'מעגל הנצח',     icon: '🌗', desc: 'בצע 10 התמוטטויות.',
      test: function (s) { return s.stats.prestiges >= 10; }, goal: 10,
      prog: function (s) { return s.stats.prestiges; }, reward: { mult: 'power', v: 0.3 } },
    { id: 'p3', name: 'לולאה אינסופית',icon: '🔮', desc: 'בצע 50 התמוטטויות.',
      test: function (s) { return s.stats.prestiges >= 50; }, goal: 50,
      prog: function (s) { return s.stats.prestiges; }, reward: { mult: 'power', v: 0.75 } },

    { id: 'c1', name: 'צוות ראשון',    icon: '👷', desc: 'שכור 10 אנשי צוות.',
      test: function (s) { return crewCount(s) >= 10; }, goal: 10, prog: crewCount,
      reward: { mult: 'crew', v: 0.25 } },
    { id: 'c2', name: 'משמרת מלאה',    icon: '👥', desc: 'שכור 100 אנשי צוות.',
      test: function (s) { return crewCount(s) >= 100; }, goal: 100, prog: crewCount,
      reward: { mult: 'crew', v: 0.5 } },

    { id: 'k1', name: 'נגר',           icon: '⛏', desc: 'חשל מכוש דרגה 5.',
      test: function (s) { return s.pickTier >= 5; }, goal: 5,
      prog: function (s) { return s.pickTier; }, reward: { mult: 'power', v: 0.2 } },
    { id: 'k2', name: 'אמן נשק',       icon: '🗡', desc: 'חשל מכוש דרגה 12.',
      test: function (s) { return s.pickTier >= 12; }, goal: 12,
      prog: function (s) { return s.pickTier; }, reward: { mult: 'power', v: 0.4 } },
    { id: 'k3', name: 'מכוש הקדומים',  icon: '🌟', desc: 'חשל את המכוש האחרון.',
      test: function (s) { return s.pickTier >= 19; }, goal: 19,
      prog: function (s) { return s.pickTier; }, reward: { mult: 'power', v: 1.0 } },

    { id: 'x1', name: 'מזל של מתחיל',  icon: '🍀', desc: 'מצא 100 ממצאים נדירים.',
      test: function (s) { return s.stats.rareFinds >= 100; }, goal: 100,
      prog: function (s) { return s.stats.rareFinds; }, reward: { add: 'luck', v: 0.02 } },
    { id: 'x2', name: 'ציד אוצרות',    icon: '🎁', desc: 'פתח 250 צמתים מיוחדים.',
      test: function (s) { return s.stats.specialNodes >= 250; }, goal: 250,
      prog: function (s) { return s.stats.specialNodes; }, reward: { mult: 'yield', v: 0.3 } },
    { id: 'x3', name: 'שובר שיאים',    icon: '💥', desc: 'בצע 10,000 מכות קריטיות.',
      test: function (s) { return s.stats.crits >= 10000; }, goal: 10000,
      prog: function (s) { return s.stats.crits; }, reward: { add: 'critMult', v: 0.5 } },
    { id: 'x4', name: 'ממלא חוזים',    icon: '📜', desc: 'השלם 50 חוזים.',
      test: function (s) { return s.stats.contractsDone >= 50; }, goal: 50,
      prog: function (s) { return s.stats.contractsDone; }, reward: { mult: 'price', v: 0.3 } }
  ];

  function crewCount(s) {
    var n = 0;
    for (var k in s.crew) if (s.crew.hasOwnProperty(k)) n += s.crew[k].length;
    return n;
  }

  /* Fill in the templated groups. */
  var depths = [[50, 0.05], [200, 0.05], [500, 0.08], [1600, 0.10], [2600, 0.12],
                [4000, 0.15], [6000, 0.20], [8500, 0.25], [12000, 0.35], [20000, 0.5]];
  var breaks = [[100, 0.05], [2500, 0.08], [25e3, 0.12], [250e3, 0.2], [2.5e6, 0.35]];
  var golds  = [[1e3, 0.05], [1e6, 0.08], [1e9, 0.12], [1e12, 0.2], [1e15, 0.35]];
  var smelts = [[50, 0.08], [2000, 0.12], [100e3, 0.2], [5e6, 0.35]];
  var di = 0, bi = 0, gi = 0, si = 0;
  for (var i = 0; i < A.length; i++) {
    var a = A[i], t;
    if (a.group === 'depth')  { t = depthTier(depths[di][0], depths[di][1]); di++; }
    else if (a.group === 'breaks') { t = breakTier(breaks[bi][0], breaks[bi][1]); bi++; }
    else if (a.group === 'gold')   { t = goldTier(golds[gi][0], golds[gi][1]); gi++; }
    else if (a.group === 'smelt')  { t = smeltTier(smelts[si][0], smelts[si][1]); si++; }
    else continue;
    a.test = t.test; a.goal = t.goal; a.prog = t.prog; a.reward = t.reward;
  }

  var byId = {};
  for (i = 0; i < A.length; i++) byId[A[i].id] = A[i];

  G.ACHIEVEMENTS = A;
  G.ACH_BY_ID = byId;
})(typeof globalThis.MG !== 'undefined' ? globalThis.MG : (globalThis.MG = {}));
