const fs = require('fs');
const path = require('path');
const https = require('https');
const { ethers } = require('ethers');
require('dotenv').config();

// Direct, reliable RPC caller with explicit timeout and error handling
function rpcCall(method, params = []) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify({
      jsonrpc: '2.0',
      method,
      params,
      id: Date.now()
    });
    const req = https.request({
      hostname: 'rpc.botchain.ai',
      port: 443,
      path: '/',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      },
      timeout: 15000
    }, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json.error) {
            reject(new Error(`RPC Error [${json.error.code}]: ${json.error.message}`));
          } else {
            resolve(json.result);
          }
        } catch (e) {
          reject(new Error(`Failed to parse RPC response: ${data}`));
        }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('RPC Request Timeout'));
    });
    req.write(postData);
    req.end();
  });
}

// Sleep helper
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Wait for transaction receipt
async function waitForReceipt(txHash, maxAttempts = 30) {
  console.log(`Polling receipt for tx: ${txHash}...`);
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const receipt = await rpcCall('eth_getTransactionReceipt', [txHash]);
    if (receipt && receipt.blockNumber) {
      const status = receipt.status === '0x1' ? 'SUCCESS' : 'REVERTED';
      console.log(`Transaction mined in block ${parseInt(receipt.blockNumber, 16)}! Status: ${status}`);
      if (receipt.status !== '0x1') {
        throw new Error(`Transaction ${txHash} reverted on-chain!`);
      }
      return receipt;
    }
    await sleep(2500);
  }
  throw new Error(`Transaction ${txHash} not mined after ${maxAttempts * 2.5}s`);
}

// Send signed transaction
async function sendTransaction(wallet, txData) {
  const chainId = 677;
  const nonceHex = await rpcCall('eth_getTransactionCount', [wallet.address, 'latest']);
  const nonce = parseInt(nonceHex, 16);

  const gasPriceHex = await rpcCall('eth_gasPrice', []);
  const gasPrice = BigInt(gasPriceHex);
  // Add 10% gas price buffer to ensure fast inclusion
  const bufferedGasPrice = (gasPrice * 110n) / 100n;

  // Estimate gas
  let gasLimit;
  try {
    const estGasHex = await rpcCall('eth_estimateGas', [{
      from: wallet.address,
      data: txData
    }]);
    gasLimit = (BigInt(estGasHex) * 120n) / 100n; // 20% buffer
  } catch (err) {
    console.warn('eth_estimateGas fallback applied:', err.message);
    gasLimit = 2500000n;
  }

  const tx = {
    to: null,
    nonce,
    gasLimit,
    gasPrice: bufferedGasPrice,
    data: txData,
    value: 0n,
    chainId
  };

  const signedTx = await wallet.signTransaction(tx);
  const txHash = await rpcCall('eth_sendRawTransaction', [signedTx]);
  console.log(`Transaction submitted: ${txHash}`);
  const receipt = await waitForReceipt(txHash);
  return { txHash, receipt };
}

