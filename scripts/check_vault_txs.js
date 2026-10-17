const path = require('path');
const https = require('https');
const { ethers } = require('ethers');

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
      res.on('data', c => data += c);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json.error) reject(new Error(json.error.message || JSON.stringify(json.error)));
          else resolve(json.result);
        } catch (e) {
          reject(e);
        }
      });
    });
    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

async function checkState() {
  const vaultAddress = '0x1c80fEE5AB55b07349b9c0A8E6376e496970C2D8';
  const colAddress = '0x2082599c9C35918774908110D0627E8B3B468152';

  console.log('--- Checking BOT Chain Mainnet State ---');
  const currentBlockHex = await rpcCall('eth_blockNumber');
  const currentBlock = parseInt(currentBlockHex, 16);
  console.log('Current Block Number:', currentBlock);

  const vaultArtifact = require(path.resolve(__dirname, '..', 'artifacts', 'CreditRailVault.json'));
  const iface = new ethers.Interface(vaultArtifact.abi);

  // Read totalDepositedCollateral via interface
  try {
    const data = iface.encodeFunctionData('totalDepositedCollateral');
    const res = await rpcCall('eth_call', [{ to: vaultAddress, data }, 'latest']);
    const decoded = iface.decodeFunctionResult('totalDepositedCollateral', res);
    console.log('totalDepositedCollateral:', ethers.formatUnits(decoded[0], 18), 'stBOT');
  } catch (err) {
    console.log('Error reading totalDepositedCollateral:', err.message);
  }

  // Read getProtocolMetrics
  try {
    const data = iface.encodeFunctionData('getProtocolMetrics');
    const res = await rpcCall('eth_call', [{ to: vaultAddress, data }, 'latest']);
    const decoded = iface.decodeFunctionResult('getProtocolMetrics', res);
    console.log('Protocol Metrics:');
    console.log('  Total Deposited Collateral:', ethers.formatUnits(decoded[0], 18), 'stBOT');
    console.log('  Total Principal Debt:', ethers.formatUnits(decoded[1], 6), 'USDT');
    console.log('  Total Accrued Interest:', ethers.formatUnits(decoded[2], 6), 'USDT');
    console.log('  Total Lending Liquidity:', ethers.formatUnits(decoded[3], 6), 'USDT');
    console.log('  Paused:', decoded[5]);
  } catch (err) {
    console.log('Error reading getProtocolMetrics:', err.message);
  }

  // Check stBOT balance of vault
  const erc20Abi = [
    'function balanceOf(address) view returns (uint256)',
    'function totalSupply() view returns (uint256)',
    'function symbol() view returns (string)'
  ];
  const erc20Iface = new ethers.Interface(erc20Abi);
  try {
    const res = await rpcCall('eth_call', [{
      to: colAddress,
      data: erc20Iface.encodeFunctionData('balanceOf', [vaultAddress])
    }, 'latest']);
    const [bal] = erc20Iface.decodeFunctionResult('balanceOf', res);
    console.log('stBOT held by Vault Contract:', ethers.formatUnits(bal, 18), 'stBOT');
  } catch (err) {
    console.log('Error reading vault stBOT balance:', err.message);
  }

  // Check stBOT total supply
  try {
    const res = await rpcCall('eth_call', [{
      to: colAddress,
      data: erc20Iface.encodeFunctionData('totalSupply')
    }, 'latest']);
    const [sup] = erc20Iface.decodeFunctionResult('totalSupply', res);
    console.log('stBOT Total Supply:', ethers.formatUnits(sup, 18), 'stBOT');
  } catch (err) {
    console.log('Error reading stBOT total supply:', err.message);
  }

  // Query on-chain logs for Vault (CollateralDeposited, etc.)
  console.log('\n--- Checking On-Chain Logs on Vault ---');
  try {
    const fromBlock = '0x' + (26871580).toString(16);
    const logs = await rpcCall('eth_getLogs', [{
      fromBlock,
      toBlock: 'latest',
      address: vaultAddress
    }]);
    console.log(`Found ${logs.length} on-chain logs emitted by Vault:`);
    for (const log of logs) {
      try {
        const parsed = iface.parseLog(log);
        console.log(`  Event: ${parsed.name} in block ${parseInt(log.blockNumber, 16)} tx: ${log.transactionHash}`);
        console.log('    Args:', parsed.args);
      } catch (e) {
        console.log(`  Raw log in block ${parseInt(log.blockNumber, 16)} tx: ${log.transactionHash}`);
      }
    }
  } catch (err) {
    console.log('Error fetching vault logs:', err.message);
  }

  // Query on-chain logs for stBOT (Transfers & Approvals)
  console.log('\n--- Checking On-Chain Logs on stBOT Collateral Token ---');
  try {
    const fromBlock = '0x' + (26871580).toString(16);
    const colLogs = await rpcCall('eth_getLogs', [{
      fromBlock,
      toBlock: 'latest',
      address: colAddress
    }]);
    console.log(`Found ${colLogs.length} on-chain logs on stBOT Token:`);
    const stBotIface = new ethers.Interface([
      'event Transfer(address indexed from, address indexed to, uint256 value)',
      'event Approval(address indexed owner, address indexed spender, uint256 value)'
    ]);
    for (const log of colLogs) {
      try {
        const parsed = stBotIface.parseLog(log);
        console.log(`  stBOT Event: ${parsed.name} in block ${parseInt(log.blockNumber, 16)} tx: ${log.transactionHash}`);
        console.log('    Args:', parsed.args);
      } catch (e) {
        console.log(`  Raw log in tx: ${log.transactionHash}:`, e.message);
      }
    }
  } catch (err) {
    console.log('Error fetching stBOT logs:', err.message);
  }
}

checkState().catch(console.error);
