const fs = require('fs');
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
      timeout: 10000
    }, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json.error) reject(new Error(json.error.message));
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

async function verify() {
  const manifest = JSON.parse(fs.readFileSync(path.resolve(__dirname, '..', 'scratch', 'deployment_manifest.json'), 'utf8'));
  const vaultAddress = manifest.creditRailVault.address;
  console.log('Verifying Deployed Vault at:', vaultAddress);

  // Check code exists
  const code = await rpcCall('eth_getCode', [vaultAddress, 'latest']);
  console.log(`Bytecode length: ${(code.length - 2) / 2} bytes`);

  const vaultArtifact = JSON.parse(fs.readFileSync(path.resolve(__dirname, '..', 'artifacts', 'CreditRailVault.json'), 'utf8'));
  const iface = new ethers.Interface(vaultArtifact.abi);

  // Call owner()
  const ownerCall = iface.encodeFunctionData('owner');
  const ownerHex = await rpcCall('eth_call', [{ to: vaultAddress, data: ownerCall }, 'latest']);
  const [owner] = iface.decodeFunctionResult('owner', ownerHex);
  console.log('✔ Protocol Owner:', owner);

  // Call collateralToken()
  const colCall = iface.encodeFunctionData('collateralToken');
  const colHex = await rpcCall('eth_call', [{ to: vaultAddress, data: colCall }, 'latest']);
  const [colToken] = iface.decodeFunctionResult('collateralToken', colHex);
  console.log('✔ Collateral Token:', colToken);

  // Call borrowToken()
  const borrowCall = iface.encodeFunctionData('borrowToken');
  const borrowHex = await rpcCall('eth_call', [{ to: vaultAddress, data: borrowCall }, 'latest']);
  const [borrowToken] = iface.decodeFunctionResult('borrowToken', borrowHex);
  console.log('✔ Borrow Token:', borrowToken);

  // Call priceFeed()
  const pfCall = iface.encodeFunctionData('priceFeed');
  const pfHex = await rpcCall('eth_call', [{ to: vaultAddress, data: pfCall }, 'latest']);
  const [priceFeed] = iface.decodeFunctionResult('priceFeed', pfHex);
  console.log('✔ Price Feed:', priceFeed);

  // Call maxLTVBps()
  const ltvCall = iface.encodeFunctionData('maxLTVBps');
  const ltvHex = await rpcCall('eth_call', [{ to: vaultAddress, data: ltvCall }, 'latest']);
  const [maxLTV] = iface.decodeFunctionResult('maxLTVBps', ltvHex);
  console.log('✔ Max LTV (bps):', maxLTV.toString(), `(${Number(maxLTV) / 100}%)`);

  // Call liquidationThresholdBps()
  const ltCall = iface.encodeFunctionData('liquidationThresholdBps');
  const ltHex = await rpcCall('eth_call', [{ to: vaultAddress, data: ltCall }, 'latest']);
  const [liqThreshold] = iface.decodeFunctionResult('liquidationThresholdBps', ltHex);
  console.log('✔ Liquidation Threshold (bps):', liqThreshold.toString(), `(${Number(liqThreshold) / 100}%)`);

  // Call borrowRateBps()
  const brCall = iface.encodeFunctionData('borrowRateBps');
  const brHex = await rpcCall('eth_call', [{ to: vaultAddress, data: brCall }, 'latest']);
  const [borrowRate] = iface.decodeFunctionResult('borrowRateBps', brHex);
  console.log('✔ Borrow Rate (bps):', borrowRate.toString(), `(${Number(borrowRate) / 100}% APR)`);

  // Call originationFeeBps()
  const ofCall = iface.encodeFunctionData('originationFeeBps');
  const ofHex = await rpcCall('eth_call', [{ to: vaultAddress, data: ofCall }, 'latest']);
  const [origFee] = iface.decodeFunctionResult('originationFeeBps', ofHex);
  console.log('✔ Origination Fee (bps):', origFee.toString(), `(${Number(origFee) / 100}%)`);

  // Call getProtocolMetrics()
  const pmCall = iface.encodeFunctionData('getProtocolMetrics');
  const pmHex = await rpcCall('eth_call', [{ to: vaultAddress, data: pmCall }, 'latest']);
  const [totalCol, totalPrincipal, totalInterest, totalLiquidity] = iface.decodeFunctionResult('getProtocolMetrics', pmHex);
  console.log('✔ Total Collateral Deposited:', totalCol.toString());
  console.log('✔ Total Principal Debt:', totalPrincipal.toString());
  console.log('✔ Total Accrued Interest:', totalInterest.toString());
  console.log('✔ Total Lending Liquidity:', totalLiquidity.toString());
}

verify().catch(console.error);
