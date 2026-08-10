/* Repeatable gold upgrades, one-shot automation unlocks, and the hireable crew.

   Costs grow exponentially (rate per level), effects grow multiplicatively but
   more slowly — the standard incremental-game arrangement where each purchase
   is a smaller step than the last, so the player is always shopping for the
   best marginal buy rather than mashing one button.

   HOW TO READ THE NUMBERS

   An upgrade that multiplies income by (1+per) per level while each level costs
   `rate` times the last makes income grow as gold^E, where

       E = ln(1 + per) / ln(rate)

   E is the only number that matters for pacing. Add up E across every line that
   multiplies the same income and you get how fast wealth compounds: gold grows
   like t^(1/(1-E_total)), and at E_total >= 1 it reaches infinity in finite
   time. The three power upgrades used to sum to 1.41 on their own, which is why
   an hour-long run ended with more gold than there are atoms in anything.

   Each line below states its own E. tools/validate.js recomputes them from this
   file and fails the build if the totals drift back up. */
(function (G) {
  'use strict';

  /* effect kinds are read by systems/stats.js.

     `readout` names the derived stat this upgrade actually moves, so the shop
     row can show the live number ("3.4 → 3.6 swings per second") instead of
     only promising a percentage. `kind` picks the formatting:
       num  — a plain quantity        mult — an "x2.4" multiplier
       pct  — a percentage            (lower: true marks lower-is-better)      */
  var UPGRADES = [
    /* E = 0.110 (power) */
    { id: 'sharpness', name: 'חידוד המכוש', icon: '⛏',
      desc: 'כל רמה מוסיפה 6% לעוצמת הכרייה. (מקסימום 150 רמות)',
      base: 25, rate: 1.70, effect: { mult: 'power', per: 0.06 }, max: 150,
      readout: { key: 'hitPower', label: 'עוצמת מכה', kind: 'num' } },

    /* E = 0.081 (speed). Small steps on purpose — swing speed is the stat the
       player watches most, so it climbs in percents, not leaps. The cost rate
       is set to hold the same exponent as the old 4%-a-level version, so this
       is a change of texture, not of pacing. */
    { id: 'swiftness', name: 'זריזות ידיים', icon: '💨',
      desc: 'כל רמה מוסיפה 1% למהירות ההנפה. (מקסימום 400 רמות)',
      base: 90, rate: 1.13, effect: { mult: 'speed', per: 0.01 }, max: 400,
      readout: { key: 'swingRate', label: 'הנפות בשנייה', kind: 'num' } },

    /* E = 0.081 (yield) */
    { id: 'yield', name: 'עגלה גדולה יותר', icon: '🛒',
      desc: 'כל רמה מוסיפה 4% לכמות המשאבים מכל שבירה. (מקסימום 100 רמות)',
      base: 300, rate: 1.62, effect: { mult: 'yield', per: 0.04 }, max: 100,
      readout: { key: 'yieldPerBreak', label: 'משאבים לכל שבירה', kind: 'num' } },

    { id: 'excavation', name: 'טכניקת חפירה', icon: '📐',
      desc: 'כל רמה מוסיפה 0.08 מ׳ להתקדמות בעומק לכל שבירה.',
      base: 500, rate: 1.16, effect: { add: 'depthFlat', per: 0.08 }, max: 50,
      readout: { key: 'depthPerBreak', label: 'מטרים לכל שבירה', kind: 'num' } },

    { id: 'fortune', name: 'עין המחפש', icon: '🔍',
      desc: 'כל רמה מוסיפה 1.2% לסיכוי למצוא משאב נדיר משכבה עמוקה יותר (מקסימום 60%).',
      base: 190, rate: 1.22, effect: { add: 'luck', per: 0.012 }, max: 35,
      readout: { key: 'luck', label: 'סיכוי לממצא נדיר', kind: 'pct' },
      unlock: { depth: 200 } },

    { id: 'critChance', name: 'מכת עורק', icon: '⚡',
      desc: 'כל רמה מוסיפה 0.8% לסיכוי למכה קריטית שמנפצת סלע מיידית.',
      base: 300, rate: 1.24, effect: { add: 'crit', per: 0.008 }, max: 55,
      readout: { key: 'crit', label: 'סיכוי קריטי', kind: 'pct' },
      unlock: { depth: 350 } },

    /* Additive, so its E is effectively zero — it grows like log(gold). */
    { id: 'critPower', name: 'עוצמת ניפוץ', icon: '💥',
      desc: 'כל רמה מוסיפה 12% לנזק הקריטי ולשלל שהוא מפיל.',
      base: 500, rate: 1.28, effect: { add: 'critMult', per: 0.12 }, max: 50,
      readout: { key: 'critMult', label: 'מכפיל שלל קריטי', kind: 'mult' },
      unlock: { upgrade: ['critChance', 5] } },

    /* E = 0.078 (price) */
    { id: 'haggling', name: 'כושר מיקוח', icon: '💰',
      desc: 'כל רמה מוסיפה 4% למחירי המכירה בשוק. (מקסימום 100 רמות)',
      base: 1800, rate: 1.65, effect: { mult: 'price', per: 0.04 }, max: 100,
      readout: { key: 'price', label: 'מחיר מכירה', kind: 'mult' } },

    /* E = 0.076 (forge) */
    { id: 'bellows', name: 'מפוח הכבשן', icon: '🔥',
      desc: 'כל רמה מוסיפה 5% למהירות ההיתוך. (מקסימום 60 רמות)',
      base: 470, rate: 1.90, effect: { mult: 'forge', per: 0.05 }, max: 60,
      readout: { key: 'forge', label: 'מהירות היתוך', kind: 'mult' },
      unlock: { unlocked: 'forge' } },

    { id: 'insulation', name: 'בידוד הכבשן', icon: '🧱',
      desc: 'כל רמה מפחיתה 4% מצריכת הדלק (מצטבר כפלית).',
      base: 780, rate: 1.23, effect: { decay: 'fuel', per: 0.04 }, max: 60,
      readout: { key: 'fuel', label: 'צריכת דלק', kind: 'mult', lower: true },
      unlock: { unlocked: 'forge' } },

    /* E = 0.058 (crew) */
    { id: 'crewTraining', name: 'אימון הצוות', icon: '👷',
      desc: 'כל רמה מוסיפה 4% לתפוקת כל אנשי הצוות. (מקסימום 40 רמות)',
      base: 840, rate: 1.95, effect: { mult: 'crew', per: 0.04 }, max: 40,
      readout: { key: 'crew', label: 'תפוקת צוות', kind: 'mult' },
      unlock: { unlocked: 'crew' } },

    /* E = 0.079 (power) */
    { id: 'lanterns', name: 'פנסי מכרה', icon: '🏮',
      desc: 'כל רמה מוסיפה 5% לעוצמת הכרייה. אור זה חיים. (מקסימום 60 רמות)',
      base: 1400, rate: 1.85, effect: { mult: 'power', per: 0.05 }, max: 60,
      readout: { key: 'hitPower', label: 'עוצמת מכה', kind: 'num' },
      unlock: { depth: 950 } },

    { id: 'offlineRig', name: 'משמרת לילה', icon: '🌙',
      desc: 'כל רמה מוסיפה 8% ליעילות הצבירה בזמן שאתה לא במשחק.',
      base: 1750, rate: 1.30, effect: { add: 'offline', per: 0.08 }, max: 40,
      readout: { key: 'offline', label: 'יעילות לא־מקוונת', kind: 'pct' },
      unlock: { depth: 500 } },

    /* E = 0.076 (orePrice — raw ore only, so it does not stack with the forge) */
    { id: 'compressor', name: 'מדחס עפרות', icon: '🗜',
      desc: 'כל רמה מוסיפה 8% לערך של כל עפרה גולמית שאתה מוכר. (מקסימום 40 רמות)',
      base: 4200, rate: 2.75, effect: { mult: 'orePrice', per: 0.08 }, max: 40,
      readout: { key: 'orePrice', label: 'ערך עפרה גולמית', kind: 'mult' },
      unlock: { depth: 1600 } },

    /* E = 0.113 (power) — the steepest line in the game, and the most expensive. */
    { id: 'resonance', name: 'תהודה גבישית', icon: '🔮',
      desc: 'כל רמה מוסיפה 9% לעוצמת הכרייה. יקרה, ומוגבלת ל‑60 רמות.',
      base: 31e3, rate: 2.15, effect: { mult: 'power', per: 0.09 }, max: 60,
      readout: { key: 'hitPower', label: 'עוצמת מכה', kind: 'num' },
      unlock: { depth: 2600 } }
  ];

  /* ---------------------------------------------------------------------- */
  /* One-shot purchases. These are the drip-feed: each removes a chore and
     changes how the game plays, which is what keeps the middle hours alive. */

  var UNLOCKS = [
    { id: 'forge', name: 'בניית הכבשן', icon: '🔥', cost: 150,
      desc: 'פותח את הכבשן — התכת עפרות למטילים ששווים פי כמה.',
      unlock: { resource: ['copperOre', 5] } },

    { id: 'market', name: 'דוכן בשוק', icon: '🏪', cost: 120,
      desc: 'פותח מכירה בכמויות ומחירי שוק שמשתנים לפי היצע.',
      unlock: { depth: 30 } },

    { id: 'crew', name: 'שכירת צוות', icon: '👥', cost: 1800,
      desc: 'פותח שכירת כורים שאפשר להציב בכל שכבה שנפתחה — הם כורים גם כשאתה עסוק במקום אחר.',
      unlock: { depth: 500 } },

    { id: 'autoSmelt', name: 'מזין אוטומטי', icon: '🤖', cost: 8500,
      desc: 'הכבשן ממשיך להתיך את המתכון הנבחר בלי שתלחץ.',
      unlock: { unlocked: 'forge', depth: 700 } },

    { id: 'autoSell', name: 'סוחר קבוע', icon: '📦', cost: 12e3,
      desc: 'פותח מכירה אוטומטית — סמן משאבים והם יימכרו ברגע שהם נכרים.',
      unlock: { depth: 950 } },

    { id: 'drill', name: 'מקדח קידוח', icon: '🛠', cost: 42e3,
      desc: 'מקדח שמתקדם בעומק ברקע, בנוסף לכרייה שלך.',
      unlock: { depth: 1600 } },

    { id: 'coalDepot', name: 'מחסן דלק', icon: '⛽', cost: 112e3,
      desc: 'קונה פחם אוטומטית בכסף כשהדלק אוזל. סוף לחזרות לשכבת הפחם.',
      unlock: { unlocked: 'forge', depth: 1600 } },

    { id: 'contracts', name: 'לשכת חוזים', icon: '📜', cost: 40e3,
      desc: 'פותח חוזי אספקה — יעדים קצרים עם תגמול שמן.',
      unlock: { depth: 1200 } },

    { id: 'magmaTap', name: 'ברז מגמה', icon: '🌋', cost: 32e6,
      desc: 'הכבשן שואב חום ישירות מהמגמה — צריכת הדלק יורדת ב‑80%.',
      unlock: { depth: 2600 } },

    { id: 'refinery', name: 'בית זיקוק', icon: '🏭', cost: 560e6,
      desc: 'כל התכה מייצרת פי 2 מטילים. הכבשן הופך למפעל.',
      unlock: { depth: 4000 } },

    { id: 'seismic', name: 'סורק סייסמי', icon: '📡', cost: 5.2e9,
      desc: 'מכפיל את הסיכוי לצמתים מיוחדים (עורק עשיר, גאודה, אוצר).',
      unlock: { depth: 6000 } }
  ];

  /* Extra forge slots: a separate ladder because each one is a big deal. */
  var FORGE_SLOTS = [0, 3200, 28e3, 350e3, 7.5e6, 2.2e8, 6.5e9, 2.3e11];

  /* ---------------------------------------------------------------------- */
  /* Crew. Each hire is assigned to an unlocked stratum and mines it passively.
     `share` is the fraction of the player's own break rate at that stratum, so
     crew inherit every brake the player has: rock HP, the chain cap, swing speed.

     `max` is not decoration. Hire cost grows at `rate` per hire, which sounds
     self-limiting, but at late-game wealth a 1.21x step buys another hundred
     workers — and each one is a flat multiple of the player's rate. Measured
     mid-run, crew were producing twelve thousand times the player's own capped
     break rate, which is where the runaway economy actually came from. A hard
     roster cap makes the passive line a bounded multiple of the active one:
     20 of each type at these shares is 11.5x the player, times the training
     multiplier's own ceiling of 4.8x — about 55x, and never more. */

  var CREW_TYPES = [
    { id: 'digger',   name: 'חופר',        icon: '🧑‍🌾', base: 1800,  rate: 1.20, share: 0.015, max: 20 },
    { id: 'miner',    name: 'כורה מנוסה',  icon: '👷', base: 28e3,  rate: 1.21, share: 0.03, max: 20,
      unlock: { depth: 950 } },
    { id: 'blaster',  name: 'מפוצץ',       icon: '🧨', base: 840e3,   rate: 1.22, share: 0.05, max: 20,
      unlock: { depth: 1600 } },
    { id: 'machine',  name: 'מכונת כרייה', icon: '🚜', base: 57e6,    rate: 1.23, share: 0.09, max: 20,
      unlock: { depth: 2600 } },
    { id: 'golem',    name: 'גולם סלע',    icon: '🗿', base: 4.2e9, rate: 1.24, share: 0.14, max: 20,
      unlock: { depth: 4000 } },
    { id: 'rift',     name: 'מחלץ בקע',    icon: '🌀', base: 5.2e11,   rate: 1.25, share: 0.25, max: 20,
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
