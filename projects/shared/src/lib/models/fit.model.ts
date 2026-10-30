import type { ProductListItem } from './product.model';

export type PassageType = 'DOOR' | 'ELEVATOR' | 'STAIRS' | 'HALLWAY';

/** Một điểm lối đi (cm, kg). Chỉ `ELEVATOR` có `cabin*` và `loadCapacityKg`. */
export interface WalkwayPassage {
  type: PassageType;
  label?: string;
  width: number;
  height: number;
  length?: number;
  cabinLength?: number;
  cabinWidth?: number;
  cabinHeight?: number;
  loadCapacityKg?: number;
}

export interface WalkwayProfile {
  name: string;
  passages: WalkwayPassage[];
}

export type FitStatus = 'PASS' | 'CAUTION' | 'FAIL';
export type FitPosture = 'FLAT' | 'UPRIGHT' | 'TILT';
export type FitVerdict = 'FITS_AS_PACKAGE' | 'FITS_BY_PARTS' | 'DOES_NOT_FIT';

export interface FitPassageResult {
  index: number;
  passageLabel: string;
  type: PassageType;
  status: FitStatus;
  posture: FitPosture | null;
  minClearanceCm: number | null;
  note: string | null;
}

export interface FitCheckDetail {
  fits: boolean;
  details: FitPassageResult[];
}

export interface FitCheckResult {
  verdict: FitVerdict;
  status: FitStatus;
  disclaimer: string;
  packageCheck: FitCheckDetail;
  partCheck: FitCheckDetail | null;
  elevatorLoadCheck: { fits: boolean; totalWeightKg: number; capacityKg: number } | null;
  usedDimensions: {
    packageCount: number;
    largest: { length: number; width: number; height: number };
  };
}

export interface FitCheckRequest {
  productId: string;
  variantId?: string;
  passages: WalkwayPassage[];
}

export type SimilarFitItem = ProductListItem & { fitStatus: FitStatus };
