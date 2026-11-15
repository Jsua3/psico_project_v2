/**
 * Vistas diagonales (tres cuartos) de hair:rapado.
 * Nacieron de un borrador (scripts/character-kit/borrador-diagonal.mjs) y se
 * corrigen a mano aquí: este archivo es la autoría.
 */
export const DIAGONAL = {
  'down-left': [
    {
      anchor: 'H', mode: 'cover', legend: {R: {mat: 'hair'}, h: {mat: 'hair', tone: 0}}, at: [17, 5],
      grid: `
        .RRRRRRR..
        RRRRRRRRRR
        hhRRRRRRRR
        hRRRRRRRRR
        RRRRRRRRRR
      `,
    },
    {
      anchor: 'H', mode: 'cover', legend: {R: {mat: 'hair'}, h: {mat: 'hair', tone: 0}}, at: [27, 5],
      grid: `
        ...RRR
        .RRRRR
        RRhhRR
        RhRRRR
        RRRRRR
        ..RRRR
        ....RR
        ....R.
        ....R.
      `,
    },
  ],
  'up-left': [
    {
      anchor: 'H', mode: 'cover', legend: {R: {mat: 'hair'}, h: {mat: 'hair', tone: 0}}, at: [23, 5],
      grid: `
        ..RRRRRRR.
        RRRRRRRRRR
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
      `,
    },
    {
      anchor: 'H', mode: 'cover', legend: {R: {mat: 'hair'}, h: {mat: 'hair', tone: 0}}, at: [17, 5],
      grid: `
        RRRRR.
        RRRRRR
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
