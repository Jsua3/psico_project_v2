/**
 * Vistas diagonales (tres cuartos) de hair:afro.
 * Nacieron de un borrador (scripts/character-kit/borrador-diagonal.mjs) y se
 * corrigen a mano aquí: este archivo es la autoría.
 */
export const DIAGONAL = {
  'down-left': [
    {
      anchor: 'H', mode: 'cover', legend: {R: {mat: 'hair'}, r: {mat: 'hair', tone: 3}, h: {mat: 'hair', tone: 0}}, at: [14, 4],
      grid: `
        ...RRRhRRRRR..........
        ...RhRRRRhRRR.........
        ...RRRRhRRRRR.........
        ..RRhRRRRRRRR......R..
        .RRhRRRhRRRRR......RR.
        RRhRRhRRRRRRR......rRR
        RRR................RRR
        RRh................RRR
        hRR................RRr
        RRR................rRR
        .hR................RR.
        ..R................R..
        ..R................R..
      `,
    },
    {
      anchor: 'H', mode: 'cover', legend: {R: {mat: 'hair'}, r: {mat: 'hair', tone: 3}, h: {mat: 'hair', tone: 0}}, at: [27, 4],
      grid: `
        ...RhR
        .RhRRR
        RRRRRh
        RRRhRR
        hRRRRh
        ....hR
        ....RR
        ....hR
        .....R
        .....R
        .....R
        .....R
        .....R
        .....R
        .....R
      `,
    },
  ],
  'up-left': [
    {
      anchor: 'H', mode: 'cover', legend: {R: {mat: 'hair'}, r: {mat: 'hair', tone: 3}, h: {mat: 'hair', tone: 0}}, at: [14, 4],
      grid: `
        ..........RRRRhRRRR...
        .........RRhRRRRRhR...
        .........RRRRRhRRRR...
        ..R......RRRhRRRRRRR..
        .RR......hRRRRRhRRRRR.
        RRh......RRRRhRRRRRrRR
        RRR......RhRRRRRRRrRRR
        RRh......RRRRRRRRrRRRR
        hRR......RRhRRRRRRRRRr
        RRR......RRRRRRRRRRrRR
        .hR......RRRRRRRRRrRR.
        ..R......hRRRRRRrRRR..
        .........RRRRRrRRRR...
        .........RRrRRRRRRR...
        ..........RRRRRRRrR...
      `,
    },
    {
      anchor: 'H', mode: 'cover', legend: {R: {mat: 'hair'}, r: {mat: 'hair', tone: 3}, h: {mat: 'hair', tone: 0}}, at: [17, 4],
      grid: `
        hRRRRR
        RRRhRR
        RhRRRR
        RRRRRR
        RhRRRR
        hRRRRR
        RRRRRR
        hRRrRR
        .RRRRR
        .RRRRR
        .RRRRr
        .RrRRR
        .RRRRR
        .RRRRR
        .RRRrR
      `,
    },
  ],
};
