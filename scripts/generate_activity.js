const fs = require('fs');
const path = require('path');
const https = require('https');
const { ethers } = require('ethers');
require('dotenv').config();

function rpcCall(method, params = [], retries = 3) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify({
      jsonrpc: '2.0',
      method,
      params,
      id: Date.now()
    });

    function attempt(remaining) {
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
              reject(new Error(`RPC Error: ${json.error.message || JSON.stringify(json.error)}`));
            } else {
              resolve(json.result);
            }
          } catch (e) {
            if (remaining > 0) setTimeout(() => attempt(remaining - 1), 1000);
            else reject(new Error(`Failed to parse RPC response: ${data}`));
          }
        });
      });

      req.on('error', (err) => {
        if (remaining > 0) setTimeout(() => attempt(remaining - 1), 1500);
        else reject(err);
      });

      req.on('timeout', () => {
        req.destroy();
        if (remaining > 0) setTimeout(() => attempt(remaining - 1), 1500);
        else reject(new Error('RPC Request Timeout'));
      });

      req.write(postData);
      req.end();
    }

    attempt(retries);
  });
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function waitForReceipt(txHash, maxAttempts = 30) {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const receipt = await rpcCall('eth_getTransactionReceipt', [txHash]);
    if (receipt && receipt.blockNumber) {
      if (receipt.status !== '0x1') {
        throw new Error(`Transaction ${txHash} reverted on-chain!`);
      }
      return receipt;
    }
    await sleep(2000);
  }
  throw new Error(`Transaction ${txHash} not mined after timeout`);
}

async function sendTx(wallet, to, data = '0x', value = 0n, gasLimit = 150000n) {
  const chainId = 677;
  const nonceHex = await rpcCall('eth_getTransactionCount', [wallet.address, 'latest']);
  const nonce = parseInt(nonceHex, 16);

  const gasPriceHex = await rpcCall('eth_gasPrice', []);
  const gasPrice = BigInt(gasPriceHex);
  const bufferedGasPrice = (gasPrice * 110n) / 100n; // 10% buffer

  const tx = {
    to,
    nonce,
    gasLimit,
    gasPrice: bufferedGasPrice,
    data,
    value,
    chainId
  };

  const signedTx = await wallet.signTransaction(tx);
  const txHash = await rpcCall('eth_sendRawTransaction', [signedTx]);
  const receipt = await waitForReceipt(txHash);
  return { txHash, receipt };
}

