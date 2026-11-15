/**
 * Vistas diagonales (tres cuartos) de hair:cola-caballo.
 * Nacieron de un borrador (scripts/character-kit/borrador-diagonal.mjs) y se
 * corrigen a mano aquí: este archivo es la autoría.
 */
export const DIAGONAL = {
  'down-left': [
    {
      anchor: 'H', mode: 'cover', legend: {R: {mat: 'hair'}, r: {mat: 'hair', tone: 3}, h: {mat: 'hair', tone: 0}}, at: [17, 5],
      grid: `
        RRRRRRRRR.
        RhhRRRRRRR
        hhRRRRRRRR
        hRRRRRRRRR
        RRRRRRRRRR
        rRRRRRRRrR
        R.R...R..R
      `,
    },
    {
      anchor: 'H', mode: 'cover', legend: {R: {mat: 'hair'}, r: {mat: 'hair', tone: 3}, h: {mat: 'hair', tone: 0}}, at: [27, 5],
      grid: `
        ...RRR
        .RRRhR
        RRhhRR
        RhRRRR
        RRRRRR
        rRRRRR
        .R..RR
        ....R.
        ....R.
      `,
    },
  ],
  'up-left': [
    {
      anchor: 'H', mode: 'cover', legend: {R: {mat: 'hair'}, r: {mat: 'hair', tone: 3}, h: {mat: 'hair', tone: 0}}, at: [23, 5],
      grid: `
        .RRRRRRRRR
        RRRhhRRRRR
        RhhRRRRRRR
        hRRRRRRRRR
        RRRRRRRRRR
        RRRRRrrRRR
        RRRRRhRRRR
        RRRRRRRRRR
        RRRRRhRRRR
        RRRRRRRRRR
        RRRRRhRRRR
        RRRRRRRRRR
        .RRRRRRRRR
        ....RhRR..
        ....RRRR..
        ....RRRR..
      `,
    },
    {
      anchor: 'T', mode: 'cover', legend: {R: {mat: 'hair'}, r: {mat: 'hair', tone: 3}, h: {mat: 'hair', tone: 0}}, at: [27, 21],
      grid: `
        RRRR
        .RR.
        .RR.
        .R..
      `,
    },
    {
      anchor: 'H', mode: 'cover', legend: {R: {mat: 'hair'}, r: {mat: 'hair', tone: 3}, h: {mat: 'hair', tone: 0}}, at: [17, 5],
      grid: `
        RRRRR.
        hRRRRR
        RRRRRR
        RRRRRR
        RRRRRR
        RRRRRR
        .RRRRR
        .R.RRR
        .R.RRR
        .R.RRR
        ...RRR
        ...RRR
      `,
    },
  ],
};
