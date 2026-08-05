/* Supply contracts: short, concrete goals with a fat payout.

   Idle games live or die on having something to want in the next ten minutes,
   not just the next ten hours. Contracts are generated from whatever the
   player can currently reach, so they always ask for something plausible. */
(function (G) {
  'use strict';

  var CONTRACT_FLAVOR = [
    'גילדת הנפחים', 'איגוד הבנאים', 'הצי המלכותי', 'מעבדת האלכימאים',
    'שיירת הסוחרים', 'מסדר החופרים', 'בית היוצר', 'ועד הכורים',
    'הארכיטקט העיוור', 'סוחר נודד', 'המצודה התחתית', 'קרן המחקר הגאולוגי'
  ];

  /* Payout is a multiple of raw market value; harder asks pay a bigger multiple
     so contracts stay relevant as the player's income scales. */
  var TIERS = [
    { id: 'small',  label: 'קטן',  qtyMult: 12,  payMult: 2.2,  cores: 0, timeLimit: 0 },
    { id: 'medium', label: 'בינוני', qtyMult: 45, payMult: 3.0, cores: 0, timeLimit: 0 },
    { id: 'large',  label: 'גדול', qtyMult: 160, payMult: 4.2,  cores: 1, timeLimit: 0 },
    { id: 'epic',   label: 'ענק',  qtyMult: 600, payMult: 6.0,  cores: 3, timeLimit: 0 }
  ];

  G.CONTRACT_FLAVOR = CONTRACT_FLAVOR;
  G.CONTRACT_TIERS = TIERS;
  G.CONTRACT_SLOTS = 3;
})(typeof globalThis.MG !== 'undefined' ? globalThis.MG : (globalThis.MG = {}));
