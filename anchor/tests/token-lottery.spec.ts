import * as anchor from '@coral-xyz/anchor';
import { Program } from '@coral-xyz/anchor';
import { TokenLottery } from '../target/types/token_lottery';
import { BN } from 'bn.js';

describe('token-lottery', () => {
  // Configure the client to use the local cluster.
  const provider = anchor.AnchorProvider.env()
  anchor.setProvider(provider);
  const wallet = provider.wallet as anchor.Wallet

  const program = anchor.workspace.TokenLottery as Program<TokenLottery>;

  it('should init config', async () => {
    // Add your test here.
    const instruction = await program.methods.initializeConfig(
      new BN(0),
      new BN(1838071024737),
      new BN(10_000)
    ).instruction();

    const blockhashWithContext = await provider.connection.getLatestBlockhash();

    const tx = new anchor.web3.Transaction(
      {
        feePayer:wallet.publicKey,
        blockhash:blockhashWithContext.blockhash,
        lastValidBlockHeight : blockhashWithContext.lastValidBlockHeight
      }
    ).add(instruction);
    console.log('Your transaction signature', tx);

    const signature = await anchor.web3.sendAndConfirmTransaction(provider.connection,tx,[wallet.payer])
    console.log("Your transaction signature",signature);
  });
});
