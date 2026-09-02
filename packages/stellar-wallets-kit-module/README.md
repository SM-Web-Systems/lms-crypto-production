# @amma-wallet/stellar-wallets-kit-module

Amma Wallet module for [Stellar Wallets Kit](https://github.com/Creit-Tech/Stellar-Wallets-Kit). Enables any Stellar dApp to offer Amma Wallet as a wallet connection option.

## Installation

    npm install @amma-wallet/stellar-wallets-kit-module

## Usage

    import {
      StellarWalletsKit,
      WalletNetwork,
      FreighterModule,
    } from "@creit.tech/stellar-wallets-kit";
    import {
      AmmaWalletModule,
      AMMA_WALLET_ID,
    } from "@amma-wallet/stellar-wallets-kit-module";

    const kit = new StellarWalletsKit({
      network: WalletNetwork.TESTNET,
      selectedWalletId: AMMA_WALLET_ID,
      modules: [
        new AmmaWalletModule(),
        new FreighterModule(),
      ],
    });

## Features

- SEP-43 compatible - implements the full Stellar wallet standard
- Transaction signing - sign Stellar transactions via user approval popup
- Auth entry signing - sign Soroban authorization entries
- Message signing - sign arbitrary messages (SEP-53)
- Network detection - automatically detects the active network
- Auto-connect - prompts connection if not already connected

## How It Works

1. The Amma Wallet Chrome extension injects window.ammaWallet into web pages
2. This module wraps that provider to implement the Stellar Wallets Kit ModuleInterface
3. When a dApp calls signTransaction(), Amma Wallet opens an approval popup
4. The user reviews and approves/rejects - the signed XDR is returned to the dApp

## Requirements

- Amma Wallet Chrome Extension (https://ammawallet.com) installed
- @creit.tech/stellar-wallets-kit >= 1.0.0 as a peer dependency

## Links

- Amma Wallet: https://ammawallet.com
- GitHub: https://github.com/SM-Web-Systems/amma-wallet
- Stellar Wallets Kit: https://github.com/Creit-Tech/Stellar-Wallets-Kit

## License

MIT
