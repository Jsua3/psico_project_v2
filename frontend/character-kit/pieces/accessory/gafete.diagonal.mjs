/**
 * Vistas diagonales (tres cuartos) de accessory:gafete.
 * Nacieron de un borrador (scripts/character-kit/borrador-diagonal.mjs) y se
 * corrigen a mano aquí: este archivo es la autoría.
 */
export const DIAGONAL = {
  'down-left': [
    {
      anchor: 'T', mode: 'paint', legend: {c: {literal: 'gafeteCinta'}, w: {literal: 'gafete'}}, at: [19, 24],
      grid: `
        c..c
        c..c
        .cc.
        .cc.
        .ww.
        .ww.
      `,
    },
    {
      anchor: 'T', mode: 'paint', legend: {c: {literal: 'gafeteCinta'}, w: {literal: 'gafete'}}, at: [26, 24],
      grid: `
        .c
        c.
        c.
        c.
        w.
        w.
      `,
    },
  ],
  'up-left': [
    {
      anchor: 'T', mode: 'paint', legend: {c: {literal: 'gafeteCinta'}, w: {literal: 'gafete'}}, at: [25, 23],
      grid: `
        cccc
      `,
    },
  ],
};
