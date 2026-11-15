/**
 * Vistas diagonales (tres cuartos) de hair:corto-rizado.
 * Nacieron de un borrador (scripts/character-kit/borrador-diagonal.mjs) y se
 * corrigen a mano aquí: este archivo es la autoría.
 */
export const DIAGONAL = {
  'down-left': [
    {
      anchor: 'H', mode: 'cover', legend: {R: {mat: 'hair'}, r: {mat: 'hair', tone: 3}, h: {mat: 'hair', tone: 0}}, at: [16, 4],
      grid: `
        ..R.R.RR..........
        .RRRRRRRRRR.......
        .hRRRhRRRRR.......
        .hRRRhRRRRR.......
        RRRRRRRRRRr......R
        RRRRRRRRRRR......R
        RR.....R.RR......r
        ..........R.......
      `,
    },
    {
      anchor: 'H', mode: 'cover', legend: {R: {mat: 'hair'}, r: {mat: 'hair', tone: 3}, h: {mat: 'hair', tone: 0}}, at: [27, 4],
      grid: `
        ....RR
        .RRRRR
        RRhRRh
        RhRRRh
        RRRRRR
        hRRRRR
        RR..RR
        ....RR
        ....RR
        ....R.
        ....R.
      `,
    },
  ],
  'up-left': [
    {
      anchor: 'H', mode: 'cover', legend: {R: {mat: 'hair'}, r: {mat: 'hair', tone: 3}, h: {mat: 'hair', tone: 0}}, at: [16, 4],
      grid: `
        .........RR.R.R...
        .......RRRRRRRRRR.
        .......RhRRRRhRRR.
        .......hRRRRhRRRR.
        R......RRRRRRRRRrR
        R......RRRRRRRRRRR
        R......RRRRRhRRRRR
        .......RRRRRRRRRR.
        .......RhRRRRRRRr.
        .......RRRRRRRRRR.
        .......RRRRRRRRRr.
        .......RRRRRRRRRR.
        ........RRRRRRRRR.
      `,
    },
    {
      anchor: 'H', mode: 'cover', legend: {R: {mat: 'hair'}, r: {mat: 'hair', tone: 3}, h: {mat: 'hair', tone: 0}}, at: [17, 4],
      grid: `
        R.R.R.
        RRRRRR
        RhRRRR
        RhRRRR
        RRRRRR
        RRRRRR
        RRRRRR
        .RRRRR
        RRRRRR
        .R.RRR
        .R.RRR
        .R.RRR
        ...RRR
        ....RR
      `,
    },
  ],
};
