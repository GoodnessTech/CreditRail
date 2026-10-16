const fs = require('fs');
const path = require('path');
const https = require('https');
const { ethers } = require('ethers');
require('dotenv').config();

function rawRpc(method, params) {
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
      res.on('data', c => data += c);
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

class ReliableBotchainProvider extends ethers.AbstractProvider {
  constructor() {
    super(ethers.Network.from({ name: 'botchain', chainId: 677 }));
  }

  async _send(payload) {
    if (Array.isArray(payload)) {
      return Promise.all(payload.map(p => this._send(p)));
    }
    const result = await rawRpc(payload.method, payload.params || []);
    return { id: payload.id, result };
  }

  async send(method, params) {
    return rawRpc(method, params);
  }
}

async function main() {
  console.log('Testing rawRpc vs ReliableBotchainProvider...');
  const t0 = Date.now();
  const chainId = await rawRpc('eth_chainId', []);
  console.log(`Raw RPC Chain ID: ${parseInt(chainId, 16)} (${Date.now() - t0}ms)`);

  const provider = new ReliableBotchainProvider();
  const wallet = new ethers.Wallet(process.env.DEPLOYER_PRIVATE_KEY, provider);
  console.log('Deployer Address:', wallet.address);

  const balance = await wallet.provider.getBalance(wallet.address);
  console.log('Deployer Balance via Provider:', ethers.formatEther(balance), 'BOT');

  const nonce = await wallet.getNonce();
  console.log('Deployer Nonce via Provider:', nonce);
}

main().catch(console.error);
