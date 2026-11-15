/**
 * Vistas diagonales (tres cuartos) de top:sudadera.
 * Nacieron de un borrador (scripts/character-kit/borrador-diagonal.mjs) y se
 * corrigen a mano aquí: este archivo es la autoría.
 */
export const DIAGONAL = {
  'down-left': [
    {
      anchor: 'T', mode: 'cover', legend: {j: {mat: 'top'}, J: {mat: 'top', tone: 3}, K: {mat: 'top', tone: 2}, f: {mat: 'accent'}, F: {mat: 'accent', tone: 2}}, at: [18, 22],
      grid: `
        ffffff
      `,
    },
    {
      anchor: 'T', mode: 'paint', legend: {j: {mat: 'top'}, J: {mat: 'top', tone: 3}, K: {mat: 'top', tone: 2}, f: {mat: 'accent'}, F: {mat: 'accent', tone: 2}}, at: [17, 23],
      grid: `
        fFFFFFFff
        .F....FF.
        ..f..f...
        ..f..f...
        .........
        .........
        .........
        .JJJJJJJ.
        .J.....J.
        .J.....J.
        .J....JJ.
      `,
    },
    {
      anchor: 'P', mode: 'paint', legend: {j: {mat: 'top'}, J: {mat: 'top', tone: 3}, K: {mat: 'top', tone: 2}, f: {mat: 'accent'}, F: {mat: 'accent', tone: 2}}, at: [17, 38],
      grid: `
        KKKKKKKKK
      `,
    },
    {
      anchor: 'T', mode: 'paint', legend: {j: {mat: 'top'}, J: {mat: 'top', tone: 3}, K: {mat: 'top', tone: 2}, f: {mat: 'accent'}, F: {mat: 'accent', tone: 2}}, at: [27, 23],
      grid: `
        fFF
        f..
        f..
      `,
    },
    {
      anchor: 'P', mode: 'paint', legend: {j: {mat: 'top'}, J: {mat: 'top', tone: 3}, K: {mat: 'top', tone: 2}, f: {mat: 'accent'}, F: {mat: 'accent', tone: 2}}, at: [26, 38],
      grid: `
        KKKKK
      `,
    },
  ],
  'up-left': [
    {
      anchor: 'T', mode: 'paint', legend: {j: {mat: 'top'}, J: {mat: 'top', tone: 3}, K: {mat: 'top', tone: 2}, f: {mat: 'accent'}, F: {mat: 'accent', tone: 2}}, at: [22, 23],
      grid: `
        .FFFFFFF.
        J.......J
        J.......J
        .J.....J.
        ..JJJJJJ.
      `,
    },
    {
      anchor: 'P', mode: 'paint', legend: {j: {mat: 'top'}, J: {mat: 'top', tone: 3}, K: {mat: 'top', tone: 2}, f: {mat: 'accent'}, F: {mat: 'accent', tone: 2}}, at: [22, 38],
      grid: `
        KKKKKKKKK
      `,
    },
    {
      anchor: 'T', mode: 'cover', legend: {j: {mat: 'top'}, J: {mat: 'top', tone: 3}, K: {mat: 'top', tone: 2}, f: {mat: 'accent'}, F: {mat: 'accent', tone: 2}}, at: [20, 20],
      grid: `
        .j
        jj
        jj
      `,
    },
    {
      anchor: 'T', mode: 'paint', legend: {j: {mat: 'top'}, J: {mat: 'top', tone: 3}, K: {mat: 'top', tone: 2}, f: {mat: 'accent'}, F: {mat: 'accent', tone: 2}}, at: [17, 23],
      grid: `
        F....
        ....J
      `,
    },
    {
      anchor: 'P', mode: 'paint', legend: {j: {mat: 'top'}, J: {mat: 'top', tone: 3}, K: {mat: 'top', tone: 2}, f: {mat: 'accent'}, F: {mat: 'accent', tone: 2}}, at: [17, 38],
      grid: `
        KKKKK
      `,
    },
  ],
};
