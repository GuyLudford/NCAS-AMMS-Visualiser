// Atmospheric thermodynamics helpers used by the skew-T plot.

export const EPSILON = 0.622; // Ratio of molecular weights, water vapour / dry air
export const R_OVER_CP = 0.286; // R_d / c_p for dry air
const P_REF = 1000; // hPa reference pressure for potential temperature

// Saturation vapour pressure (Tetens), T in °C, returns hPa.
export function satVapourPressure(T: number): number {
  return 6.112 * Math.exp((17.67 * T) / (T + 243.5));
}

// Inverse of Tetens — given saturation vapour pressure (hPa) returns T (°C).
export function tFromVapourPressure(e: number): number {
  const L = Math.log(e / 6.112);
  return (243.5 * L) / (17.67 - L);
}

// Mixing ratio in g/kg from vapour pressure and total pressure (both hPa).
export function mixingRatio(e: number, p: number): number {
  return 1000 * (EPSILON * e) / Math.max(1e-3, p - e);
}

// Dewpoint (°C) from air temperature (°C) and relative humidity (%).
export function dewPointFromRh(T: number, rh: number): number {
  if (T == null || rh == null || rh <= 0) return NaN;
  const e = satVapourPressure(T) * (rh / 100);
  return tFromVapourPressure(e);
}

// Dry adiabat — given a potential temperature θ (K) and pressure (hPa),
// returns the temperature (°C) at that pressure.
export function dryAdiabatT(thetaK: number, pHpa: number): number {
  return thetaK * Math.pow(pHpa / P_REF, R_OVER_CP) - 273.15;
}

// Temperature (°C) at which the given mixing ratio w (g/kg) is saturated at
// pressure p (hPa). Inverse of mixingRatio.
export function tFromMixingRatio(w: number, pHpa: number): number {
  const wKgPerKg = w / 1000;
  const e = (wKgPerKg * pHpa) / (EPSILON + wKgPerKg);
  return tFromVapourPressure(e);
}

// Barometric formula — height (m AGL) → estimated pressure (hPa) at that
// height, assuming a standard atmosphere from a 1013.25 hPa surface.
export function pressureFromAltitude(altM: number, surfaceHpa = 1013.25): number {
  return surfaceHpa * Math.pow(1 - (0.0065 * altM) / 288.15, 5.255);
}
