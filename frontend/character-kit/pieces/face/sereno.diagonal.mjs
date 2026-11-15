/**
 * Vistas diagonales (tres cuartos) de face:sereno.
 * Nacieron de un borrador (scripts/character-kit/borrador-diagonal.mjs) y se
 * corrigen a mano aquí: este archivo es la autoría.
 */
export const DIAGONAL = {
  'down-left': [
    {
      anchor: 'H', mode: 'paint', legend: {b: {mat: 'hair', tone: 3}, k: {literal: 'eye'}, n: {mat: 'skin', tone: 2}, m: {mat: 'skin', tone: 3}, q: {literal: 'blush'}}, at: [18, 11],
      grid: `
        bb..bbb
        .......
        k....k.
        k....k.
        .......
        q..n..q
        .......
        ..mm...
      `,
    },
    {
      anchor: 'H', mode: 'paint', legend: {b: {mat: 'hair', tone: 3}, k: {literal: 'eye'}, n: {mat: 'skin', tone: 2}, m: {mat: 'skin', tone: 3}, q: {literal: 'blush'}}, at: [27, 11],
      grid: `
        bb
        ..
        .k
        .k
        ..
        n.
      `,
    },
  ],
  'up-left': [

  ],
};
