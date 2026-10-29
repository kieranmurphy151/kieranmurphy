/* Swell Window: coasts and starter spots.
   Starter profiles are rough estimates to begin from. Tune them in the app
   (Spots → Edit) and let session logs correct the rest.

   Directions are degrees the swell or wind comes FROM (0 = N, 90 = E, 180 = S, 270 = W).
   pt      forecast point a few km offshore of the break (used for swell and wind)
   at      the break itself (map link)
   swell   window of swell directions that reach the break, clockwise from `from` to `to`
   size    face-height range in feet where the spot works well
   offshore  wind direction that blows offshore here
   windOk  wind angles that are acceptable for the "could be working" flag
   tide    tide states it works on ([] = any)
   scale   overall size multiplier for the break (sheltered bay < 1, focusing reef > 1)
*/
(function (root) {
  'use strict';

  const REGIONS = [
    { id: 'waterford', name: 'Waterford', coast: 'South coast', pt: [51.95, -7.30] },
    { id: 'kerry', name: 'Kerry', coast: 'Southwest', pt: [52.05, -10.70] },
    { id: 'clare', name: 'Clare', coast: 'West coast', pt: [52.95, -9.85] },
    { id: 'donegal', name: 'Donegal', coast: 'Northwest', pt: [54.70, -8.90] }
  ];

  const base = { minPeriod: 9, size: [2, 6], maxWind: 25, windOk: ['offshore', 'cross-off'], tide: [], scale: 1, type: 'beach', notes: '' };
  const spot = (o) => Object.assign({}, base, o, { starter: true });

  const STARTER_SPOTS = [
    // Waterford
    spot({ id: 'tramore', name: 'Tramore', region: 'waterford', at: [52.158, -7.135], pt: [52.11, -7.12],
      swell: { from: 150, to: 240, best: 195 }, offshore: 355, scale: 0.85,
      notes: 'Big sandy bay, sheltered from west swell. Starter estimate.' }),
    spot({ id: 'annestown', name: 'Annestown', region: 'waterford', at: [52.131, -7.272], pt: [52.09, -7.27],
      swell: { from: 150, to: 235, best: 190 }, offshore: 0, scale: 0.95, type: 'reef',
      notes: 'Cove with reef and sand. Starter estimate.' }),
    spot({ id: 'bunmahon', name: 'Bunmahon', region: 'waterford', at: [52.135, -7.366], pt: [52.09, -7.37],
      swell: { from: 145, to: 230, best: 185 }, offshore: 5, scale: 0.9,
      notes: 'South-facing beach. Forecasts often overcall it on westerly swell. Starter estimate.' }),

    // Kerry
    spot({ id: 'inch', name: 'Inch', region: 'kerry', at: [52.138, -9.980], pt: [52.10, -10.10],
      swell: { from: 225, to: 300, best: 260 }, offshore: 90, scale: 0.85,
      notes: 'Long beach inside Dingle Bay. Starter estimate.' }),
    spot({ id: 'brandon-bay', name: 'Brandon Bay', region: 'kerry', at: [52.270, -10.040], pt: [52.33, -10.05],
      swell: { from: 280, to: 30, best: 330 }, offshore: 180, minPeriod: 10, scale: 0.85,
      notes: 'North-facing bay. Needs a solid W to NW swell to wrap in; works in southerly wind. Starter estimate.' }),
    spot({ id: 'ballybunion', name: 'Ballybunion', region: 'kerry', at: [52.512, -9.674], pt: [52.52, -9.75],
      swell: { from: 230, to: 320, best: 280 }, offshore: 100, scale: 0.9,
      notes: 'Beaches either side of the castle. Starter estimate.' }),

    // Clare
    spot({ id: 'lahinch', name: 'Lahinch', region: 'clare', at: [52.933, -9.348], pt: [52.93, -9.42],
      swell: { from: 215, to: 300, best: 260 }, offshore: 80, size: [2, 7], scale: 0.9,
      notes: 'Beach break in Liscannor Bay. Starter estimate.' }),
    spot({ id: 'spanish-point', name: 'Spanish Point', region: 'clare', at: [52.850, -9.440], pt: [52.85, -9.52],
      swell: { from: 220, to: 310, best: 270 }, offshore: 90, tide: ['low', 'mid'], type: 'reef',
      notes: 'Reefs and beach. Starter estimate.' }),
    spot({ id: 'crab-island', name: 'Crab Island', region: 'clare', at: [53.022, -9.405], pt: [53.03, -9.47],
      swell: { from: 240, to: 320, best: 285 }, offshore: 110, minPeriod: 11, size: [4, 15], maxWind: 30, scale: 1.1, type: 'reef',
      notes: 'Heavy reef off Doolin, experienced surfers only. Starter estimate.' }),
    spot({ id: 'fanore', name: 'Fanore', region: 'clare', at: [53.118, -9.292], pt: [53.13, -9.37],
      swell: { from: 240, to: 330, best: 285 }, offshore: 100,
      notes: 'Beach under the Burren. Starter estimate.' }),

    // Donegal
    spot({ id: 'tullan', name: 'Tullan Strand', region: 'donegal', at: [54.487, -8.281], pt: [54.51, -8.36],
      swell: { from: 250, to: 340, best: 295 }, offshore: 135, scale: 0.9,
      notes: 'Bundoran beach break. Starter estimate.' }),
    spot({ id: 'the-peak', name: 'The Peak', region: 'donegal', at: [54.479, -8.285], pt: [54.50, -8.33],
      swell: { from: 260, to: 330, best: 290 }, offshore: 160, minPeriod: 10, size: [3, 8], tide: ['low', 'mid'], scale: 1.05, type: 'reef',
      notes: 'Bundoran reef. Starter estimate.' }),
    spot({ id: 'rossnowlagh', name: 'Rossnowlagh', region: 'donegal', at: [54.555, -8.209], pt: [54.56, -8.28],
      swell: { from: 240, to: 320, best: 280 }, offshore: 90, scale: 0.8,
      notes: 'Sheltered beach inside Donegal Bay. Starter estimate.' })
  ];

  root.SW_REGIONS = REGIONS;
  root.SW_STARTER_SPOTS = STARTER_SPOTS;
  if (typeof module !== 'undefined') module.exports = { REGIONS, STARTER_SPOTS };
})(typeof window !== 'undefined' ? window : globalThis);
