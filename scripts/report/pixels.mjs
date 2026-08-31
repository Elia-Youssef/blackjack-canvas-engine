/**
 * Reading rendered pixels from a running page, for item `G2`'s audit. `BJ-22`.
 *
 * Two routes, because the two halves of the criterion live in different places.
 *
 * **The play surface is composited in the page.** The felt is baked onto its own
 * canvas and the cards and chips are drawn on a second one stacked over it, so
 * "the card margin against the table" is a pair of pixels from two canvases. The
 * measurement draws the page's own ground colour, then the felt, then the scene,
 * into one offscreen canvas and reads that: the same three layers the compositor
 * puts on screen, in the same order, with no image encoded or decoded in
 * between. Exact, so an ink that renders as a flat fill is found by exact match.
 *
 * **The chrome is screenshotted and decoded by the browser itself.** No DOM
 * element can be read back as pixels from inside the page, so the region is
 * screenshotted, handed back in as a `data:` URL, and drawn into a canvas by the
 * engine's own PNG decoder. The shipped policy allows exactly that: `img-src`
 * carries `data:`, while `connect-src 'none'` would refuse a `fetch` of the same
 * bytes. Nothing new is installed and no second PNG decoder exists to drift from
 * the one `tests/browser/support/png.ts` already carries.
 */

/**
 * Composite the two play-surface canvases and measure every requested pair.
 *
 * Runs entirely in the page. `pairs` names an ink by its rendered hex and says
 * what its ground is: a specific hex for a pair of flat fills, or `null` for
 * "the table", which is the felt token moved by its own vignette and grain and
 * is therefore a distribution rather than a colour.
 */
export const SURFACE_PROBE = ({ pairs, felts, adjacent, minSamples, ground }) => {
  // One canvas per baked felt since `BJ-22`'s fix round, and exactly one of
  // them is without `hidden`. The audit measures the one on screen.
  const felt = document.querySelector('canvas.bj-surface-felt:not([hidden])');
  const scene = document.querySelector('canvas.bj-surface');
  if (!(felt instanceof HTMLCanvasElement) || !(scene instanceof HTMLCanvasElement)) {
    throw new Error('the play surface is not two canvases');
  }
  const board = document.createElement('canvas');
  board.width = scene.width;
  board.height = scene.height;
  const ctx = board.getContext('2d');
  if (ctx === null) {
    throw new Error('no 2d context for the composite');
  }
  // The page behind the table, then the baked felt, then the animated scene:
  // the three layers the compositor stacks, in the order it stacks them.
  ctx.fillStyle = ground;
  ctx.fillRect(0, 0, board.width, board.height);
  ctx.drawImage(felt, 0, 0, board.width, board.height);
  ctx.drawImage(scene, 0, 0, board.width, board.height);

  const image = ctx.getImageData(0, 0, board.width, board.height);
  const { data, width, height } = image;
  const rgbOf = (hex) => [
    Number.parseInt(hex.slice(1, 3), 16),
    Number.parseInt(hex.slice(3, 5), 16),
    Number.parseInt(hex.slice(5, 7), 16),
  ];
  const hexOf = (r, g, b) =>
    `#${[r, g, b].map((value) => value.toString(16).padStart(2, '0')).join('')}`;
  const at = (x, y) => (y * width + x) * 4;
  /**
   * How far a rendered pixel may sit from a felt token and still be that felt.
   *
   * **A ground is the table, and the table is a distribution.** The bake lays
   * the felt down flat, multiplies a radial vignette over it at up to 0.32
   * alpha, and then screens or multiplies a per-cell grain at up to 0.05, so a
   * felt pixel is the token moved by both. The vignette alone moves a mid channel
   * by about a fifth of itself and the grain adds a twentieth on top; this bound
   * covers both with room to spare and is far below the distance from any felt to
   * any other colour this game paints.
   *
   * Defining the ground this way rather than as "not one of our flat fills" is
   * what makes the measurement mean what the criterion says. The first form of
   * this audit took anything that was not a flat, and duly reported the card
   * margin at 1.4:1 against a pixel four fifths of the way along the antialiased
   * ramp between the white margin and a black pip: a real rendered pixel, and
   * not a ground. An antialiased edge is a blend of two objects and is neither of
   * them.
   */
  const FELT_RANGE = 32;
  const feltRgb = felts.map(rgbOf);
  const isFelt = (r, g, b) =>
    feltRgb.some(
      (felt) =>
        Math.abs(r - felt[0]) <= FELT_RANGE &&
        Math.abs(g - felt[1]) <= FELT_RANGE &&
        Math.abs(b - felt[2]) <= FELT_RANGE,
    );

  const results = {};
  for (const pair of pairs) {
    const ink = rgbOf(pair.ink);
    const counts = new Map();
    let inkPixels = 0;
    if (pair.mode === 'anywhere') {
      // **The table against the page, which nothing measures by adjacency.** The
      // rail rings the whole felt, so a page pixel never touches a felt pixel and
      // an adjacency sampler reports no pair at all. SPEC 16 states the split
      // plainly: on the light ground "the felts clear 3:1 unaided ... and the
      // rail is decorative there", so the reading that matters there is the
      // table's own colour against the page, wherever on the table it is taken.
      for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
          const index = at(x, y);
          const r = data[index] ?? 0;
          const g = data[index + 1] ?? 0;
          const b = data[index + 2] ?? 0;
          if (!isFelt(r, g, b)) {
            continue;
          }
          const key = hexOf(r, g, b);
          counts.set(key, (counts.get(key) ?? 0) + 1);
        }
      }
      const found = [...counts.entries()]
        .filter(([, count]) => count >= minSamples)
        .map(([key, count]) => ({ key, count }));
      results[pair.id] = { inkPixels: 0, grounds: found, colours: counts.size };
      continue;
    }
    for (let y = adjacent; y < height - adjacent; y += 1) {
      for (let x = adjacent; x < width - adjacent; x += 1) {
        const index = at(x, y);
        if (data[index] !== ink[0] || data[index + 1] !== ink[1] || data[index + 2] !== ink[2]) {
          continue;
        }
        inkPixels += 1;
        for (const [dx, dy] of [[-adjacent, 0], [adjacent, 0], [0, -adjacent], [0, adjacent]]) {
          const near = at(x + dx, y + dy);
          const nr = data[near] ?? 0;
          const ng = data[near + 1] ?? 0;
          const nb = data[near + 2] ?? 0;
          const key = hexOf(nr, ng, nb);
          if (key === pair.ink) {
            continue;
          }
          if (pair.only === null ? !isFelt(nr, ng, nb) : key !== pair.only) {
            continue;
          }
          counts.set(key, (counts.get(key) ?? 0) + 1);
        }
      }
    }
    const grounds = [...counts.entries()]
      .filter(([, count]) => count >= minSamples)
      .map(([key, count]) => ({ key, count }));
    results[pair.id] = { inkPixels, grounds, colours: counts.size };
  }
  return results;
};

