import { useState, useEffect } from 'react'
import { chainConfig, protocolConfig, VAULT_ABI, ERC20_ABI, type WalletState } from './config'
import { ethers } from 'ethers'

type View = 'overview' | 'credit-lines' | 'markets' | 'activity' | 'documentation'
type ActionTab = 'deposit' | 'borrow' | 'repay' | 'redraw' | 'withdraw'

interface PositionData {
  active: boolean
  collateralAmount: bigint
  principalDebt: bigint
  accruedInterest: bigint
  totalDebt: bigint
  availableCredit: bigint
  healthFactor: bigint
  collateralPrice: bigint
  collateralValue: bigint
}

interface ActivityItem {
  id: string
  type: string
  amount: string
  asset: string
  txHash: string
  timestamp: string
}

function Wallet({
  wallet,
  onConnect,
  onSwitchChain
}: {
  wallet: WalletState
  onConnect: () => void
  onSwitchChain: () => void
}) {
  const isWrongChain = wallet.chainId && wallet.chainId.toLowerCase() !== chainConfig.hexId
  const label = wallet.connecting
    ? 'Connecting…'
    : wallet.address
    ? `${wallet.address.slice(0, 6)}…${wallet.address.slice(-4)}`
    : 'Connect wallet'

  return (
    <div className="wallet-wrap">
      {isWrongChain ? (
        <button className="wallet-button error-chain" onClick={onSwitchChain}>
          <i style={{ background: '#9c5149' }} /> Switch to BOT Chain
        </button>
      ) : (
        <button className="wallet-button" onClick={onConnect} disabled={wallet.connecting}>
          <i className={wallet.address ? 'live' : ''} />
          {label}
          <b>⌄</b>
        </button>
      )}
      {wallet.error && (
        <p className="wallet-error" role="alert">
          {wallet.error}
        </p>
      )}
    </div>
  )
}

function Metric({
  label,
  value,
  subtext
}: {
  label: string
  value?: string
  subtext?: string
}) {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong>{value || '—'}</strong>
      <small>{subtext || 'Not available'}</small>
    </div>
  )
}

function Heading({ eyebrow, title, copy }: { eyebrow: string; title: string; copy: string }) {
  return (
    <div className="heading">
      <label>{eyebrow}</label>
      <h2>{title}</h2>
      <p>{copy}</p>
    </div>
  )
}

function Empty({ title, copy }: { title: string; copy: string }) {
  return (
    <div className="empty">
      <div className="empty-icon">
        <i />
        <i />
      </div>
      <h3>{title}</h3>
      <p>{copy}</p>
    </div>
  )
}

function Position({ position, connected }: { position: PositionData | null; connected: boolean }) {
  let hfDisplay = '—'
  let hfLabel = 'Awaiting position'

  if (connected && position?.active) {
    if (position.totalDebt === 0n) {
      hfDisplay = '∞'
      hfLabel = 'Zero Debt / Secure'
    } else {
      const hfNum = Number(position.healthFactor) / 1e18
      hfDisplay = hfNum.toFixed(2)
      hfLabel = hfNum >= 1.5 ? 'Healthy & Secure' : hfNum >= 1.0 ? 'Moderate Risk' : 'Danger / Liquidatable'
    }
  }

  const colFmt = position?.active
    ? `${ethers.formatUnits(position.collateralAmount, protocolConfig.collateralDecimals)} ${protocolConfig.collateralSymbol}`
    : '—'
  const creditFmt = position?.active
    ? `${ethers.formatUnits(position.availableCredit, protocolConfig.borrowDecimals)} ${protocolConfig.borrowSymbol}`
    : '—'
  const debtFmt = position?.active
    ? `${ethers.formatUnits(position.totalDebt, protocolConfig.borrowDecimals)} ${protocolConfig.borrowSymbol}`
    : '—'

  return (
    <div className="position">
      <div className="micro">
        <span>POSITION / {connected && position?.active ? 'ACTIVE' : '00'}</span>
        <span>{connected ? (position?.active ? 'INITIALIZED' : 'OPEN PENDING') : 'DISCONNECTED'}</span>
      </div>
      <div className="ring">
        <div>
          <span>HEALTH FACTOR</span>
          <strong>{hfDisplay}</strong>
          <small>{hfLabel}</small>
        </div>
      </div>
      <div className="position-values">
        <div>
          <span>COLLATERAL</span>
          <b>{colFmt}</b>
        </div>
        <div>
          <span>AVAILABLE CREDIT</span>
          <b>{creditFmt}</b>
        </div>
        <div>
          <span>OUTSTANDING DEBT</span>
          <b>{debtFmt}</b>
        </div>
      </div>
      <div className="micro">
        <span>REVOLVING CREDIT PROTOCOL</span>
        <span>BOT CHAIN / 677</span>
      </div>
    </div>
  )
}

