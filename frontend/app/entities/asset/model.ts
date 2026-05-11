export type AssetType = "ETF" | "FUND" | "FUTURE" | "INDEX";

export interface AssetHolding {
  symbol: string;
  name: string;
  weight: number;
  sector?: string;
  region?: string;
}

export interface AssetExposureItem {
  dimension: string;
  name: string;
  value: number;
}

export interface AssetBase {
  id: string;
  symbol: string;
  name: string;
  assetType: AssetType;
  market: string;
  currency: string;
  tags: string[];
  description: string;
  updatedAt: string;
  metrics?: Record<string, unknown>;
  riskLevel?: string;
  liquidityLevel?: string;
}

export interface ETFProfile {
  trackingIndex: string;
  fundCompany: string;
  aum: number;
  expenseRatio: number;
  trackingError: number;
  liquidityScore: number;
  premiumDiscount: number;
  holdings: AssetHolding[];
  exposures: AssetExposureItem[];
}

export interface FundProfile {
  fundManager: string;
  fundCompany: string;
  fundType: string;
  nav: number;
  aum: number;
  expenseRatio: number;
  holdings: AssetHolding[];
  styleExposure: AssetExposureItem[];
  drawdown: number;
}

export interface FuturesTermNode {
  contract: string;
  maturityDate: string;
  annualizedBasis: number;
}

export interface FuturesProfile {
  exchange: string;
  contractCode: string;
  underlying: string;
  mainContract: string;
  openInterest: number;
  volume: number;
  basis: number;
  termStructure: FuturesTermNode[];
  inventoryNote: string;
}

export interface IndexConstituent {
  symbol: string;
  name: string;
  weight: number;
}

export interface IndexProfile {
  provider: string;
  constituents: IndexConstituent[];
  sectorExposure: AssetExposureItem[];
  styleExposure: AssetExposureItem[];
}

export interface ETFAsset extends AssetBase {
  assetType: "ETF";
  profile: ETFProfile;
}

export interface FundAsset extends AssetBase {
  assetType: "FUND";
  profile: FundProfile;
}

export interface FuturesAsset extends AssetBase {
  assetType: "FUTURE";
  profile: FuturesProfile;
}

export interface IndexAsset extends AssetBase {
  assetType: "INDEX";
  profile: IndexProfile;
}

export type Asset = ETFAsset | FundAsset | FuturesAsset | IndexAsset;
