/**
 * Vistas diagonales (tres cuartos) de hair:largo-suelto.
 * Nacieron de un borrador (scripts/character-kit/borrador-diagonal.mjs) y se
 * corrigen a mano aquí: este archivo es la autoría.
 */
export const DIAGONAL = {
  'down-left': [
    {
      anchor: 'H', mode: 'cover', legend: {R: {mat: 'hair'}, r: {mat: 'hair', tone: 3}, h: {mat: 'hair', tone: 0}}, at: [16, 5],
      grid: `
        .RRRRRRRRR........
        .RhhRRRRRRR.......
        .hhrRRRRRRR.......
        .hrRrRRRRRR.......
        .Rr.RRRRRRR.......
        .RR....RRRR.......
        .R.......RR.......
        R.........R......R
        R.........R......R
        R.........R......R
        R.........R......R
        R.........R......R
        R.........R......R
        R.........R......R
        R.........R......R
        ..........R.......
      `,
    },
    {
      anchor: 'T', mode: 'cover', legend: {R: {mat: 'hair'}, r: {mat: 'hair', tone: 3}, h: {mat: 'hair', tone: 0}}, at: [16, 21],
      grid: `
        R.........R......R
        RR.......RR......R
        .RR.....RRR.......
        .RR.....RRR.......
        .rR.....RRr.......
        .RR.....RRR.......
        .RR.....RRR.......
        .rR.....RrR.......
        .RR.....RRR.......
        .R.......RR.......
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
        R...RR
        ....RR
        ....RR
        ....RR
        ....RR
        .....R
        .....R
        .....R
      `,
    },
  ],
  'up-left': [
    {
      anchor: 'H', mode: 'cover', legend: {R: {mat: 'hair'}, r: {mat: 'hair', tone: 3}, h: {mat: 'hair', tone: 0}}, at: [16, 5],
      grid: `
        ........RRRRRRRRR.
        .......RRRhhRRRRR.
        .......RhhRRRRRRR.
        .......hRRRRRRRRR.
        .......RRRRRRRRRR.
        .......RRRRRRRRRR.
        .......RRRRRRRRRR.
        R......RRRRRRRRRRR
        R......RRRRRRRRRRR
        R......RRRRRRRRRRR
        R......RRrRRRRRrRR
        R......RRrRRRRRrRR
        R......RRRRRRRRRRR
        R......RRRRRRRRRRR
        R......RRRRRRRRRRR
        R......RRRRRRRRRRR
      `,
    },
    {
      anchor: 'T', mode: 'cover', legend: {R: {mat: 'hair'}, r: {mat: 'hair', tone: 3}, h: {mat: 'hair', tone: 0}}, at: [16, 21],
      grid: `
        R......RRRRRRRRRRR
        R......RRRRRRRRRRR
        .......RRrRRRRRrR.
        .......RRRRRRRRRR.
        .......RRRRRRRRRR.
        .......RRrRRRRRrR.
        .......RRRRRRRRRR.
        .......RRRRRRRRRR.
        .......RRRrRRRRrR.
        .......RRRRRRRRRR.
        ........RRRRRRRRR.
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
        RRRRRR
        RRRRRR
        .RRRRR
        .RRRRR
        .RRRRR
        ..RRRR
        ..RRRR
        ..RRRR
        ..RRRR
      `,
    },
    {
      anchor: 'T', mode: 'cover', legend: {R: {mat: 'hair'}, r: {mat: 'hair', tone: 3}, h: {mat: 'hair', tone: 0}}, at: [19, 21],
      grid: `
        RRRR
        RRRR
        .RRR
        .RRR
        .RRR
        .RRR
        .RRR
        .RRR
        ..RR
        ..RR
        ...R
      `,
    },
  ],
};
