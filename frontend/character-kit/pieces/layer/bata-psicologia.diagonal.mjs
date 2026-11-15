/**
 * Vistas diagonales (tres cuartos) de layer:bata-psicologia.
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
      anchor: 'T', parts: ['a', 'A'], mode: 'repaint', legend: {L: {mat: 'layer'}, f: {literal: 'bordado'}}, at: [6, 20],
      grid: `
        LLLLLLLLLLLLLLLLLLLL.....LLLLLLLLLL
        LLLLLLLLLLLLLLLLLLLL.....LLLLLLLLLL
        LLLLLLLLLLLLLLLLLLLL.....LLLLLLLLLL
        LLLLLLLLLLLLLLLLLLLL.....LLLLLLLLLL
        LLLLLLLLLLLLLLLLLLLL.....LLLLLLLLLL
        LLLLLLLLLLLLLLLLLLLL.....LLLLLLLLLL
        LLLLLLLLLLLLLLLLLLLL.....LLLLLLLLLL
        LLLLLLLLLLLLLLLLLLLL.....LLLLLLLLLL
        LLLLLLLLLLLLLLLLLLLL.....LLLLLLLLLL
        LLLLLLLLLLLLLLLLLLLL.....LLLLLLLLLL
        LLLLLLLLLLLLLLLLLLLL.....LLLLLLLLLL
        LLLLLLLLLLLLLLLLLLLL.....LLLLLLLLLL
        LLLLLLLLLLLLLLLLLLLL.....LLLLLLLLLL
        LLLLLLLLLLLLLLLLLLLL.....LLLLLLLLLL
        LLLLLLLLLLLLLLLLLLLL.....LLLLLLLLLL
        LLLLLLLLLLLLLLLLLLLL.....LLLLLLLLLL
        LLLLLLLLLLLLLLLLLLLL.....LLLLLLLLLL
        LLLLLLLLLLLLLLLLLLLL.....LLLLLLLLLL
        LLLLLLLLLLLLLLLLLLLL.....LLLLLLLLLL
        LLLLLLLLLLLLLLLLLLLL.....LLLLLLLLLL
        LLLLLLLLLLLLLLLLLLLL.....LLLLLLLLLL
        LLLLLLLLLLLLLLLLLLLL.....LLLLLLLLLL
        LLLLLLLLLLLLLLLLLLLL.....LLLLLLLLLL
        LLLLLLLLLLLLLLLLLLLL.....LLLLLLLLLL
      `,
    },
    {
      anchor: 'T', mode: 'paint', legend: {L: {mat: 'layer'}, f: {literal: 'bordado'}}, at: [23, 26],
      grid: `
        ff
        ff
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
    {
      anchor: 'T', parts: ['a', 'A'], mode: 'repaint', legend: {L: {mat: 'layer'}, f: {literal: 'bordado'}}, at: [26, 20],
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
      anchor: 'T', mode: 'paint', legend: {L: {mat: 'layer'}, f: {literal: 'bordado'}}, at: [27, 26],
      grid: `
        ff
        ff
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
      anchor: 'T', parts: ['a', 'A'], mode: 'repaint', legend: {L: {mat: 'layer'}, f: {literal: 'bordado'}}, at: [6, 20],
      grid: `
        LLLLLLLLLLL.....LLLLLLLLLLLLLLLLLLL
        LLLLLLLLLLL.....LLLLLLLLLLLLLLLLLLL
        LLLLLLLLLLL.....LLLLLLLLLLLLLLLLLLL
        LLLLLLLLLLL.....LLLLLLLLLLLLLLLLLLL
        LLLLLLLLLLL.....LLLLLLLLLLLLLLLLLLL
        LLLLLLLLLLL.....LLLLLLLLLLLLLLLLLLL
        LLLLLLLLLLL.....LLLLLLLLLLLLLLLLLLL
        LLLLLLLLLLL.....LLLLLLLLLLLLLLLLLLL
        LLLLLLLLLLL.....LLLLLLLLLLLLLLLLLLL
        LLLLLLLLLLL.....LLLLLLLLLLLLLLLLLLL
        LLLLLLLLLLL.....LLLLLLLLLLLLLLLLLLL
        LLLLLLLLLLL.....LLLLLLLLLLLLLLLLLLL
        LLLLLLLLLLL.....LLLLLLLLLLLLLLLLLLL
        LLLLLLLLLLL.....LLLLLLLLLLLLLLLLLLL
        LLLLLLLLLLL.....LLLLLLLLLLLLLLLLLLL
        LLLLLLLLLLL.....LLLLLLLLLLLLLLLLLLL
        LLLLLLLLLLL.....LLLLLLLLLLLLLLLLLLL
        LLLLLLLLLLL.....LLLLLLLLLLLLLLLLLLL
        LLLLLLLLLLL.....LLLLLLLLLLLLLLLLLLL
        LLLLLLLLLLL.....LLLLLLLLLLLLLLLLLLL
        LLLLLLLLLLL.....LLLLLLLLLLLLLLLLLLL
        LLLLLLLLLLL.....LLLLLLLLLLLLLLLLLLL
        LLLLLLLLLLL.....LLLLLLLLLLLLLLLLLLL
        LLLLLLLLLLL.....LLLLLLLLLLLLLLLLLLL
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
    {
      anchor: 'T', parts: ['a', 'A'], mode: 'repaint', legend: {L: {mat: 'layer'}, f: {literal: 'bordado'}}, at: [17, 20],
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
  ],
  'down-right': [
    {
      anchor: 'T', mode: 'repaint', legend: {L: {mat: 'layer'}, X: {mat: 'layer', tone: 3}, K: {mat: 'layer', tone: 2}, t: {mat: 'top'}}, at: [17, 23],
      grid: `
        L.....LLL....LLL
        L.....LLLX..XLLL
        L.....LLLLXXLLLL
        L.....LLLLXLLLLL
        L.....LLLLXLLLLL
        L.....LLLLXLLLLL
        L.....LLLLXLLLLL
        L.....LLLLXLLLLL
        L.....LLLLXLLLLL
        L.....LLLLXLLLLL
        L.....LLLLXLLLLL
        L.....LLLLXLLLLL
        L.....LLLLXLLLLL
        L.....LLLLXLLLLL
        L.....LLLLXLLLLL
      `,
    },
    {
      anchor: 'T', mode: 'paint', legend: {L: {mat: 'layer'}, X: {mat: 'layer', tone: 3}, K: {mat: 'layer', tone: 2}, t: {mat: 'top'}}, at: [26, 23],
      grid: `
        tttt
        .tt.
        .t..
      `,
    },
    {
      anchor: 'P', mode: 'cover', legend: {L: {mat: 'layer'}, X: {mat: 'layer', tone: 3}, K: {mat: 'layer', tone: 2}, t: {mat: 'top'}}, at: [17, 38],
      grid: `
        L.....LLLLXLLLLL
        L.....LLLLXLLLLL
        L.....KLLLXLLLKL
        L.....LLLLXLLLLL
        L.....LLLLXLLLLL
        L.....LLLLXLLLLL
        L.....LLLLXXLLLL
        L.....LLLLXXLLLL
        L.....LLLLXXLLLL
        ......LLLLXXLLL.
      `,
    },
    {
      anchor: 'T', parts: ['a', 'A'], mode: 'repaint', legend: {L: {mat: 'layer'}, f: {literal: 'bordado'}}, at: [7, 20],
      grid: `
        LLLLLLLLLLL.....LLLLLLLLLLLLLLLLLLL
        LLLLLLLLLLL.....LLLLLLLLLLLLLLLLLLL
        LLLLLLLLLLL.....LLLLLLLLLLLLLLLLLLL
        LLLLLLLLLLL.....LLLLLLLLLLLLLLLLLLL
        LLLLLLLLLLL.....LLLLLLLLLLLLLLLLLLL
        LLLLLLLLLLL.....LLLLLLLLLLLLLLLLLLL
        LLLLLLLLLLL.....LLLLLLLLLLLLLLLLLLL
        LLLLLLLLLLL.....LLLLLLLLLLLLLLLLLLL
        LLLLLLLLLLL.....LLLLLLLLLLLLLLLLLLL
        LLLLLLLLLLL.....LLLLLLLLLLLLLLLLLLL
        LLLLLLLLLLL.....LLLLLLLLLLLLLLLLLLL
        LLLLLLLLLLL.....LLLLLLLLLLLLLLLLLLL
        LLLLLLLLLLL.....LLLLLLLLLLLLLLLLLLL
        LLLLLLLLLLL.....LLLLLLLLLLLLLLLLLLL
        LLLLLLLLLLL.....LLLLLLLLLLLLLLLLLLL
        LLLLLLLLLLL.....LLLLLLLLLLLLLLLLLLL
        LLLLLLLLLLL.....LLLLLLLLLLLLLLLLLLL
        LLLLLLLLLLL.....LLLLLLLLLLLLLLLLLLL
        LLLLLLLLLLL.....LLLLLLLLLLLLLLLLLLL
        LLLLLLLLLLL.....LLLLLLLLLLLLLLLLLLL
        LLLLLLLLLLL.....LLLLLLLLLLLLLLLLLLL
        LLLLLLLLLLL.....LLLLLLLLLLLLLLLLLLL
        LLLLLLLLLLL.....LLLLLLLLLLLLLLLLLLL
        LLLLLLLLLLL.....LLLLLLLLLLLLLLLLLLL
      `,
    },
    {
      anchor: 'T', mode: 'paint', legend: {L: {mat: 'layer'}, f: {literal: 'bordado'}}, at: [30, 26],
      grid: `
        f
        f
      `,
    },
    {
      anchor: 'T', mode: 'repaint', legend: {L: {mat: 'layer'}, X: {mat: 'layer', tone: 3}, K: {mat: 'layer', tone: 2}, t: {mat: 'top'}}, at: [18, 23],
      grid: `
        LLL..
        LLLX.
        LLLLX
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
      anchor: 'T', mode: 'paint', legend: {L: {mat: 'layer'}, X: {mat: 'layer', tone: 3}, K: {mat: 'layer', tone: 2}, t: {mat: 'top'}}, at: [21, 23],
      grid: `
        tt
        .t
      `,
    },
    {
      anchor: 'P', mode: 'cover', legend: {L: {mat: 'layer'}, X: {mat: 'layer', tone: 3}, K: {mat: 'layer', tone: 2}, t: {mat: 'top'}}, at: [18, 38],
      grid: `
        LLLLX
        LLLLX
        LKKLX
        LLLLX
        LLLLX
        LLLLX
        LLLLX
        LLLLX
        LLLLX
        LLLX.
      `,
    },
    {
      anchor: 'T', parts: ['a', 'A'], mode: 'repaint', legend: {L: {mat: 'layer'}, f: {literal: 'bordado'}}, at: [18, 20],
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
  ],
  'up-right': [
    {
      anchor: 'T', mode: 'repaint', legend: {L: {mat: 'layer'}, X: {mat: 'layer', tone: 3}, K: {mat: 'layer', tone: 2}, t: {mat: 'top'}}, at: [17, 23],
      grid: `
        LLLLLLLLLL.....L
        LLLLLLLLLL.....L
        LLLLLLLLLL.....L
        LLLLLLLLLL.....L
        LLLLLLLLLL.....L
        LLLLLLLLLL.....L
        LLLLLLLLLL.....L
        LLLLLLLLLL.....L
        LLLLLLLLLL.....L
        LLLLLLLLLL.....L
        LLLLLLLLLL.....L
        LLLLLLLLLL.....L
        LLLLLLLLLL.....L
        LLLLLLLLLL.....L
        LLLLLLLLLL.....L
      `,
    },
    {
      anchor: 'P', mode: 'cover', legend: {L: {mat: 'layer'}, X: {mat: 'layer', tone: 3}, K: {mat: 'layer', tone: 2}, t: {mat: 'top'}}, at: [17, 38],
      grid: `
        LLLLLLLLLL.....L
        LLLLLLLLLL.....L
        LLLLLLLLLL.....L
        LLLLLLLLLL.....L
        LLLLLLLLLL.....L
        LLLLLLLLLL.....L
        LLLLLXLLLL.....L
        LLLLLXLLLL.....L
        LLLLLXLLLL.....L
        .LLLLXLLLL......
      `,
    },
    {
      anchor: 'T', parts: ['a', 'A'], mode: 'repaint', legend: {L: {mat: 'layer'}, f: {literal: 'bordado'}}, at: [7, 20],
      grid: `
        LLLLLLLLLLLLLLLLLLLL.....LLLLLLLLLL
        LLLLLLLLLLLLLLLLLLLL.....LLLLLLLLLL
        LLLLLLLLLLLLLLLLLLLL.....LLLLLLLLLL
        LLLLLLLLLLLLLLLLLLLL.....LLLLLLLLLL
        LLLLLLLLLLLLLLLLLLLL.....LLLLLLLLLL
        LLLLLLLLLLLLLLLLLLLL.....LLLLLLLLLL
        LLLLLLLLLLLLLLLLLLLL.....LLLLLLLLLL
        LLLLLLLLLLLLLLLLLLLL.....LLLLLLLLLL
        LLLLLLLLLLLLLLLLLLLL.....LLLLLLLLLL
        LLLLLLLLLLLLLLLLLLLL.....LLLLLLLLLL
        LLLLLLLLLLLLLLLLLLLL.....LLLLLLLLLL
        LLLLLLLLLLLLLLLLLLLL.....LLLLLLLLLL
        LLLLLLLLLLLLLLLLLLLL.....LLLLLLLLLL
        LLLLLLLLLLLLLLLLLLLL.....LLLLLLLLLL
        LLLLLLLLLLLLLLLLLLLL.....LLLLLLLLLL
        LLLLLLLLLLLLLLLLLLLL.....LLLLLLLLLL
        LLLLLLLLLLLLLLLLLLLL.....LLLLLLLLLL
        LLLLLLLLLLLLLLLLLLLL.....LLLLLLLLLL
        LLLLLLLLLLLLLLLLLLLL.....LLLLLLLLLL
        LLLLLLLLLLLLLLLLLLLL.....LLLLLLLLLL
        LLLLLLLLLLLLLLLLLLLL.....LLLLLLLLLL
        LLLLLLLLLLLLLLLLLLLL.....LLLLLLLLLL
        LLLLLLLLLLLLLLLLLLLL.....LLLLLLLLLL
        LLLLLLLLLLLLLLLLLLLL.....LLLLLLLLLL
      `,
    },
    {
      anchor: 'T', mode: 'repaint', legend: {L: {mat: 'layer'}, X: {mat: 'layer', tone: 3}, K: {mat: 'layer', tone: 2}, t: {mat: 'top'}}, at: [27, 23],
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
      anchor: 'P', mode: 'cover', legend: {L: {mat: 'layer'}, X: {mat: 'layer', tone: 3}, K: {mat: 'layer', tone: 2}, t: {mat: 'top'}}, at: [27, 38],
      grid: `
        LLLLL
        LLLLL
        LLLLK
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
      anchor: 'T', parts: ['a', 'A'], mode: 'repaint', legend: {L: {mat: 'layer'}, f: {literal: 'bordado'}}, at: [27, 20],
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
  ],
};
