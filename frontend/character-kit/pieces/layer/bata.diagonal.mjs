/**
 * Vistas diagonales (tres cuartos) de layer:bata.
 * Nacieron de un borrador (scripts/character-kit/borrador-diagonal.mjs) y se
 * corrigen a mano aquí: este archivo es la autoría.
 */
export const DIAGONAL = {
  'down-left': [
    {
      anchor: 'T', mode: 'repaint', legend: {L: {mat: 'layer'}, X: {mat: 'layer', tone: 3}, K: {mat: 'layer', tone: 2}, t: {mat: 'top'}}, at: [16, 23],
      grid: `
        LLL....LLL.....L
        LLLX..XLLL.....L
        LLLLXXLLLL.....L
        LLLLLXLLLL.....L
        LLLLLXLLLL.....L
        LLLLLXLLLL.....L
        LLLLLXLLLL.....L
        LLLLLXLLLL.....L
        LLLLLXLLLL.....L
        LLLLLXLLLL.....L
        LLLLLXLLLL.....L
        LLLLLXLLLL.....L
        LLLLLXLLLL.....L
        LLLLLXLLLL.....L
        LLLLLXLLLL.....L
      `,
    },
    {
      anchor: 'T', mode: 'paint', legend: {L: {mat: 'layer'}, X: {mat: 'layer', tone: 3}, K: {mat: 'layer', tone: 2}, t: {mat: 'top'}}, at: [19, 23],
      grid: `
        tttt
        .tt.
        ..t.
      `,
    },
    {
      anchor: 'P', mode: 'cover', legend: {L: {mat: 'layer'}, X: {mat: 'layer', tone: 3}, K: {mat: 'layer', tone: 2}, t: {mat: 'top'}}, at: [16, 38],
      grid: `
        LLLLLXLLLL.....L
        LLLLLXLLLL.....L
        LKLLLXLLLK.....L
        LLLLLXLLLL.....L
        LLLLLXLLLL.....L
        LLLLLXLLLL.....L
        LLLLXXLLLL.....L
        LLLLXXLLLL.....L
        LLLLXXLLLL.....L
        .LLLXXLLLL......
      `,
    },
    {
      anchor: 'T', mode: 'repaint', legend: {L: {mat: 'layer'}, X: {mat: 'layer', tone: 3}, K: {mat: 'layer', tone: 2}, t: {mat: 'top'}}, at: [26, 23],
      grid: `
        ..LLL
        .XLLL
        XLLLL
        LLLLL
        LLLLL
        LLLLL
        LLLLL
        LLLLL
        LLLLL
        LLLLL
        LLLLL
        LLLLL
        LLLLL
        LLLLL
        LLLLL
      `,
    },
    {
      anchor: 'T', mode: 'paint', legend: {L: {mat: 'layer'}, X: {mat: 'layer', tone: 3}, K: {mat: 'layer', tone: 2}, t: {mat: 'top'}}, at: [26, 23],
      grid: `
        tt
        t.
      `,
    },
    {
      anchor: 'P', mode: 'cover', legend: {L: {mat: 'layer'}, X: {mat: 'layer', tone: 3}, K: {mat: 'layer', tone: 2}, t: {mat: 'top'}}, at: [26, 38],
      grid: `
        XLLLL
        XLLLL
        XLKKL
        XLLLL
        XLLLL
        XLLLL
        XLLLL
        XLLLL
        XLLLL
        .XLLL
      `,
    },
  ],
  'up-left': [
    {
      anchor: 'T', mode: 'repaint', legend: {L: {mat: 'layer'}, X: {mat: 'layer', tone: 3}, K: {mat: 'layer', tone: 2}, t: {mat: 'top'}}, at: [16, 23],
      grid: `
        L.....LLLLLLLLLL
        L.....LLLLLLLLLL
        L.....LLLLLLLLLL
        L.....LLLLLLLLLL
        L.....LLLLLLLLLL
        L.....LLLLLLLLLL
        L.....LLLLLLLLLL
        L.....LLLLLLLLLL
        L.....LLLLLLLLLL
        L.....LLLLLLLLLL
        L.....LLLLLLLLLL
        L.....LLLLLLLLLL
        L.....LLLLLLLLLL
        L.....LLLLLLLLLL
        L.....LLLLLLLLLL
      `,
    },
    {
      anchor: 'P', mode: 'cover', legend: {L: {mat: 'layer'}, X: {mat: 'layer', tone: 3}, K: {mat: 'layer', tone: 2}, t: {mat: 'top'}}, at: [16, 38],
      grid: `
        L.....LLLLLLLLLL
        L.....LLLLLLLLLL
        L.....LLLLLLLLLL
        L.....LLLLLLLLLL
        L.....LLLLLLLLLL
        L.....LLLLLLLLLL
        L.....LLLLXLLLLL
        L.....LLLLXLLLLL
        L.....LLLLXLLLLL
        ......LLLLXLLLL.
      `,
    },
    {
      anchor: 'T', mode: 'repaint', legend: {L: {mat: 'layer'}, X: {mat: 'layer', tone: 3}, K: {mat: 'layer', tone: 2}, t: {mat: 'top'}}, at: [17, 23],
      grid: `
        LLLLL
        LLLLL
        LLLLL
        LLLLL
        LLLLL
        LLLLL
        LLLLL
        LLLLL
        LLLLL
        LLLLL
        LLLLL
        LLLLL
        LLLLL
        LLLLL
        LLLLL
      `,
    },
    {
      anchor: 'P', mode: 'cover', legend: {L: {mat: 'layer'}, X: {mat: 'layer', tone: 3}, K: {mat: 'layer', tone: 2}, t: {mat: 'top'}}, at: [17, 38],
      grid: `
        LLLLL
        LLLLL
        KLLLL
        LLLLL
        LLLLL
        LLLLL
        LLLLL
        LLLLL
        LLLLL
        LLLLL
      `,
    },
  ],
};
