/**
 * Vistas diagonales (tres cuartos) de accessory:gafas.
 * Nacieron de un borrador (scripts/character-kit/borrador-diagonal.mjs) y se
 * corrigen a mano aquí: este archivo es la autoría.
 */
export const DIAGONAL = {
  'down-left': [
    {
      anchor: 'H', mode: 'paint', legend: {g: {literal: 'gafas'}}, at: [17, 12],
      grid: `
        .gg..ggg.
        g..gg...g
        g..gg...g
        .gg..ggg.
      `,
    },
    {
      anchor: 'H', mode: 'paint', legend: {g: {literal: 'gafas'}}, at: [27, 12],
      grid: `
        gg....
        g.gggg
        g.....
        gg....
      `,
    },
  ],
  'up-left': [
    {
      anchor: 'H', mode: 'paint', legend: {g: {literal: 'gafas'}}, at: [17, 13],
      grid: `
        gg
      `,
    },
  ],
};
