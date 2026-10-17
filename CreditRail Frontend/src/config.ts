export const chainConfig = {
  id: 677,
  hexId: '0x2a5',
  name: 'BOT Chain',
  nativeCurrency: { name: 'BOT', symbol: 'BOT', decimals: 18 },
  rpcUrl: 'https://rpc.botchain.ai',
  explorerUrl: 'https://scan.botchain.ai',
  officialLinks: {
    botchain: 'https://www.botchain.ai',
    botscan: 'https://scan.botchain.ai',
    devDocs: 'https://dev-docs.botchain.ai'
  }
} as const;

export type WalletState = {
  address: string | null;
  chainId: string | null;
  error: string | null;
  connecting: boolean;
};

import { ethers } from 'ethers';

// CreditRail Deployed Mainnet / Verification Config
// Populated with verified on-chain deployment addresses (checksummed)
export const protocolConfig = {
  vaultAddress: '0x1c80fEE5AB55b07349b9c0A8E6376e496970C2D8',
  collateralTokenAddress: '0x2082599c9C35918774908110D0627E8B3B468152',
  borrowTokenAddress: '0xaBabc7Ddc03e501d190C676BF3d92ef0e6e87a3C',
  priceFeedAddress: '0x265c1Fd8B34CA72D37A7b216fC52FB0dcdC29f33',
  collateralSymbol: 'stBOT',
  borrowSymbol: 'USDT',
  collateralDecimals: 18,
  borrowDecimals: 6,
};

// Safe BrowserProvider wrapper that suppresses ENS queries on BOT Chain (Chain ID: 677)
export function getSafeBrowserProvider() {
  if (typeof window === 'undefined' || !(window as any).ethereum) {
    throw new Error('No EVM wallet detected');
  }
  const provider = new ethers.BrowserProvider((window as any).ethereum, {
    name: 'BOT Chain',
    chainId: 677
  });
  // Intercept and bypass ENS resolution since BOT Chain does not have an ENS registry
  provider.resolveName = async (name: string) => {
    if (ethers.isAddress(name)) return ethers.getAddress(name);
    return null;
  };
  return provider;
}

export const VAULT_ABI = [
  'function openCreditLine() external',
  'function depositCollateral(uint256 amount) external',
  'function borrow(uint256 amount) external',
  'function redraw(uint256 amount) external',
  'function repay(uint256 amount) external returns (uint256)',
  'function withdrawCollateral(uint256 amount) external',
  'function liquidate(address borrower, uint256 debtToCover) external returns (uint256)',
  'function accrueInterest(address borrower) external',
  'function getPositionOverview(address borrower) external view returns (bool active, uint256 collateralAmount, uint256 principalDebt, uint256 accruedInterestPending, uint256 totalDebt, uint256 availableCredit, uint256 healthFactor, uint256 collateralPrice, uint256 collateralValueInBorrowAsset)',
  'function getProtocolMetrics() external view returns (uint256 _totalDepositedCollateral, uint256 _totalPrincipalDebt, uint256 _totalAccruedInterest, uint256 _totalLendingLiquidity, uint256 _accumulatedFees, bool _paused)',
  'function maxLTVBps() external view returns (uint16)',
  'function liquidationThresholdBps() external view returns (uint16)',
  'function borrowRateBps() external view returns (uint16)',
  'function originationFeeBps() external view returns (uint16)',
  'function paused() external view returns (bool)',
  'event CreditLineOpened(address indexed borrower)',
  'event CollateralDeposited(address indexed borrower, uint256 amount, uint256 totalCollateral)',
  'event CollateralWithdrawn(address indexed borrower, uint256 amount, uint256 remainingCollateral)',
  'event Borrowed(address indexed borrower, uint256 amount, uint256 originationFee, uint256 newPrincipalDebt)',
  'event Repaid(address indexed borrower, uint256 interestPaid, uint256 principalPaid, uint256 newPrincipalDebt, uint256 newAccruedInterest)',
  'event Redrawn(address indexed borrower, uint256 amount, uint256 newPrincipalDebt)',
  'event Liquidated(address indexed borrower, address indexed liquidator, uint256 debtCovered, uint256 collateralSeized)'
] as const;

export const ERC20_ABI = [
  'function name() external view returns (string)',
  'function symbol() external view returns (string)',
  'function decimals() external view returns (uint8)',
  'function totalSupply() external view returns (uint256)',
  'function balanceOf(address account) external view returns (uint256)',
  'function allowance(address owner, address spender) external view returns (uint256)',
  'function approve(address spender, uint256 amount) external returns (bool)',
  'function transfer(address recipient, uint256 amount) external returns (bool)',
  'function transferFrom(address sender, address recipient, uint256 amount) external returns (bool)',
  'function mint(address to, uint256 amount) external'
] as const;
