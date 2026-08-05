/* Repeatable gold upgrades, one-shot automation unlocks, and the hireable crew.

   Costs grow exponentially (rate per level), effects grow multiplicatively but
   more slowly — the standard incremental-game arrangement where each purchase
   is a smaller step than the last, so the player is always shopping for the
   best marginal buy rather than mashing one button. */
(function (G) {
  'use strict';

  /* effect kinds are read by systems/stats.js.

     `readout` names the derived stat this upgrade actually moves, so the shop
     row can show the live number ("3.4 → 3.6 swings per second") instead of
     only promising a percentage. `kind` picks the formatting:
       num  — a plain quantity        mult — an "x2.4" multiplier
       pct  — a percentage            (lower: true marks lower-is-better)      */
  var UPGRADES = [
    { id: 'sharpness', name: 'חידוד המכוש', icon: '⛏',
      desc: 'כל רמה מוסיפה 8% לעוצמת הכרייה.',
      base: 25, rate: 1.35, effect: { mult: 'power', per: 0.08 },
      readout: { key: 'hitPower', label: 'עוצמת מכה', kind: 'num' } },

    { id: 'swiftness', name: 'זריזות ידיים', icon: '💨',
      desc: 'כל רמה מוסיפה 5% למהירות ההנפה.',
      base: 90, rate: 1.45, effect: { mult: 'speed', per: 0.05 }, max: 250,
      readout: { key: 'swingRate', label: 'הנפות בשנייה', kind: 'num' } },

    { id: 'yield', name: 'עגלה גדולה יותר', icon: '🛒',
      desc: 'כל רמה מוסיפה 7% לכמות המשאבים מכל שבירה.',
      base: 300, rate: 1.55, effect: { mult: 'yield', per: 0.07 },
      readout: { key: 'yieldPerBreak', label: 'משאבים לכל שבירה', kind: 'num' } },

    { id: 'excavation', name: 'טכניקת חפירה', icon: '📐',
      desc: 'כל רמה מוסיפה 0.08 מ׳ להתקדמות בעומק לכל שבירה.',
      base: 500, rate: 1.16, effect: { add: 'depthFlat', per: 0.08 }, max: 50,
      readout: { key: 'depthPerBreak', label: 'מטרים לכל שבירה', kind: 'num' } },

    { id: 'fortune', name: 'עין המחפש', icon: '🔍',
      desc: 'כל רמה מוסיפה 1.2% לסיכוי למצוא משאב נדיר משכבה עמוקה יותר (מקסימום 60%).',
      base: 1200, rate: 1.22, effect: { add: 'luck', per: 0.012 }, max: 35,
      readout: { key: 'luck', label: 'סיכוי לממצא נדיר', kind: 'pct' },
      unlock: { depth: 200 } },

    { id: 'critChance', name: 'מכת עורק', icon: '⚡',
      desc: 'כל רמה מוסיפה 0.8% לסיכוי למכה קריטית שמנפצת סלע מיידית.',
      base: 2500, rate: 1.24, effect: { add: 'crit', per: 0.008 }, max: 55,
      readout: { key: 'crit', label: 'סיכוי קריטי', kind: 'pct' },
      unlock: { depth: 350 } },

    { id: 'critPower', name: 'עוצמת ניפוץ', icon: '💥',
      desc: 'כל רמה מוסיפה 25% לנזק הקריטי ולשלל שהוא מפיל.',
      base: 4000, rate: 1.21, effect: { add: 'critMult', per: 0.25 },
      readout: { key: 'critMult', label: 'מכפיל שלל קריטי', kind: 'mult' },
      unlock: { upgrade: ['critChance', 5] } },

    { id: 'haggling', name: 'כושר מיקוח', icon: '💰',
      desc: 'כל רמה מוסיפה 6% למחירי המכירה בשוק.',
      base: 1800, rate: 1.50, effect: { mult: 'price', per: 0.06 },
      readout: { key: 'price', label: 'מחיר מכירה', kind: 'mult' } },

    { id: 'bellows', name: 'מפוח הכבשן', icon: '🔥',
      desc: 'כל רמה מוסיפה 8% למהירות ההיתוך.',
      base: 3000, rate: 1.70, effect: { mult: 'forge', per: 0.08 },
      readout: { key: 'forge', label: 'מהירות היתוך', kind: 'mult' },
      unlock: { unlocked: 'forge' } },

    { id: 'insulation', name: 'בידוד הכבשן', icon: '🧱',
      desc: 'כל רמה מפחיתה 4% מצריכת הדלק (מצטבר כפלית).',
      base: 5000, rate: 1.23, effect: { decay: 'fuel', per: 0.04 }, max: 60,
      readout: { key: 'fuel', label: 'צריכת דלק', kind: 'mult', lower: true },
      unlock: { unlocked: 'forge' } },

    { id: 'crewTraining', name: 'אימון הצוות', icon: '👷',
      desc: 'כל רמה מוסיפה 8% לתפוקת כל אנשי הצוות.',
      base: 12e3, rate: 1.70, effect: { mult: 'crew', per: 0.08 },
      readout: { key: 'crew', label: 'תפוקת צוות', kind: 'mult' },
      unlock: { unlocked: 'crew' } },

    { id: 'lanterns', name: 'פנסי מכרה', icon: '🏮',
      desc: 'כל רמה מוסיפה 10% לעוצמת הכרייה. אור זה חיים. (מקסימום 60 רמות)',
      base: 45e3, rate: 1.19, effect: { mult: 'power', per: 0.10 }, max: 60,
      readout: { key: 'hitPower', label: 'עוצמת מכה', kind: 'num' },
      unlock: { depth: 950 } },

    { id: 'offlineRig', name: 'משמרת לילה', icon: '🌙',
      desc: 'כל רמה מוסיפה 8% ליעילות הצבירה בזמן שאתה לא במשחק.',
      base: 25e3, rate: 1.30, effect: { add: 'offline', per: 0.08 }, max: 40,
      readout: { key: 'offline', label: 'יעילות לא־מקוונת', kind: 'pct' },
      unlock: { depth: 500 } },

    { id: 'compressor', name: 'מדחס עפרות', icon: '🗜',
      desc: 'כל רמה מוסיפה 12% לערך של כל עפרה גולמית שאתה מוכר.',
      base: 300e3, rate: 1.45, effect: { mult: 'orePrice', per: 0.12 }, max: 40,
      readout: { key: 'orePrice', label: 'ערך עפרה גולמית', kind: 'mult' },
      unlock: { depth: 1600 } },

    { id: 'resonance', name: 'תהודה גבישית', icon: '🔮',
      desc: 'כל רמה מוסיפה 15% לעוצמת הכרייה. יקרה, ומוגבלת ל‑60 רמות.',
      base: 5e6, rate: 1.26, effect: { mult: 'power', per: 0.15 }, max: 60,
      readout: { key: 'hitPower', label: 'עוצמת מכה', kind: 'num' },
      unlock: { depth: 2600 } }
  ];

  /* ---------------------------------------------------------------------- */
  /* One-shot purchases. These are the drip-feed: each removes a chore and
     changes how the game plays, which is what keeps the middle hours alive. */

  var UNLOCKS = [
    { id: 'forge', name: 'בניית הכבשן', icon: '🔥', cost: 750,
      desc: 'פותח את הכבשן — התכת עפרות למטילים ששווים פי כמה.',
      unlock: { resource: ['copperOre', 5] } },

    { id: 'market', name: 'דוכן בשוק', icon: '🏪', cost: 150,
      desc: 'פותח מכירה בכמויות ומחירי שוק שמשתנים לפי היצע.',
      unlock: { depth: 30 } },

    { id: 'crew', name: 'שכירת צוות', icon: '👥', cost: 25e3,
      desc: 'פותח שכירת כורים שאפשר להציב בכל שכבה שנפתחה — הם כורים גם כשאתה עסוק במקום אחר.',
      unlock: { depth: 500 } },

    { id: 'autoSmelt', name: 'מזין אוטומטי', icon: '🤖', cost: 120e3,
      desc: 'הכבשן ממשיך להתיך את המתכון הנבחר בלי שתלחץ.',
      unlock: { unlocked: 'forge', depth: 700 } },

    { id: 'autoSell', name: 'סוחר קבוע', icon: '📦', cost: 400e3,
      desc: 'פותח מכירה אוטומטית — סמן משאבים והם יימכרו ברגע שהם נכרים.',
      unlock: { depth: 950 } },

    { id: 'drill', name: 'מקדח קידוח', icon: '🛠', cost: 3e6,
      desc: 'מקדח שמתקדם בעומק ברקע, בנוסף לכרייה שלך.',
      unlock: { depth: 1600 } },

    { id: 'coalDepot', name: 'מחסן דלק', icon: '⛽', cost: 8e6,
      desc: 'קונה פחם אוטומטית בכסף כשהדלק אוזל. סוף לחזרות לשכבת הפחם.',
      unlock: { unlocked: 'forge', depth: 1600 } },

    { id: 'contracts', name: 'לשכת חוזים', icon: '📜', cost: 2e6,
      desc: 'פותח חוזי אספקה — יעדים קצרים עם תגמול שמן.',
      unlock: { depth: 1200 } },

    { id: 'magmaTap', name: 'ברז מגמה', icon: '🌋', cost: 5e9,
      desc: 'הכבשן שואב חום ישירות מהמגמה — צריכת הדלק יורדת ב‑80%.',
      unlock: { depth: 2600 } },

    { id: 'refinery', name: 'בית זיקוק', icon: '🏭', cost: 2e11,
      desc: 'כל התכה מייצרת פי 2 מטילים. הכבשן הופך למפעל.',
      unlock: { depth: 4000 } },

    { id: 'seismic', name: 'סורק סייסמי', icon: '📡', cost: 4e12,
      desc: 'מכפיל את הסיכוי לצמתים מיוחדים (עורק עשיר, גאודה, אוצר).',
      unlock: { depth: 6000 } }
  ];

  /* Extra forge slots: a separate ladder because each one is a big deal. */
  var FORGE_SLOTS = [0, 45e3, 900e3, 25e6, 1.2e9, 8e10, 5e12, 4e14];

  /* ---------------------------------------------------------------------- */
  /* Crew. Each hire is assigned to an unlocked stratum and mines it passively.
     Output is expressed as "rock-breaks per second" at that stratum, so crew
     income scales naturally with the stratum's loot table. */

  var CREW_TYPES = [
    { id: 'digger',   name: 'חופר',        icon: '🧑‍🌾', base: 25e3,  rate: 1.16, breaks: 0.25, powerShare: 0.06 },
    { id: 'miner',    name: 'כורה מנוסה',  icon: '👷', base: 900e3,  rate: 1.17, breaks: 1.1, powerShare: 0.18,
      unlock: { depth: 950 } },
    { id: 'blaster',  name: 'מפוצץ',       icon: '🧨', base: 60e6,   rate: 1.18, breaks: 6, powerShare: 0.5,
      unlock: { depth: 1600 } },
    { id: 'machine',  name: 'מכונת כרייה', icon: '🚜', base: 9e9,    rate: 1.19, breaks: 40, powerShare: 1.2,
      unlock: { depth: 2600 } },
    { id: 'golem',    name: 'גולם סלע',    icon: '🗿', base: 1.5e12, rate: 1.20, breaks: 280, powerShare: 3,
      unlock: { depth: 4000 } },
    { id: 'rift',     name: 'מחלץ בקע',    icon: '🌀', base: 4e14,   rate: 1.21, breaks: 2200, powerShare: 8,
      unlock: { depth: 6000 } }
  ];

  var upById = {}, unlById = {}, crewById = {};
  var i;
  for (i = 0; i < UPGRADES.length; i++) upById[UPGRADES[i].id] = UPGRADES[i];
  for (i = 0; i < UNLOCKS.length; i++) unlById[UNLOCKS[i].id] = UNLOCKS[i];
  for (i = 0; i < CREW_TYPES.length; i++) crewById[CREW_TYPES[i].id] = CREW_TYPES[i];

  G.UPGRADES = UPGRADES;
  G.UPGRADE_BY_ID = upById;
  G.UNLOCKS = UNLOCKS;
  G.UNLOCK_BY_ID = unlById;
  G.FORGE_SLOTS = FORGE_SLOTS;
  G.CREW_TYPES = CREW_TYPES;
  G.CREW_BY_ID = crewById;
})(typeof globalThis.MG !== 'undefined' ? globalThis.MG : (globalThis.MG = {}));
