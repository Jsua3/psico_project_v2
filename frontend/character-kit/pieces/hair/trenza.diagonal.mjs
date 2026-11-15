/**
 * Vistas diagonales (tres cuartos) de hair:trenza.
 * Nacieron de un borrador (scripts/character-kit/borrador-diagonal.mjs) y se
 * corrigen a mano aquí: este archivo es la autoría.
 */
export const DIAGONAL = {
  'down-left': [
    {
      anchor: 'H', mode: 'cover', legend: {R: {mat: 'hair'}, r: {mat: 'hair', tone: 3}, h: {mat: 'hair', tone: 0}}, at: [17, 5],
      grid: `
        RRRRRRRRR........
        RhhRRRRRRR.......
        hhRRrRRRRR.......
        hRRrrRRRRR.......
        RRRrrRRRRR.......
        RR.....RRR.......
        .........R.......
        .................
        ................R
        ................R
      `,
    },
    {
      anchor: 'H', mode: 'cover', legend: {R: {mat: 'hair'}, r: {mat: 'hair', tone: 3}, h: {mat: 'hair', tone: 0}}, at: [26, 16],
      grid: `
        h......r
        R......r
        h......r
        R......r
        h......r
      `,
    },
    {
      anchor: 'T', mode: 'cover', legend: {R: {mat: 'hair'}, r: {mat: 'hair', tone: 3}, h: {mat: 'hair', tone: 0}}, at: [25, 21],
      grid: `
        hR
        Rh
        hR
        Rh
        hR
        Rh
        hR
        Rh
        hR
        .r
        .R
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
        ..RRRR
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
      anchor: 'T', mode: 'cover', legend: {R: {mat: 'hair'}, r: {mat: 'hair', tone: 3}, h: {mat: 'hair', tone: 0}}, at: [24, 21],
      grid: `
        hRr
        Rhr
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
        ...RRR
        ....RR
        .....R
        .....R
      `,
    },
  ],
  'down-right': [
    {
      anchor: 'H', mode: 'cover', legend: {R: {mat: 'hair'}, r: {mat: 'hair', tone: 3}, h: {mat: 'hair', tone: 0}}, at: [22, 5],
      grid: `
        .RRRRRRRRR.
        RRRhhRRRRR.
        RhhRRrRRRR.
        hRRRRrrRRR.
        RRRRRrrRRR.
        RRR.....RR.
        R..........
        ...........
        ..........R
        ..........R
      `,
    },
    {
      anchor: 'H', mode: 'cover', legend: {R: {mat: 'hair'}, r: {mat: 'hair', tone: 3}, h: {mat: 'hair', tone: 0}}, at: [31, 16],
      grid: `
        hr
        Rr
        hr
        Rr
        hr
      `,
    },
    {
      anchor: 'T', mode: 'cover', legend: {R: {mat: 'hair'}, r: {mat: 'hair', tone: 3}, h: {mat: 'hair', tone: 0}}, at: [31, 21],
      grid: `
        h
        R
        h
        R
        h
        R
        h
        R
        h
        r
        R
      `,
    },
    {
      anchor: 'H', mode: 'cover', legend: {R: {mat: 'hair'}, r: {mat: 'hair', tone: 3}, h: {mat: 'hair', tone: 0}}, at: [16, 5],
      grid: `
        RRR...
        RhRRR.
        RRhhRR
        RRRRhR
        RRRRRR
        RRRR..
        RR....
        .R....
        .R....
      `,
    },
    {
      anchor: 'H', mode: 'cover', legend: {R: {mat: 'hair'}, r: {mat: 'hair', tone: 3}, h: {mat: 'hair', tone: 0}}, at: [16, 17],
      grid: `
        R
        h
        R
        h
      `,
    },
    {
      anchor: 'T', mode: 'cover', legend: {R: {mat: 'hair'}, r: {mat: 'hair', tone: 3}, h: {mat: 'hair', tone: 0}}, at: [17, 21],
      grid: `
        hr
        Rr
        hr
        Rr
        hr
        Rr
        hr
        Rr
        hr
        Rr
        r.
        R.
      `,
    },
  ],
  'up-right': [
    {
      anchor: 'H', mode: 'cover', legend: {R: {mat: 'hair'}, r: {mat: 'hair', tone: 3}, h: {mat: 'hair', tone: 0}}, at: [16, 5],
      grid: `
        RRRRRRRRR.
        RhhRRRRRRR
        hhRRRRRRRR
        hRRRRRRRRR
        RRRRRRRRRR
        RRRRRRRRRR
        RRRRRRRRRR
        RRRRRRRRRR
        RRRRRRRRRR
        RRRRRRRRRR
        RRRRRRRRRR
        RRRRRRRRRR
        RRRRRRRRR.
      `,
    },
    {
      anchor: 'T', mode: 'cover', legend: {R: {mat: 'hair'}, r: {mat: 'hair', tone: 3}, h: {mat: 'hair', tone: 0}}, at: [16, 21],
      grid: `
        hR
        Rh
      `,
    },
    {
      anchor: 'H', mode: 'cover', legend: {R: {mat: 'hair'}, r: {mat: 'hair', tone: 3}, h: {mat: 'hair', tone: 0}}, at: [26, 5],
      grid: `
        .RRRRR
        RRRRRh
        RRRRRR
        RRRRRR
        RRRRRR
        RRRRRR
        RRRRRR
        RRR.R.
        RRR.R.
        RRR.R.
        RRR...
        RR....
        R.....
        R.....
      `,
    },
    {
      anchor: 'H', mode: 'cover', legend: {R: {mat: 'hair'}, r: {mat: 'hair', tone: 3}, h: {mat: 'hair', tone: 0}}, at: [29, 17],
      grid: `
        hR
        Rh
        hR
        Rh
      `,
    },
    {
      anchor: 'T', mode: 'cover', legend: {R: {mat: 'hair'}, r: {mat: 'hair', tone: 3}, h: {mat: 'hair', tone: 0}}, at: [31, 21],
      grid: `
        h
        R
        h
        R
        h
        R
        h
        R
        h
        R
        r
        R
      `,
    },
  ],
};
