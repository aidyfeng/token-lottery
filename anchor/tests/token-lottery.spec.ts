import * as anchor from '@coral-xyz/anchor';
import { Program } from '@coral-xyz/anchor';
import { TOKEN_PROGRAM_ID } from '@solana/spl-token';
import * as sb from "@switchboard-xyz/on-demand";
import { BN } from 'bn.js';
import { TokenLottery } from '../target/types/token_lottery';
import SwicthboardIDL from './on-demand-idl.json';

describe('token-lottery', () => {
  // Configure the client to use the local cluster.
  const provider = anchor.AnchorProvider.env()
  anchor.setProvider(provider);
  const wallet = provider.wallet as anchor.Wallet

  const program = anchor.workspace.TokenLottery as Program<TokenLottery>;

  let switchboardProgram = new anchor.Program(SwicthboardIDL as anchor.Idl,provider);
  const rngKp = anchor.web3.Keypair.generate();

  /* beforeAll(async () => {
    const switchboardIDL = await anchor.Program.fetchIdl(
      sb.ON_DEMAND_MAINNET_PID, 
      {connection: new anchor.web3.Connection("https://mainnet.helius-rpc.com/?api-key=792d0c03-a2b0-469e-b4ad-1c3f2308158c")}
    );
    switchboardProgram = new anchor.Program(switchboardIDL!, provider);
  }); */

  async function loadSbProgram(provider :anchor.Provider)  
    :Promise<anchor.Program>  {
    const sbProgramId = sb.ON_DEMAND_MAINNET_PID;
    const sbIdl = await anchor.Program.fetchIdl(sbProgramId, provider);
    const sbProgram = new anchor.Program(sbIdl!, provider);
    return sbProgram;
  }

  async function buyTicket() {
    const buyTicketIx = await program.methods.buyTicket().accounts({
      tokenProgram:TOKEN_PROGRAM_ID
    }).instruction();

    const computeIx = anchor.web3.ComputeBudgetProgram.setComputeUnitLimit({
      units:300000
    });

    const priorityIx = anchor.web3.ComputeBudgetProgram.setComputeUnitPrice({
      microLamports:1
    });


    const blockhashWithContext = await provider.connection.getLatestBlockhash();

    const tx = new anchor.web3.Transaction(
      {
        feePayer:provider.wallet.publicKey,
        blockhash:blockhashWithContext.blockhash,
        lastValidBlockHeight:blockhashWithContext.lastValidBlockHeight
      }
    )
    .add(buyTicketIx)
    .add(computeIx)
    .add(priorityIx);

    const signature = await anchor.web3.sendAndConfirmTransaction(
      provider.connection,
      tx,
      [wallet.payer],
      {skipPreflight:true}
    );

    console.log("Buy Ticket signature",signature);
  }

  it('should init', async () => {
    // Add your test here.
    const slot = await provider.connection.getSlot();
    const endSlot = slot + 20;


    const instruction = await program.methods.initializeConfig(
      new BN(slot),
      new BN(endSlot),
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
    // console.log('Your init config signature', tx);

    const signature = await anchor.web3.sendAndConfirmTransaction(provider.connection,tx,[wallet.payer],{skipPreflight:true})
    console.log("Your init config signature",signature);

    const initLotteryIx = await program.methods.initializeLottery().accounts({
      tokenProgram: TOKEN_PROGRAM_ID
    }).instruction();

    const initLotteryTx = new anchor.web3.Transaction(
      {
        feePayer:wallet.publicKey,
        blockhash:blockhashWithContext.blockhash,
        lastValidBlockHeight : blockhashWithContext.lastValidBlockHeight
      }
    ).add(initLotteryIx);

    const initLotterySignature = await anchor.web3.sendAndConfirmTransaction(
      provider.connection,
      initLotteryTx,
      [wallet.payer],
      {skipPreflight:true}
    );

    console.log("You Init Lottery Signature",initLotterySignature);

    await buyTicket();
    await buyTicket();
    await buyTicket();
    await buyTicket();
    await buyTicket();
    await buyTicket();

    const queue = new anchor.web3.PublicKey("A43DyUGA7s8eXPxqEjJY6EBu1KKbNgfxF8h17VAHn13w");
    /* const queueAccount = await sb.getDefaultQueue(
      program.provider.connection.rpcEndpoint
    ); */
    // console.log("program.provider.connection.rpcEndpoint",program.provider.connection.rpcEndpoint)
    const queueAccount = new sb.Queue(switchboardProgram, queue);
    console.log("Queue account", queueAccount.pubkey.toString());
    try {
      await queueAccount.loadData();
    } catch (err) {
      console.error("Queue not found, ensure you are using devnet in your env");
      process.exit(1);
    }

    const [randomness,createRandomnessIx] = await sb.Randomness.create(switchboardProgram,rngKp,queueAccount.pubkey);

    const createRandomnessTx = await sb.asV0Tx({
      connection: provider.connection,
      ixs: [createRandomnessIx],
      payer:wallet.publicKey,
      signers:[wallet.payer,rngKp]
    });

    const createRandomnessSignature = await provider.connection.sendTransaction(createRandomnessTx);

    let confirmed = false;

    while(!confirmed){
      try{
        const comfirmedRandomness = await provider.connection.getSignatureStatuses([createRandomnessSignature]);
        const randomessStatus = comfirmedRandomness.value[0];
        if(randomessStatus?.confirmations !=null &&
          randomessStatus.confirmationStatus === "confirmed"
        ){
          confirmed = true;
        }
      }catch(error){
        console.log("Error",error)
      }
    }

    console.log("Create Randomness Signature",createRandomnessSignature);

    const sbCommitIx = await randomness.commitIx(queue);

    const commitIx = await program.methods.commitRandomness().accounts({
      randomnessAccount : randomness.pubkey
    }).instruction();
    
    const commitComputeIx = anchor.web3.ComputeBudgetProgram.setComputeUnitLimit({
      units:100000
    });

    const commitPriorityIx = anchor.web3.ComputeBudgetProgram.setComputeUnitPrice({
      microLamports:1
    });

    const commitBlockhashWithContext = await provider.connection.getLatestBlockhash();

    const commitTx = new anchor.web3.Transaction(
      {
        feePayer: provider.wallet.publicKey,
        blockhash:commitBlockhashWithContext.blockhash,
        lastValidBlockHeight:commitBlockhashWithContext.lastValidBlockHeight
      }
    )
    .add(commitPriorityIx)
    .add(commitComputeIx)
    .add(sbCommitIx)
    .add(commitIx);

    const commitSignature = await anchor.web3.sendAndConfirmTransaction(
      provider.connection,commitTx,[wallet.payer]
    );

    console.log("commit signature",commitSignature);


    const sbRevealIx = await randomness.revealIx();

    const revealIx = await program.methods.revealWinner().accounts({
      randomnessAccount : randomness.pubkey
    }).instruction();

    const revealBlockhashWithContext = await provider.connection.getLatestBlockhash();

    const revealTx = new anchor.web3.Transaction({
      feePayer: provider.wallet.publicKey,
      blockhash:revealBlockhashWithContext.blockhash,
      lastValidBlockHeight:revealBlockhashWithContext.lastValidBlockHeight
    })
    .add(sbRevealIx)
    .add(revealIx);

    let currentSlot = 0;
    while(currentSlot < endSlot){
      const slot = await provider.connection.getSlot();
      if(slot > currentSlot){
        currentSlot = slot;
        console.log("Current slot", currentSlot);
      }
    }

    const revealSignature = await anchor.web3.sendAndConfirmTransaction(
      provider.connection,revealTx,[wallet.payer]
    );

    console.log("reveal signature",revealSignature);

    const claimIx = await program.methods.claimWinnings().accounts({
      tokenProgram : TOKEN_PROGRAM_ID
    }).instruction();

    const claimBlockhashWithContext = await provider.connection.getLatestBlockhash();

    const claimTx = new anchor.web3.Transaction({
      feePayer: provider.wallet.publicKey,
      blockhash:claimBlockhashWithContext.blockhash,
      lastValidBlockHeight:claimBlockhashWithContext.lastValidBlockHeight
    })
    .add(claimIx);

    const claimSignature = await anchor.web3.sendAndConfirmTransaction(
      provider.connection,claimTx,[wallet.payer]
    );

    console.log("claim signature",claimSignature);

  },3000000);
});
