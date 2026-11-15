/**
 * Vistas diagonales (tres cuartos) de hair:bob-flequillo.
 * Nacieron de un borrador (scripts/character-kit/borrador-diagonal.mjs) y se
 * corrigen a mano aquí: este archivo es la autoría.
 */
export const DIAGONAL = {
  'down-left': [
    {
      anchor: 'H', mode: 'cover', legend: {R: {mat: 'hair'}, r: {mat: 'hair', tone: 3}, s: {mat: 'hair', tone: 2}, h: {mat: 'hair', tone: 0}}, at: [16, 5],
      grid: `
        .RRRRRRRRR........
        .RhhRRRRRRR.......
        .hrRRRRRRRR.......
        .RrRRhhRRRR.......
        .R.RRRRRRRR.......
        .....RrRRRR.......
        ......RRRrR.......
        ........RRR.......
        ..........R.......
        R.........R......R
        R.........R......R
        R.........R......R
        R.........R......R
        R.........R......R
        .R.......RR.......
        .R.......RR.......
      `,
    },
    {
      anchor: 'H', mode: 'cover', legend: {R: {mat: 'hair'}, r: {mat: 'hair', tone: 3}, s: {mat: 'hair', tone: 2}, h: {mat: 'hair', tone: 0}}, at: [27, 5],
      grid: `
        ...RRR
        .RRRhR
        RRhhRR
        RhRRRR
        RRRRRR
        RR..RR
        RR..RR
        ....rR
        ....rR
        ....Rr
        ....Rr
        ....Rr
        ....Rr
        ....RR
        ....RR
        ....RR
      `,
    },
  ],
  'up-left': [
    {
      anchor: 'H', mode: 'cover', legend: {R: {mat: 'hair'}, r: {mat: 'hair', tone: 3}, s: {mat: 'hair', tone: 2}, h: {mat: 'hair', tone: 0}}, at: [16, 5],
      grid: `
        ........RRRRRRRRR.
        .......RRRhhhRRRR.
        .......RhhRRRRRRR.
        .......hRRRRRRRRR.
        .......RRRRRRRRRR.
        .......RRRRRRRRRR.
        .......RRRRRRRRRR.
        .......RRRRRRRRRR.
        .......RRRRRRRRRR.
        R......RRRRRRRRRRR
        R......RRRRRRRRRRR
        R......rRRRRRRRRRR
        R......rRRRRRRRRRR
        R......RrRRRRRRRrR
        .......RRRRRRRRRR.
        .......RRRRRRRRRR.
      `,
    },
    {
      anchor: 'H', mode: 'cover', legend: {R: {mat: 'hair'}, r: {mat: 'hair', tone: 3}, s: {mat: 'hair', tone: 2}, h: {mat: 'hair', tone: 0}}, at: [17, 5],
      grid: `
        RRRRR.
        hRRRRR
        RRRRRR
        RRRRRR
        RRRRRR
        RRRRRR
        .RRRRR
        rRRRRR
        rRRRRR
        RrRRRR
        RrRRRR
        RrRRRR
        RrRRRR
        RRrrrr
        RRRRR.
        .R....
      `,
    },
  ],
  'down-right': [
    {
      anchor: 'H', mode: 'cover', legend: {R: {mat: 'hair'}, r: {mat: 'hair', tone: 3}, s: {mat: 'hair', tone: 2}, h: {mat: 'hair', tone: 0}}, at: [15, 5],
      grid: `
        ........RRRRRRRRR.
        .......RRRhhRRRRR.
        .......RhhrRRRRRR.
        .......hRrRRRhhRR.
        .......RR..RRRRRR.
        .......R.....RrRR.
        .......R......RRr.
        .......R.......RR.
        .......R..........
        R......R.........R
        R......R.........R
        R......R.........R
        R......R.........R
        R......R.........R
        .......RR.......R.
        .......RR.......R.
      `,
    },
    {
      anchor: 'H', mode: 'cover', legend: {R: {mat: 'hair'}, r: {mat: 'hair', tone: 3}, s: {mat: 'hair', tone: 2}, h: {mat: 'hair', tone: 0}}, at: [16, 5],
      grid: `
        RRR...
        RhhrR.
        RhRrRR
        RRRRrR
        RRRRR.
        RRRR..
        RRR...
        rR....
        rR....
        rR....
        rR....
        rR....
        rR....
        RR....
        RR....
        R.....
      `,
    },
  ],
  'up-right': [
    {
      anchor: 'H', mode: 'cover', legend: {R: {mat: 'hair'}, r: {mat: 'hair', tone: 3}, s: {mat: 'hair', tone: 2}, h: {mat: 'hair', tone: 0}}, at: [15, 5],
      grid: `
        .RRRRRRRRR........
        .RRhhRRRRRR.......
        .hhRRRRRRRR.......
        .hRRRRRRRRR.......
        .RRRRRRRRRR.......
        .RRRRRRRRRR.......
        .RRRRRRRRRR.......
        .RRRRRRRRRR.......
        .RRRRRRRRRR.......
        RRRRRRRRRRR......R
        RRRRRRRRRRR......R
        RrRRRRRRRRR......R
        RrRRRRRRRRR......R
        RrRRRRRRRrr......R
        .RRRRRRRRRR.......
        .RRRRRRRRRR.......
      `,
    },
    {
      anchor: 'H', mode: 'cover', legend: {R: {mat: 'hair'}, r: {mat: 'hair', tone: 3}, s: {mat: 'hair', tone: 2}, h: {mat: 'hair', tone: 0}}, at: [26, 5],
      grid: `
        .RRRRR
        RRRRRh
        RRRRRh
        RRRRRR
        RRRRRR
        RRRRRR
        RRRRRR
        RRRRrR
        RRRRr.
        RRRRr.
        RRRRr.
        RRRRrR
        rRRRrR
        RrrrRR
        .RRRR.
        ...RR.
      `,
    },
  ],
};
