/**
 * Vistas diagonales (tres cuartos) de top:camisa-seguridad.
 * Nacieron de un borrador (scripts/character-kit/borrador-diagonal.mjs) y se
 * corrigen a mano aquí: este archivo es la autoría.
 */
export const DIAGONAL = {
  'down-left': [
    {
      anchor: 'T', mode: 'cover', legend: {j: {mat: 'top'}, h: {mat: 'top', tone: 0}, J: {mat: 'top', tone: 3}, f: {mat: 'accent'}}, at: [18, 22],
      grid: `
        hh..hh
      `,
    },
    {
      anchor: 'T', mode: 'paint', legend: {j: {mat: 'top'}, h: {mat: 'top', tone: 0}, J: {mat: 'top', tone: 3}, f: {mat: 'accent'}}, at: [17, 23],
      grid: `
        ffhhJhfff
        ....J....
        JJ....JJJ
        JJ..h.J.J
        JJ....JJJ
        ....J....
        ....h....
        ....J....
        ....J....
        ....h....
        ....J....
        ....J....
        ....h....
        ....J....
        ....J....
      `,
    },
    {
      anchor: 'T', mode: 'cover', legend: {j: {mat: 'top'}, h: {mat: 'top', tone: 0}, J: {mat: 'top', tone: 3}, f: {mat: 'accent'}}, at: [28, 22],
      grid: `
        hhh
      `,
    },
    {
      anchor: 'T', mode: 'paint', legend: {j: {mat: 'top'}, h: {mat: 'top', tone: 0}, J: {mat: 'top', tone: 3}, f: {mat: 'accent'}}, parts: ['T', 'a'], at: [26, 23],
      grid: `
        .hJ.f
        J....
        J....
        J....
        .....
        .....
        .....
        J....
        h....
        .J...
        .J...
        .h...
        .J...
        .J...
        .J...
      `,
    },
  ],
  'up-left': [
    {
      anchor: 'T', mode: 'cover', legend: {j: {mat: 'top'}, h: {mat: 'top', tone: 0}, J: {mat: 'top', tone: 3}, f: {mat: 'accent'}}, at: [25, 22],
      grid: `
        hhhh
      `,
    },
    {
      anchor: 'T', mode: 'paint', legend: {j: {mat: 'top'}, h: {mat: 'top', tone: 0}, J: {mat: 'top', tone: 3}, f: {mat: 'accent'}}, at: [22, 23],
      grid: `
        fffJJJJff
      `,
    },
    {
      anchor: 'T', mode: 'cover', legend: {j: {mat: 'top'}, h: {mat: 'top', tone: 0}, J: {mat: 'top', tone: 3}, f: {mat: 'accent'}}, at: [17, 22],
      grid: `
        hhh
      `,
    },
    {
      anchor: 'T', mode: 'paint', legend: {j: {mat: 'top'}, h: {mat: 'top', tone: 0}, J: {mat: 'top', tone: 3}, f: {mat: 'accent'}}, parts: ['T', 'a'], at: [17, 23],
      grid: `
        fff
      `,
    },
  ],
};