async function main() {
  console.log('============================================================');
  console.log('CREDITRAIL — BOT CHAIN MAINNET DEPLOYMENT OPERATOR');
  console.log('Chain ID: 677 | RPC: https://rpc.botchain.ai');
  console.log('============================================================\n');

  // Read private key safely from .env
  const envContent = fs.readFileSync('.env', 'utf8');
  const match = envContent.match(/DEPLOYER_PRIVATE_KEY\s*=\s*([a-fA-F0-9x]+)/);
  if (!match) throw new Error('DEPLOYER_PRIVATE_KEY not found in .env');
  const privKey = match[1].trim();

  const wallet = new ethers.Wallet(privKey);
  console.log('Deployer Address:', wallet.address);

  // Check balance
  const balanceHex = await rpcCall('eth_getBalance', [wallet.address, 'latest']);
  const balanceWei = BigInt(balanceHex);
  const balanceBOT = Number(balanceWei) / 1e18;
  console.log(`Deployer Balance: ${balanceBOT.toFixed(4)} BOT`);

  if (balanceWei < 20000000000000000n) { // 0.02 BOT
    throw new Error('Insufficient BOT balance for deployment!');
  }

  // Load compiled artifacts
  const artifactsDir = path.resolve(__dirname, '..', 'artifacts');
  const vaultArtifact = JSON.parse(fs.readFileSync(path.join(artifactsDir, 'CreditRailVault.json'), 'utf8'));
  const mockPriceFeedArtifact = JSON.parse(fs.readFileSync(path.join(artifactsDir, 'MockPriceFeed.json'), 'utf8'));
  const mockERC20Artifact = JSON.parse(fs.readFileSync(path.join(artifactsDir, 'MockERC20.json'), 'utf8'));

  const deployedRecords = {};

  // 1. Deploy Collateral Token (CreditRail Staked Collateral: "stBOT", 18 decimals)
  console.log('\n--- Step 1: Deploying Collateral Token (stBOT) ---');
  const erc20Factory = new ethers.ContractFactory(mockERC20Artifact.abi, mockERC20Artifact.bytecode);
  const initialCollateralSupply = ethers.parseUnits('1000000', 18); // 1,000,000 stBOT
  const erc20DeployData = await erc20Factory.getDeployTransaction(
    'CreditRail Staked Collateral',
    'stBOT',
    18,
    initialCollateralSupply,
    wallet.address
  );
  const colTx = await sendTransaction(wallet, erc20DeployData.data);
  const colAddress = colTx.receipt.contractAddress;
  console.log(`✔ Collateral Token (stBOT) deployed at: ${colAddress}`);
  console.log(`  Tx: ${colTx.txHash}`);
  console.log(`  Gas Used: ${parseInt(colTx.receipt.gasUsed, 16)}`);
  deployedRecords.collateralToken = {
    address: colAddress,
    name: 'CreditRail Staked Collateral',
    symbol: 'stBOT',
    decimals: 18,
    initialSupply: '1,000,000 stBOT',
    txHash: colTx.txHash,
    blockNumber: parseInt(colTx.receipt.blockNumber, 16),
    gasUsed: parseInt(colTx.receipt.gasUsed, 16)
  };

  // 2. Deploy Chainlink-compatible Price Feed ($2,000.00000000, 8 decimals)
  console.log('\n--- Step 2: Deploying Chainlink-Compatible Price Feed ($2,000/stBOT) ---');
  const feedFactory = new ethers.ContractFactory(mockPriceFeedArtifact.abi, mockPriceFeedArtifact.bytecode);
  const initialPrice = 200000000000n; // $2,000.00000000 (8 decimals)
  const feedDeployData = await feedFactory.getDeployTransaction('stBOT / USD', 8, initialPrice);
  const feedTx = await sendTransaction(wallet, feedDeployData.data);
  const feedAddress = feedTx.receipt.contractAddress;
  console.log(`✔ Price Feed deployed at: ${feedAddress}`);
  console.log(`  Tx: ${feedTx.txHash}`);
  console.log(`  Gas Used: ${parseInt(feedTx.receipt.gasUsed, 16)}`);
  deployedRecords.priceFeed = {
    address: feedAddress,
    description: 'stBOT / USD',
    decimals: 8,
    initialPrice: '$2,000.00',
    txHash: feedTx.txHash,
    blockNumber: parseInt(feedTx.receipt.blockNumber, 16),
    gasUsed: parseInt(feedTx.receipt.gasUsed, 16)
  };

  // 3. Deploy CreditRailVault
  // Verified USDT on BOT Chain: 0xaBabc7Ddc03e501d190C676BF3d92ef0e6e87a3C
  const borrowTokenAddress = '0xaBabc7Ddc03e501d190C676BF3d92ef0e6e87a3C';
  console.log('\n--- Step 3: Deploying CreditRailVault ---');
  console.log(`- Collateral Token: ${colAddress} (stBOT)`);
  console.log(`- Borrow Token:     ${borrowTokenAddress} (USDT)`);
  console.log(`- Price Feed:       ${feedAddress}`);
  console.log('- Max LTV:          75.00% (7500 bps)');
  console.log('- Liq. Threshold:   80.00% (8000 bps)');
  console.log('- Liq. Bonus:       5.00% (500 bps)');
  console.log('- Borrow Rate:      8.00% APR (800 bps)');
  console.log('- Origination Fee:  0.50% (50 bps)');
  console.log('- Max Staleness:    86400s (24h)');

  const vaultFactory = new ethers.ContractFactory(vaultArtifact.abi, vaultArtifact.bytecode);
  const vaultDeployData = await vaultFactory.getDeployTransaction(
    colAddress,
    borrowTokenAddress,
    feedAddress,
    7500, // maxLTVBps
    8000, // liquidationThresholdBps
    500,  // liquidationBonusBps
    800,  // borrowRateBps
    50,   // originationFeeBps
    86400 // maxPriceStaleness
  );

  const vaultTx = await sendTransaction(wallet, vaultDeployData.data);
  const vaultAddress = vaultTx.receipt.contractAddress;
  console.log(`\n============================================================`);
  console.log(`✔ CreditRailVault DEPLOYED SUCCESSFULLY!`);
  console.log(`Contract Address: ${vaultAddress}`);
  console.log(`Tx Hash:          ${vaultTx.txHash}`);
  console.log(`Block Number:     ${parseInt(vaultTx.receipt.blockNumber, 16)}`);
  console.log(`Gas Used:         ${parseInt(vaultTx.receipt.gasUsed, 16)}`);
  console.log(`Explorer URL:     https://scan.botchain.ai/address/${vaultAddress}`);
  console.log(`Tx Explorer:      https://scan.botchain.ai/tx/${vaultTx.txHash}`);
  console.log(`============================================================\n`);

  deployedRecords.creditRailVault = {
    address: vaultAddress,
    collateralToken: colAddress,
    borrowToken: borrowTokenAddress,
    priceFeed: feedAddress,
    txHash: vaultTx.txHash,
    blockNumber: parseInt(vaultTx.receipt.blockNumber, 16),
    gasUsed: parseInt(vaultTx.receipt.gasUsed, 16),
    network: 'BOT Chain Mainnet (Chain ID 677)',
    explorerUrl: `https://scan.botchain.ai/address/${vaultAddress}`,
    txUrl: `https://scan.botchain.ai/tx/${vaultTx.txHash}`,
    deployedAt: new Date().toISOString()
  };

  // Write deployment manifest to scratch and artifacts
  const manifestPath = path.resolve(__dirname, '..', 'scratch', 'deployment_manifest.json');
  fs.writeFileSync(manifestPath, JSON.stringify(deployedRecords, null, 2));
  console.log(`Deployment manifest written to ${manifestPath}`);

  return deployedRecords;
}

if (require.main === module) {
  main().catch((err) => {
    console.error('\n❌ DEPLOYMENT FAILED:', err.message);
    process.exit(1);
  });
}

module.exports = { main, rpcCall };
