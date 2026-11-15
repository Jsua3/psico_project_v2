/**
 * Vistas diagonales (tres cuartos) de top:blazer.
 * Nacieron de un borrador (scripts/character-kit/borrador-diagonal.mjs) y se
 * corrigen a mano aquí: este archivo es la autoría.
 */
export const DIAGONAL = {
  'down-left': [
    {
      anchor: 'T', mode: 'cover', legend: {j: {mat: 'top'}, h: {mat: 'top', tone: 0}, x: {mat: 'top', tone: 3}, K: {mat: 'top', tone: 2}, i: {mat: 'inner'}}, at: [18, 22],
      grid: `
        ii..ii
      `,
    },
    {
      anchor: 'T', mode: 'paint', legend: {j: {mat: 'top'}, h: {mat: 'top', tone: 0}, x: {mat: 'top', tone: 3}, K: {mat: 'top', tone: 2}, i: {mat: 'inner'}}, at: [18, 23],
      grid: `
        hiiiihh
        hhiihhh
        hhhihh.
        .xhhx..
        .xxix..
        ..xx...
        ..xx...
        ...x...
        ...x...
        ...h...
        ...x...
        ...x...
        ...x...
        ...x...
        ...x...
      `,
    },
    {
      anchor: 'P', mode: 'paint', legend: {j: {mat: 'top'}, h: {mat: 'top', tone: 0}, x: {mat: 'top', tone: 3}, K: {mat: 'top', tone: 2}, i: {mat: 'inner'}}, at: [17, 38],
      grid: `
        KKKKxKKKK
        KKKKxKKKK
      `,
    },
    {
      anchor: 'T', mode: 'cover', legend: {j: {mat: 'top'}, h: {mat: 'top', tone: 0}, x: {mat: 'top', tone: 3}, K: {mat: 'top', tone: 2}, i: {mat: 'inner'}}, at: [28, 22],
      grid: `
        iii
      `,
    },
    {
      anchor: 'T', mode: 'paint', legend: {j: {mat: 'top'}, h: {mat: 'top', tone: 0}, x: {mat: 'top', tone: 3}, K: {mat: 'top', tone: 2}, i: {mat: 'inner'}}, at: [26, 23],
      grid: `
        .iih
        hhh.
        hh..
        h...
        ....
        ....
        x...
        x...
        .x..
        .h..
        .x..
        .x..
        .x..
        .x..
        .x..
      `,
    },
    {
      anchor: 'P', mode: 'paint', legend: {j: {mat: 'top'}, h: {mat: 'top', tone: 0}, x: {mat: 'top', tone: 3}, K: {mat: 'top', tone: 2}, i: {mat: 'inner'}}, at: [27, 38],
      grid: `
        xKKK
        xKKK
      `,
    },
  ],
  'up-left': [
    {
      anchor: 'T', mode: 'paint', legend: {j: {mat: 'top'}, h: {mat: 'top', tone: 0}, x: {mat: 'top', tone: 3}, K: {mat: 'top', tone: 2}, i: {mat: 'inner'}}, at: [26, 28],
      grid: `
        x
        x
        x
        x
        x
        x
        x
        x
        x
        x
      `,
    },
    {
      anchor: 'P', mode: 'paint', legend: {j: {mat: 'top'}, h: {mat: 'top', tone: 0}, x: {mat: 'top', tone: 3}, K: {mat: 'top', tone: 2}, i: {mat: 'inner'}}, at: [22, 38],
      grid: `
        KKKKxKKKK
        KKKKxKKKK
      `,
    },
    {
      anchor: 'T', mode: 'cover', legend: {j: {mat: 'top'}, h: {mat: 'top', tone: 0}, x: {mat: 'top', tone: 3}, K: {mat: 'top', tone: 2}, i: {mat: 'inner'}}, at: [17, 22],
      grid: `
        iii
      `,
    },
    {
      anchor: 'P', mode: 'paint', legend: {j: {mat: 'top'}, h: {mat: 'top', tone: 0}, x: {mat: 'top', tone: 3}, K: {mat: 'top', tone: 2}, i: {mat: 'inner'}}, at: [17, 38],
      grid: `
        KKKKK
        KKKKK
      `,
    },
  ],
};
