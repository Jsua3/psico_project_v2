/**
 * Vistas diagonales (tres cuartos) de top:sueter.
 * Nacieron de un borrador (scripts/character-kit/borrador-diagonal.mjs) y se
 * corrigen a mano aquí: este archivo es la autoría.
 */
export const DIAGONAL = {
  'down-left': [
    {
      anchor: 'T', mode: 'cover', legend: {j: {mat: 'top'}, J: {mat: 'top', tone: 3}, K: {mat: 'top', tone: 2}, i: {mat: 'inner'}}, at: [18, 22],
      grid: `
        ii..ii
      `,
    },
    {
      anchor: 'T', mode: 'paint', legend: {j: {mat: 'top'}, J: {mat: 'top', tone: 3}, K: {mat: 'top', tone: 2}, i: {mat: 'inner'}}, at: [18, 23],
      grid: `
        iiKKiiK
        .KKKK..
      `,
    },
    {
      anchor: 'P', mode: 'paint', legend: {j: {mat: 'top'}, J: {mat: 'top', tone: 3}, K: {mat: 'top', tone: 2}, i: {mat: 'inner'}}, at: [17, 38],
      grid: `
        KKKKKKKKK
      `,
    },
    {
      anchor: 'T', mode: 'cover', legend: {j: {mat: 'top'}, J: {mat: 'top', tone: 3}, K: {mat: 'top', tone: 2}, i: {mat: 'inner'}}, at: [28, 22],
      grid: `
        iii
      `,
    },
    {
      anchor: 'T', mode: 'paint', legend: {j: {mat: 'top'}, J: {mat: 'top', tone: 3}, K: {mat: 'top', tone: 2}, i: {mat: 'inner'}}, at: [27, 23],
      grid: `
        iKK
        K..
      `,
    },
    {
      anchor: 'P', mode: 'paint', legend: {j: {mat: 'top'}, J: {mat: 'top', tone: 3}, K: {mat: 'top', tone: 2}, i: {mat: 'inner'}}, at: [26, 38],
      grid: `
        KKKKK
      `,
    },
  ],
  'up-left': [
    {
      anchor: 'T', mode: 'cover', legend: {j: {mat: 'top'}, J: {mat: 'top', tone: 3}, K: {mat: 'top', tone: 2}, i: {mat: 'inner'}}, at: [25, 22],
      grid: `
        iiii
      `,
    },
    {
      anchor: 'T', mode: 'paint', legend: {j: {mat: 'top'}, J: {mat: 'top', tone: 3}, K: {mat: 'top', tone: 2}, i: {mat: 'inner'}}, at: [24, 23],
      grid: `
        KKKKKK
      `,
    },
    {
      anchor: 'P', mode: 'paint', legend: {j: {mat: 'top'}, J: {mat: 'top', tone: 3}, K: {mat: 'top', tone: 2}, i: {mat: 'inner'}}, at: [22, 38],
      grid: `
        KKKKKKKKK
      `,
    },
    {
      anchor: 'T', mode: 'cover', legend: {j: {mat: 'top'}, J: {mat: 'top', tone: 3}, K: {mat: 'top', tone: 2}, i: {mat: 'inner'}}, at: [17, 22],
      grid: `
        iii
      `,
    },
    {
      anchor: 'P', mode: 'paint', legend: {j: {mat: 'top'}, J: {mat: 'top', tone: 3}, K: {mat: 'top', tone: 2}, i: {mat: 'inner'}}, at: [17, 38],
      grid: `
        KKKKK
      `,
    },
  ],
};