async function main() {
  const chainId = 677;
  const deployerKey = process.env.DEPLOYER_PRIVATE_KEY;
  if (!deployerKey) throw new Error('DEPLOYER_PRIVATE_KEY missing from .env');

  const deployer = new ethers.Wallet(deployerKey);
  const vaultAddress = ethers.getAddress(process.env.CREDIT_RAIL_VAULT_ADDRESS || '0x1c80fEE5AB55b07349b9c0A8E6376e496970C2D8');
  const colAddress = ethers.getAddress(process.env.COLLATERAL_TOKEN_ADDRESS || '0x2082599c9C35918774908110D0627E8B3B468152');

  console.log('===========================================================');
  console.log('CreditRail 6-Wallet Activity Generator (BOT Chain Mainnet)');
  console.log('===========================================================');
  console.log('Network:                 BOT Chain Mainnet (Chain ID 677)');
  console.log('Deployer Address:        ', deployer.address);
  console.log('CreditRailVault Address: ', vaultAddress);
  console.log('stBOT Collateral Token:  ', colAddress);

  const deployerBalHex = await rpcCall('eth_getBalance', [deployer.address, 'latest']);
  const deployerBal = BigInt(deployerBalHex);
  console.log('Deployer Native Balance: ', ethers.formatEther(deployerBal), 'BOT');

  // Interfaces
  const vaultArtifact = require(path.resolve(__dirname, '..', 'artifacts', 'CreditRailVault.json'));
  const vaultIface = new ethers.Interface(vaultArtifact.abi);

  const erc20Iface = new ethers.Interface([
    'function mint(address to, uint256 amount) external',
    'function approve(address spender, uint256 amount) external returns (bool)',
    'function balanceOf(address account) external view returns (uint256)'
  ]);

  // 1. Generate 6 unique wallets
  console.log('\n--- Step 1: Generating 6 Unique Wallets ---');
  const wallets = [];
  const walletData = [];
  for (let i = 0; i < 6; i++) {
    const w = ethers.Wallet.createRandom();
    wallets.push(w);
    walletData.push({
      index: i + 1,
      address: w.address,
      privateKey: w.privateKey
    });
    console.log(`Wallet #${i + 1}: ${w.address}`);
  }

  // Save to scratch
  const scratchDir = path.resolve(__dirname, '..', 'scratch');
  if (!fs.existsSync(scratchDir)) fs.mkdirSync(scratchDir, { recursive: true });
  fs.writeFileSync(
    path.join(scratchDir, 'generated_wallets.json'),
    JSON.stringify(walletData, null, 2)
  );
  console.log('✔ Saved 6 wallet credentials to scratch/generated_wallets.json');

  // 2. Fund each wallet with native BOT for gas (0.0065 BOT each)
  const fundAmount = ethers.parseEther('0.0065');
  console.log(`\n--- Step 2: Funding 6 Wallets with Native BOT (${ethers.formatEther(fundAmount)} BOT each) ---`);
  for (let i = 0; i < wallets.length; i++) {
    const w = wallets[i];
    console.log(`Funding Wallet #${i + 1} (${w.address})...`);
    const res = await sendTx(deployer, w.address, '0x', fundAmount, 25000n);
    console.log(`  ✔ Confirmed in block ${parseInt(res.receipt.blockNumber, 16)} (tx: ${res.txHash})`);
    await sleep(500);
  }

  // 3. Fund each wallet with 10 stBOT collateral tokens
  console.log('\n--- Step 3: Minting 10 stBOT Collateral to each Wallet ---');
  for (let i = 0; i < wallets.length; i++) {
    const w = wallets[i];
    console.log(`Minting 10 stBOT to Wallet #${i + 1} (${w.address})...`);
    const mintData = erc20Iface.encodeFunctionData('mint', [w.address, ethers.parseUnits('10', 18)]);
    const res = await sendTx(deployer, colAddress, mintData, 0n, 75000n);
    console.log(`  ✔ Confirmed in block ${parseInt(res.receipt.blockNumber, 16)} (tx: ${res.txHash})`);
    await sleep(500);
  }

  // 4. Each wallet executes:
  //    - approve CreditRailVault
  //    - Tx 1 on Vault: depositCollateral(2 stBOT)
  //    - Tx 2 on Vault: withdrawCollateral(0.5 stBOT)
  console.log('\n--- Step 4: Producing 12 On-Chain Transactions on CreditRailVault Contract ---');
  const vaultTransactions = [];

  for (let i = 0; i < wallets.length; i++) {
    const w = wallets[i];
    console.log(`\n======================================================`);
    console.log(`Executing Transactions for Wallet #${i + 1} (${w.address})`);
    console.log(`======================================================`);

    // A. Approve Vault
    console.log(`[Wallet #${i + 1}] Approving CreditRailVault for stBOT...`);
    const appData = erc20Iface.encodeFunctionData('approve', [vaultAddress, ethers.MaxUint256]);
    const appRes = await sendTx(w, colAddress, appData, 0n, 60000n);
    console.log(`  ✔ Approved in block ${parseInt(appRes.receipt.blockNumber, 16)} (tx: ${appRes.txHash})`);
    await sleep(500);

    // B. Vault Transaction 1: depositCollateral(2 stBOT)
    const depAmt = ethers.parseUnits('2', 18);
    console.log(`[Wallet #${i + 1}] TX #1 on Vault: depositCollateral(2.0 stBOT)...`);
    const depData = vaultIface.encodeFunctionData('depositCollateral', [depAmt]);
    const depRes = await sendTx(w, vaultAddress, depData, 0n, 160000n);
    const depBlock = parseInt(depRes.receipt.blockNumber, 16);
    console.log(`  ✔ TX 1 Confirmed in block ${depBlock}! (tx: ${depRes.txHash})`);
    vaultTransactions.push({
      txNumber: vaultTransactions.length + 1,
      walletIndex: i + 1,
      walletAddress: w.address,
      action: 'depositCollateral',
      amount: '2.0 stBOT',
      txHash: depRes.txHash,
      blockNumber: depBlock,
      explorerUrl: `https://scan.botchain.ai/tx/${depRes.txHash}`
    });
    await sleep(500);

    // C. Vault Transaction 2: withdrawCollateral(0.5 stBOT)
    const withAmt = ethers.parseUnits('0.5', 18);
    console.log(`[Wallet #${i + 1}] TX #2 on Vault: withdrawCollateral(0.5 stBOT)...`);
    const withData = vaultIface.encodeFunctionData('withdrawCollateral', [withAmt]);
    const withRes = await sendTx(w, vaultAddress, withData, 0n, 120000n);
    const withBlock = parseInt(withRes.receipt.blockNumber, 16);
    console.log(`  ✔ TX 2 Confirmed in block ${withBlock}! (tx: ${withRes.txHash})`);
    vaultTransactions.push({
      txNumber: vaultTransactions.length + 1,
      walletIndex: i + 1,
      walletAddress: w.address,
      action: 'withdrawCollateral',
      amount: '0.5 stBOT',
      txHash: withRes.txHash,
      blockNumber: withBlock,
      explorerUrl: `https://scan.botchain.ai/tx/${withRes.txHash}`
    });
    await sleep(500);
  }

  // 5. Final Protocol Metrics Check
  console.log('\n--- Step 5: Final On-Chain Protocol Verification ---');
  const metricsData = vaultIface.encodeFunctionData('getProtocolMetrics');
  const metricsHex = await rpcCall('eth_call', [{ to: vaultAddress, data: metricsData }, 'latest']);
  const metrics = vaultIface.decodeFunctionResult('getProtocolMetrics', metricsHex);

  console.log('Total Deposited Collateral in Vault: ', ethers.formatUnits(metrics[0], 18), 'stBOT');
  console.log('Total Active Principal Debt:         ', ethers.formatUnits(metrics[1], 6), 'USDT');
  console.log('Vault Protocol Paused:               ', metrics[5]);

  const deployerFinalBalHex = await rpcCall('eth_getBalance', [deployer.address, 'latest']);
  console.log('Deployer Final Remaining Balance:    ', ethers.formatEther(BigInt(deployerFinalBalHex)), 'BOT');

  // Save audit log
  const auditReport = {
    targetContract: vaultAddress,
    totalTransactionsOnVault: vaultTransactions.length,
    walletsCreated: wallets.length,
    wallets: walletData.map(w => w.address),
    transactions: vaultTransactions,
    timestamp: new Date().toISOString()
  };
  fs.writeFileSync(
    path.join(scratchDir, 'vault_12_transactions.json'),
    JSON.stringify(auditReport, null, 2)
  );

  console.log('\n===========================================================');
  console.log(`SUCCESS: Completed all ${vaultTransactions.length} transactions directly on CreditRailVault!`);
  console.log('Audit log saved to scratch/vault_12_transactions.json');
  console.log('===========================================================');
}

main().catch(err => {
  console.error('\nFATAL ERROR in generate_activity:', err);
  process.exit(1);
});
