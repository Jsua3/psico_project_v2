/**
 * Vistas diagonales (tres cuartos) de hair:corto-liso.
 * Nacieron de un borrador (scripts/character-kit/borrador-diagonal.mjs) y se
 * corrigen a mano aquí: este archivo es la autoría.
 */
export const DIAGONAL = {
  'down-left': [
    {
      anchor: 'H', mode: 'cover', legend: {R: {mat: 'hair'}, r: {mat: 'hair', tone: 3}, h: {mat: 'hair', tone: 0}}, at: [17, 5],
      grid: `
        RRRRRRRRR.
        RRhhRRRRRR
        RhRRRRRRRR
        hRRRRRRrRR
        RRRRRRrRRR
        R...RRRRRR
        ........RR
        .........R
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
        RR..RR
        ....RR
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
        RRRRRRRRRR
        RRRRRRRRRR
        RRRRRRRRRR
        RRRRRRRRRR
        RRRRRRRRRR
        RRRRRRRRRR
        RRRRRRRRRR
        .RRRRRRRRR
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
        RRRRRR
        .R.RRR
        .R.RRR
        .R.RRR
        ....RR
        ....RR
      `,
    },
  ],
};