function CreditLinesConsole({
  connected,
  onConnect,
  position,
  wallet,
  onSuccessTx
}: {
  connected: boolean
  onConnect: () => void
  position: PositionData | null
  wallet: WalletState
  onSuccessTx: (item: ActivityItem) => void
}) {
  const [tab, setTab] = useState<ActionTab>('deposit')
  const [asset, setAsset] = useState(protocolConfig.collateralSymbol)
  const [amount, setAmount] = useState('')
  const [loading, setLoading] = useState(false)
  const [txHash, setTxHash] = useState<string | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  const handleAction = async () => {
    if (!window.ethereum || !wallet.address) return
    if (!protocolConfig.vaultAddress) {
      setErrorMsg('CreditRail Vault contract is not configured for this network.')
      return
    }
    if (!amount || parseFloat(amount) <= 0) {
      setErrorMsg('Please enter a valid positive amount.')
      return
    }

    setLoading(true)
    setErrorMsg(null)
    setTxHash(null)

    try {
      const provider = new ethers.BrowserProvider(window.ethereum)
      const signer = await provider.getSigner()
      const vaultContract = new ethers.Contract(protocolConfig.vaultAddress, VAULT_ABI, signer)
      const colContract = new ethers.Contract(protocolConfig.collateralTokenAddress, ERC20_ABI, signer)
      const borrowContract = new ethers.Contract(protocolConfig.borrowTokenAddress, ERC20_ABI, signer)

      let tx: ethers.ContractTransactionResponse

      if (tab === 'deposit') {
        const parsedAmount = ethers.parseUnits(amount, protocolConfig.collateralDecimals)
        const allowance = await colContract.allowance(wallet.address, protocolConfig.vaultAddress)
        if (allowance < parsedAmount) {
          const approveTx = await colContract.approve(protocolConfig.vaultAddress, ethers.MaxUint256)
          await approveTx.wait()
        }
        tx = await vaultContract.depositCollateral(parsedAmount)
      } else if (tab === 'borrow') {
        const parsedAmount = ethers.parseUnits(amount, protocolConfig.borrowDecimals)
        tx = await vaultContract.borrow(parsedAmount)
      } else if (tab === 'repay') {
        const parsedAmount = ethers.parseUnits(amount, protocolConfig.borrowDecimals)
        const allowance = await borrowContract.allowance(wallet.address, protocolConfig.vaultAddress)
        if (allowance < parsedAmount) {
          const approveTx = await borrowContract.approve(protocolConfig.vaultAddress, ethers.MaxUint256)
          await approveTx.wait()
        }
        tx = await vaultContract.repay(parsedAmount)
      } else if (tab === 'redraw') {
        const parsedAmount = ethers.parseUnits(amount, protocolConfig.borrowDecimals)
        tx = await vaultContract.redraw(parsedAmount)
      } else {
        // withdraw
        const parsedAmount = ethers.parseUnits(amount, protocolConfig.collateralDecimals)
        tx = await vaultContract.withdrawCollateral(parsedAmount)
      }

      setTxHash(tx.hash)
      await tx.wait()

      onSuccessTx({
        id: tx.hash.slice(0, 10),
        type: tab.toUpperCase(),
        amount: `${amount} ${tab === 'deposit' || tab === 'withdraw' ? protocolConfig.collateralSymbol : protocolConfig.borrowSymbol}`,
        asset,
        txHash: tx.hash,
        timestamp: new Date().toLocaleTimeString()
      })
      setAmount('')
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Transaction was not completed.'
      setErrorMsg(msg)
    } finally {
      setLoading(false)
    }
  }

  async function handleMintFaucet() {
    if (!wallet.address || !(window as any).ethereum) {
      setErrorMsg('Please connect your wallet first.')
      return
    }
    setLoading(true)
    setErrorMsg(null)
    setTxHash(null)
    try {
      const provider = new ethers.BrowserProvider((window as any).ethereum)
      const signer = await provider.getSigner()
      const colContract = new ethers.Contract(protocolConfig.collateralTokenAddress, ERC20_ABI, signer)
      const mintAmount = ethers.parseUnits('10', protocolConfig.collateralDecimals)
      const tx = await colContract.mint(wallet.address, mintAmount)
      setTxHash(tx.hash)
      await tx.wait()
      onSuccessTx({
        id: tx.hash.slice(0, 10),
        type: 'FAUCET MINT',
        amount: `10 ${protocolConfig.collateralSymbol}`,
        asset: protocolConfig.collateralSymbol,
        txHash: tx.hash,
        timestamp: new Date().toLocaleTimeString()
      })
      setAmount('10')
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Faucet mint failed.'
      setErrorMsg(msg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <section className="section" id="credit-lines">
      <Heading
        eyebrow="CREDIT LINE WORKFLOW"
        title="A reusable line, built around your collateral."
        copy="Deposit collateral once. Draw, repay, and redraw again within the limits enforced by the protocol."
      />
      <div className="flow">
        <div className="steps">
          {[
            ['01', 'Deposit collateral', 'Deposit an approved asset to establish your revolving borrowing base.'],
            ['02', 'Open the line', 'Review protocol-enforced terms before activating your credit position.'],
            ['03', 'Draw & repay', 'Draw liquidity when needed, repay on your schedule, and restore borrowing capacity.'],
            ['04', 'Redraw', 'Reuse your restored credit without closing or recreating your position.']
          ].map(([n, t, c]) => (
            <div className="step" key={n}>
              <em>{n}</em>
              <div>
                <h3>{t}</h3>
                <p>{c}</p>
              </div>
              <b>↗</b>
            </div>
          ))}
        </div>

        <div className="transaction">
          <div className="micro">
            <span>REVOLVING CONSOLE</span>
            <span>{connected ? 'WALLET CONNECTED' : 'WALLET REQUIRED'}</span>
          </div>

          <div className="action-tabs" style={{ display: 'flex', gap: '6px', margin: '20px 0 14px' }}>
            {(['deposit', 'borrow', 'repay', 'redraw', 'withdraw'] as ActionTab[]).map((action) => (
              <button
                key={action}
                onClick={() => setTab(action)}
                className={`secondary ${tab === action ? 'active-tab' : ''}`}
                style={{
                  padding: '6px 10px',
                  fontSize: '11px',
                  borderRadius: '14px',
                  background: tab === action ? 'var(--ink)' : 'var(--soft)',
                  color: tab === action ? '#fff' : 'var(--ink)',
                  textTransform: 'uppercase'
                }}
              >
                {action}
              </button>
            ))}
          </div>

          <h3>{tab === 'deposit' ? 'Deposit Collateral' : tab === 'borrow' ? 'Draw Credit' : tab === 'repay' ? 'Repay Debt' : tab === 'redraw' ? 'Redraw Capacity' : 'Withdraw Collateral'}</h3>
          <p>
            {tab === 'deposit' && 'Supply approved collateral to expand your reusable borrowing capacity.'}
            {tab === 'borrow' && 'Access instant on-chain liquidity up to the 75% max LTV limit.'}
            {tab === 'repay' && 'Repayment clears accrued interest first, then principal, immediately restoring credit.'}
            {tab === 'redraw' && 'Draw against previously repaid credit capacity from the same active position.'}
            {tab === 'withdraw' && 'Release eligible collateral while preserving required collateralization safety.'}
          </p>

          {tab === 'deposit' && (
            <div style={{
              background: 'var(--soft)',
              padding: '12px 14px',
              borderRadius: '8px',
              margin: '12px 0 16px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '12px'
            }}>
              <div style={{ fontSize: '11px', color: 'var(--ink)' }}>
                <strong>Need stBOT collateral?</strong>
                <div style={{ color: '#73736c', marginTop: '2px' }}>
                  Mint 10 stBOT ($20,000 value) instantly from the faucet.
                </div>
              </div>
              <button
                type="button"
                className="secondary"
                onClick={handleMintFaucet}
                disabled={!connected || loading}
                style={{
                  fontSize: '11px',
                  padding: '6px 12px',
                  whiteSpace: 'nowrap',
                  borderRadius: '14px',
                  background: 'var(--ink)',
                  color: '#fff',
                  cursor: !connected || loading ? 'not-allowed' : 'pointer'
                }}
              >
                Mint 10 stBOT
              </button>
            </div>
          )}

          <label>
            Asset
            <select value={asset} onChange={(e) => setAsset(e.target.value)}>
              <option value={protocolConfig.collateralSymbol}>{protocolConfig.collateralSymbol} (Verified)</option>
            </select>
          </label>

          <label>
            Amount
            <div className="amount">
              <input
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                inputMode="decimal"
                disabled={!connected || loading}
              />
              <span>{tab === 'deposit' || tab === 'withdraw' ? protocolConfig.collateralSymbol : protocolConfig.borrowSymbol}</span>
            </div>
          </label>

          <div className="estimate">
            <span>Estimated credit capacity</span>
            <b>{position?.active ? `${ethers.formatUnits(position.availableCredit, protocolConfig.borrowDecimals)} ${protocolConfig.borrowSymbol}` : '—'}</b>
          </div>
          <div className="estimate">
            <span>Origination fee (0.50%)</span>
            <b>{amount && parseFloat(amount) > 0 && (tab === 'borrow' || tab === 'redraw') ? `${(parseFloat(amount) * 0.005).toFixed(4)} ${protocolConfig.borrowSymbol}` : '0.00'}</b>
          </div>

          {errorMsg && (
            <p style={{ color: 'var(--red)', fontSize: '11px', marginTop: '14px', lineHeight: 1.4 }} role="alert">
              {errorMsg}
            </p>
          )}

          {txHash && (
            <div style={{ marginTop: '14px', fontSize: '11px', color: '#597d62' }}>
              Transaction submitted:{' '}
              <a
                href={`${chainConfig.explorerUrl}/tx/${txHash}`}
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: 'inherit', textDecoration: 'underline' }}
              >
                {txHash.slice(0, 10)}…{txHash.slice(-8)} ↗
              </a>
            </div>
          )}

          <button
            className="primary wide"
            onClick={connected ? handleAction : onConnect}
            disabled={loading}
          >
            {loading ? 'Submitting to BOT Chain…' : connected ? `${tab.toUpperCase()} ${amount ? amount : ''}` : 'Connect wallet to continue'}
          </button>
          <small className="note">Transactions are executed directly on BOT Chain (Chain ID: 677).</small>
        </div>
      </div>
    </section>
  )
}

