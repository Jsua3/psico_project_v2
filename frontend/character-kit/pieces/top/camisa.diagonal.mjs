/**
 * Vistas diagonales (tres cuartos) de top:camisa.
 * Nacieron de un borrador (scripts/character-kit/borrador-diagonal.mjs) y se
 * corrigen a mano aquí: este archivo es la autoría.
 */
export const DIAGONAL = {
  'down-left': [
    {
      anchor: 'T', mode: 'cover', legend: {j: {mat: 'top'}, h: {mat: 'top', tone: 0}, J: {mat: 'top', tone: 3}}, at: [18, 22],
      grid: `
        hh..hh
      `,
    },
    {
      anchor: 'T', mode: 'paint', legend: {j: {mat: 'top'}, h: {mat: 'top', tone: 0}, J: {mat: 'top', tone: 3}}, at: [18, 23],
      grid: `
        hhJJhhh
        ..JJ...
        ...J...
        ...h...
        ...J...
        ...J...
        ...h...
        ...J...
        ...J...
        ...h...
        ...J...
        ...J...
        ...h...
        ...J...
        ...J...
      `,
    },
    {
      anchor: 'T', mode: 'cover', legend: {j: {mat: 'top'}, h: {mat: 'top', tone: 0}, J: {mat: 'top', tone: 3}}, at: [28, 22],
      grid: `
        hhh
      `,
    },
    {
      anchor: 'T', mode: 'paint', legend: {j: {mat: 'top'}, h: {mat: 'top', tone: 0}, J: {mat: 'top', tone: 3}}, at: [26, 23],
      grid: `
        .hJ
        J..
        ...
        ...
        ...
        ...
        ...
        J..
        J..
        h..
        .J.
        .J.
        .h.
        .J.
        .J.
      `,
    },
  ],
  'up-left': [
    {
      anchor: 'T', mode: 'cover', legend: {j: {mat: 'top'}, h: {mat: 'top', tone: 0}, J: {mat: 'top', tone: 3}}, at: [25, 22],
      grid: `
        hhhh
      `,
    },
    {
      anchor: 'T', mode: 'paint', legend: {j: {mat: 'top'}, h: {mat: 'top', tone: 0}, J: {mat: 'top', tone: 3}}, at: [24, 23],
      grid: `
        JJJJJJ
      `,
    },
    {
      anchor: 'T', mode: 'cover', legend: {j: {mat: 'top'}, h: {mat: 'top', tone: 0}, J: {mat: 'top', tone: 3}}, at: [17, 22],
      grid: `
        hhh
      `,
    },
  ],
};