/**
 * Decode a screenshot in the page and read one region's colour census.
 *
 * The census is every colour and how many pixels carry it, plus the middle row
 * and the middle column as ordered lists. That is all three chrome samplers
 * need: the commonest colour is the background, the most distant from it is the
 * ink, the column crosses a control's top edge where its boundary is and its
 * label is not, and the difference between two censuses is a focus ring.
 */
export const REGION_PROBE = async ({ base64 }) => {
  const image = new Image();
  image.src = `data:image/png;base64,${base64}`;
  await image.decode();
  const canvas = document.createElement('canvas');
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const ctx = canvas.getContext('2d');
  if (ctx === null) {
    throw new Error('no 2d context for the region');
  }
  ctx.drawImage(image, 0, 0);
  const { data, width, height } = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const hexOf = (r, g, b) =>
    `#${[r, g, b].map((value) => value.toString(16).padStart(2, '0')).join('')}`;
  const counts = [];
  const index = new Map();
  const row = Math.floor(height / 2);
  const middle = Math.floor(width / 2);
  const line = [];
  const column = [];
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const at = (y * width + x) * 4;
      const key = hexOf(data[at] ?? 0, data[at + 1] ?? 0, data[at + 2] ?? 0);
      const found = index.get(key);
      if (found === undefined) {
        index.set(key, counts.length);
        counts.push({ key, count: 1 });
      } else {
        const entry = counts[found];
        if (entry !== undefined) {
          entry.count += 1;
        }
      }
      if (y === row) {
        line.push(key);
      }
      if (x === middle) {
        column.push(key);
      }
    }
  }
  return { width, height, counts, line, column };
};