function App() {
  const [view, setView] = useState<View>('overview')
  const [wallet, setWallet] = useState<WalletState>({
    address: null,
    chainId: null,
    error: null,
    connecting: false
  })
  const [position, setPosition] = useState<PositionData | null>(null)
  const [activities, setActivities] = useState<ActivityItem[]>([])

  const connect = async () => {
    if (!window.ethereum) {
      setWallet((w) => ({
        ...w,
        error: 'No compatible EVM wallet detected. Install MetaMask or BO Wallet.'
      }))
      return
    }
    setWallet((w) => ({ ...w, connecting: true, error: null }))
    try {
      const accounts = (await window.ethereum.request({
        method: 'eth_requestAccounts'
      })) as string[]
      const chainId = (await window.ethereum.request({
        method: 'eth_chainId'
      })) as string

      if (!accounts[0]) throw new Error('No wallet account was returned.')

      if (chainId.toLowerCase() !== chainConfig.hexId) {
        setWallet({
          address: accounts[0],
          chainId,
          error: `Connected to chain ${parseInt(chainId, 16)}. Switch to ${chainConfig.name} (${chainConfig.id}).`,
          connecting: false
        })
        return
      }

      setWallet({ address: accounts[0], chainId, error: null, connecting: false })
    } catch (error) {
      setWallet((w) => ({
        ...w,
        connecting: false,
        error: error instanceof Error ? error.message : 'Wallet connection was not completed.'
      }))
    }
  }

  const switchChain = async () => {
    if (!window.ethereum) return
    try {
      await window.ethereum.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: chainConfig.hexId }]
      })
    } catch (switchError: unknown) {
      const err = switchError as { code?: number }
      if (err.code === 4902) {
        await window.ethereum.request({
          method: 'wallet_addEthereumChain',
          params: [
            {
              chainId: chainConfig.hexId,
              chainName: chainConfig.name,
              nativeCurrency: chainConfig.nativeCurrency,
              rpcUrls: [chainConfig.rpcUrl],
              blockExplorerUrls: [chainConfig.explorerUrl]
            }
          ]
        })
      }
    }
  }

  // Fetch Position when wallet connected
  useEffect(() => {
    async function loadPosition() {
      if (!wallet.address || wallet.chainId?.toLowerCase() !== chainConfig.hexId) return
      if (!protocolConfig.vaultAddress || !window.ethereum) return

      try {
        const provider = new ethers.BrowserProvider(window.ethereum)
        const vault = new ethers.Contract(protocolConfig.vaultAddress, VAULT_ABI, provider)
        const p = await vault.getPositionOverview(wallet.address)
        setPosition({
          active: p.active,
          collateralAmount: p.collateralAmount,
          principalDebt: p.principalDebt,
          accruedInterest: p.accruedInterestPending,
          totalDebt: p.totalDebt,
          availableCredit: p.availableCredit,
          healthFactor: p.healthFactor,
          collateralPrice: p.collateralPrice,
          collateralValue: p.collateralValueInBorrowAsset
        })
      } catch (e) {
        console.error('Failed to load on-chain position:', e)
      }
    }
    loadPosition()
  }, [wallet.address, wallet.chainId])

  const go = (next: View) => {
    setView(next)
    document.getElementById(next)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const connected = Boolean(wallet.address && wallet.chainId?.toLowerCase() === chainConfig.hexId)

  return (
    <div className="shell">
      <header>
        <button className="brand" onClick={() => go('overview')}>
          <i>C</i>CreditRail
        </button>
        <nav>
          {(['overview', 'credit-lines', 'markets', 'activity', 'documentation'] as View[]).map(
            (item) => (
              <button
                className={view === item ? 'active' : ''}
                key={item}
                onClick={() => go(item)}
              >
                {item === 'credit-lines'
                  ? 'Credit Lines'
                  : item[0].toUpperCase() + item.slice(1)}
              </button>
            )
          )}
        </nav>
        <Wallet wallet={wallet} onConnect={connect} onSwitchChain={switchChain} />
      </header>

      <main>
        <section className="hero" id="overview">
          <div className="hero-copy">
            <label>ONCHAIN CREDIT INFRASTRUCTURE</label>
            <h1>
              Credit that moves at the <em>speed of capital.</em>
            </h1>
            <p>
              Open a collateral-backed revolving credit line, access liquidity when you need it, repay on your terms within protocol rules, and reuse your restored borrowing capacity.
            </p>
            <div className="actions">
              <button className="primary" onClick={() => go('credit-lines')}>
                Open a credit line <span>↗</span>
              </button>
              <button className="secondary" onClick={() => go('markets')}>
                Explore credit markets
              </button>
            </div>
            <div className="meta">
              <span>BUILT FOR REPEATABLE ACCESS</span>
              <span>BOT CHAIN / 677</span>
            </div>
          </div>
          <Position position={position} connected={connected} />
        </section>

        <section className="metrics">
          <div className="metric-head">
            <label>YOUR CREDIT OVERVIEW</label>
            <span>{connected ? 'BOT CHAIN CONNECTED' : 'WALLET NOT CONNECTED'}</span>
          </div>
          <div className="metric-grid">
            <Metric
              label="Total collateral"
              value={position?.active ? `${ethers.formatUnits(position.collateralAmount, protocolConfig.collateralDecimals)} ${protocolConfig.collateralSymbol}` : undefined}
              subtext={position?.active ? 'Pledged asset base' : 'Deposit required'}
            />
            <Metric
              label="Available credit"
              value={position?.active ? `${ethers.formatUnits(position.availableCredit, protocolConfig.borrowDecimals)} ${protocolConfig.borrowSymbol}` : undefined}
              subtext={position?.active ? 'Reusable capacity' : 'Enforced at 75% LTV'}
            />
            <Metric
              label="Outstanding borrowing"
              value={position?.active ? `${ethers.formatUnits(position.principalDebt, protocolConfig.borrowDecimals)} ${protocolConfig.borrowSymbol}` : undefined}
              subtext={position?.active ? 'Active principal' : 'Zero debt'}
            />
            <Metric
              label="Accrued interest"
              value={position?.active ? `${ethers.formatUnits(position.accruedInterest, protocolConfig.borrowDecimals)} ${protocolConfig.borrowSymbol}` : undefined}
              subtext={position?.active ? 'Accruing at 8% APR' : 'Continuous time-basis'}
            />
            <Metric
              label="Credit line health"
              value={position?.active ? (position.totalDebt === 0n ? '100%' : `${(Number(position.healthFactor) / 1e16).toFixed(0)}%`) : undefined}
              subtext={position?.active ? 'Liquidation threshold 80%' : 'Safe margins'}
            />
          </div>
        </section>

        <CreditLinesConsole
          connected={connected}
          onConnect={connect}
          position={position}
          wallet={wallet}
          onSuccessTx={(item) => setActivities((prev) => [item, ...prev])}
        />

        <section className="section" id="markets">
          <Heading
            eyebrow="CREDIT MARKETS"
            title="Parameters, not promises."
            copy="Markets are defined by the verified BOT Chain protocol configuration."
          />
          <div style={{ marginTop: '48px', overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--line)', color: '#888883', font: '9px "DM Mono", monospace' }}>
                  <th style={{ padding: '12px 16px' }}>COLLATERAL</th>
                  <th style={{ padding: '12px 16px' }}>BORROW ASSET</th>
                  <th style={{ padding: '12px 16px' }}>MAX LTV</th>
                  <th style={{ padding: '12px 16px' }}>LIQUIDATION THRESHOLD</th>
                  <th style={{ padding: '12px 16px' }}>BORROW APR</th>
                  <th style={{ padding: '12px 16px' }}>ORIGINATION FEE</th>
                  <th style={{ padding: '12px 16px' }}>ORACLE</th>
                </tr>
              </thead>
              <tbody>
                <tr style={{ borderBottom: '1px solid var(--line)', font: '400 16px Newsreader, serif' }}>
                  <td style={{ padding: '16px' }}><b>USDT / COL</b></td>
                  <td style={{ padding: '16px' }}>USDT (Tether)</td>
                  <td style={{ padding: '16px' }}>75.0%</td>
                  <td style={{ padding: '16px' }}>80.0%</td>
                  <td style={{ padding: '16px' }}>8.00%</td>
                  <td style={{ padding: '16px' }}>0.50%</td>
                  <td style={{ padding: '16px', fontSize: '12px', fontFamily: '"DM Mono", monospace' }}>Chainlink Compatible</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <section className="section" id="activity">
          <Heading
            eyebrow="ACTIVITY"
            title="A clear record of every move."
            copy="Deposits, draws, repayments, and withdrawals with real on-chain transaction hashes."
          />
          {activities.length === 0 ? (
            <Empty
              title="No activity recorded yet"
              copy="Transaction history will index here as you execute transactions on BOT Chain."
            />
          ) : (
            <div style={{ marginTop: '36px' }}>
              {activities.map((act) => (
                <div
                  key={act.id + act.timestamp}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '16px 0',
                    borderBottom: '1px solid var(--line)',
                    fontSize: '13px'
                  }}
                >
                  <div>
                    <span style={{ font: '9px "DM Mono", monospace', color: 'var(--red)', marginRight: '14px' }}>
                      {act.type}
                    </span>
                    <strong>{act.amount}</strong>
                  </div>
                  <div style={{ display: 'flex', gap: '20px', alignItems: 'center' }}>
                    <small style={{ color: '#888883' }}>{act.timestamp}</small>
                    <a
                      href={`${chainConfig.explorerUrl}/tx/${act.txHash}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ color: 'var(--ink)', textDecoration: 'none', font: '10px "DM Mono", monospace' }}
                    >
                      {act.txHash.slice(0, 8)}… ↗
                    </a>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="section docs" id="documentation">
          <Heading
            eyebrow="PROTOCOL NOTES"
            title="Designed for repeatable access to liquidity."
            copy="CreditRail separates collateral management from the timing of capital deployment."
          />
          <div className="doc-grid">
            <article>
              <span>01 / REVOLVING CAPACITY</span>
              <h3>Repayment restores credit immediately.</h3>
              <p>
                Unlike rigid loan products, CreditRail restores borrowing capacity as soon as principal debt is reduced, eliminating position recreation friction.
              </p>
            </article>
            <article>
              <span>02 / CONTINUOUS ACCOUNTING</span>
              <h3>Interest follows elapsed seconds.</h3>
              <p>
                Integer interest calculations accrue continuously and are immune to repeated intra-block manipulations. Repayments service accrued interest before principal.
              </p>
            </article>
            <article>
              <span>03 / RISK CONSTRAINTS</span>
              <h3>Conservative overcollateralization.</h3>
              <p>
                Strict 75% max LTV and 80% liquidation threshold margins ensure solvency, verified through strict oracle staleness boundaries.
              </p>
            </article>
          </div>
        </section>
      </main>

      {/* FOOTER - OFFICIAL BOT CHAIN & BOTSCAN CLICKABLE LINKS */}
      <footer>
        <div>
          <button className="brand" onClick={() => go('overview')}>
            <i>C</i>CreditRail
          </button>
          <p>Reusable revolving credit infrastructure on BOT Chain.</p>
        </div>
        <div>
          <span>PROTOCOL</span>
          <button onClick={() => go('credit-lines')}>Credit Lines</button>
          <button onClick={() => go('markets')}>Markets</button>
          <button onClick={() => go('activity')}>Activity</button>
          <button onClick={() => go('documentation')}>Documentation</button>
        </div>
        <div>
          <span>ECOSYSTEM</span>
          <a
            href={chainConfig.officialLinks.botchain}
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: '#a7a7a2', textDecoration: 'none', fontSize: '12px', padding: '4px 0', display: 'block' }}
          >
            botchain
          </a>
          <a
            href={chainConfig.officialLinks.botscan}
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: '#a7a7a2', textDecoration: 'none', fontSize: '12px', padding: '4px 0', display: 'block' }}
          >
            botscan
          </a>
          <a
            href={chainConfig.officialLinks.devDocs}
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: '#a7a7a2', textDecoration: 'none', fontSize: '12px', padding: '4px 0', display: 'block' }}
          >
            dev docs ↗
          </a>
        </div>
        <div>
          <span>NETWORK</span>
          <p>BOT Chain Mainnet (Chain ID: 677)</p>
          <small>© 2026 CreditRail</small>
        </div>
      </footer>
    </div>
  )
}

export default App
