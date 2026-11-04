/**
 * Stage container measurements: changes of one pixel or less are ignored so that scrollbars
 * appearing or sub-pixel layout rounding can never feed back into the scale (resize loop).
 */
export const MEASURE_TOLERANCE_PX = 1;

export function nextMeasurement(current: number, measured: number | undefined): number {
  if (measured === undefined || !Number.isFinite(measured)) return current;
  return Math.abs(measured - current) > MEASURE_TOLERANCE_PX ? measured : current;
}
