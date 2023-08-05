const { DutchOrder, DutchOrderBuilder, NonceManager } = require('@uniswap/uniswapx-sdk');
const { parseOrder, Order, OrderValidator } = require('@uniswap/uniswapx-sdk');
const { ethers, BigNumber } = require('ethers');
const Web3 = require('web3');
const axios = require('axios');
const abi = require('./ierc20.json').abi;
const wethAbi = require('./weth.json');
const web3 = new Web3('http://127.0.0.1:8545');
const currentEpochTime = Math.floor(Date.now() / 1000);
const deadline = currentEpochTime + 30 * 60;
const testData = require('./testData.json');
const WETH = testData.WETH;
const USDC = testData.USDC;
const alicePublicKey = testData.alicePublicKey;
const bobPublicKey = testData.bobPublicKey;
const alicePrivateKey = testData.alicePrivateKey;
const reactorAddress = testData.ExclusiveDutchOrderReactor;
const PERMIT2_ADDRESS = testData.Permit2Contract;
const provider = new ethers.providers.JsonRpcProvider('http://127.0.0.1:8545');
// const provider = new ethers.providers.JsonRpcProvider('https://mainnet.infura.io/v3/029dc9b6c7d54f8596253871d352c003');
const signer = new ethers.Wallet(alicePrivateKey, provider);
const wethContract = new web3.eth.Contract(wethAbi, WETH);
const reactorAbi = require('./reactor.json');
const reactorContract = new web3.eth.Contract(reactorAbi, reactorAddress);

const getBalance = async (tokenAddress, walletAddress) => {
    const tokenContract = new web3.eth.Contract(wethAbi, tokenAddress);
    const balance = await tokenContract.methods.balanceOf(walletAddress).call();
    const decimals = await tokenContract.methods.decimals().call();
    return balance / (10 ** decimals);
};

async function composeV3SwapCallData(){
    const config = {
        dexId: '1000',
        amountIn: web3.utils.toWei('10','ether'),
        amountOutMin: '0',
        path: [ WETH, USDC ],
        to: alicePublicKey,
        deadline: deadline.toString(),
        from: alicePublicKey,
        gas: '173376'
    };

    const axiosInstance = new axios.create({
        baseURL: testData.EXPAND_BASE_URL,
        timeout: 10000,
        headers: {'X-API-KEY': testData.EXPAND_API_KEY},
      });
    const response = await axiosInstance.post('/dex/swap/', config);
    return response.data.data.data ;

}

const signSendTxn = async (transactionObject, pvtkey) => {
    const signedTxn = await web3.eth.accounts.signTransaction(transactionObject, pvtkey);
    const txn = await web3.eth.sendSignedTransaction(signedTxn.rawTransaction);
    return txn;
};

async function executeOnChainTransaction(ethervalue, callData, to, signPrivateKey) {
    const value = web3.utils.toWei(ethervalue, 'ether');
    const rawTxn = { to, gas: 396296, maxFeePerGas: 44363475285, value, data: callData };
    const signedTx = await web3.eth.accounts.signTransaction(rawTxn, signPrivateKey);
    await web3.eth.sendSignedTransaction(signedTx.rawTransaction, function (error, hash) {
        if (!error) { console.log(`Transaction Success 🎉: ${hash} `) }
        else { console.log(`Transaction Fail ❗❗: ${error}`) }
    });

}

const approve = async (from, tokenAddress, pvtkey, to) => {
    // const preapredTxn = "0x095ea7b30000000000000000000000003fc91a3afd70395cd496c647d5a6cc9d4b2b7fad0000000000000000000000000000000000000000000000000000000000989680";
    const tokenContract = new web3.eth.Contract(abi, tokenAddress);
    const preapredTxn = tokenContract.methods.approve(to, '100000000000000000000000000000000000000000').encodeABI();
    //     const nonce = await web3.eth.getTransactionCount(from, 'latest');
    const txnObject = {
        // nonce,
        from,
        to: tokenAddress,
        data: preapredTxn,
        gas: 396296,
        maxFeePerGas: 44363475285
    };
    return (await signSendTxn(txnObject, pvtkey));
};


async function init() {

    // await executeOnChainTransaction('1000000','0x', alicePublicKey, testData.coordinatorPrivateKey) ;
    // await executeOnChainTransaction('100','0x', testData.coordinatorPublicKey, alicePrivateKey) ;
    // await executeOnChainTransaction('10','0x', bobPublicKey, alicePrivateKey) ;
    // let rawData = wethContract.methods.deposit().encodeABI();
    // await executeOnChainTransaction('10.8',rawData, WETH, alicePrivateKey) ;

    // let rawData = wethContract.methods.mint().encodeABI();
    // await executeOnChainTransaction('10.8',rawData, WETH, alicePrivateKey) ;

    // let v2rawData = await composeV2SwapCallData();
    // console.log(v3rawData)
    // await approve(alicePublicKey, WETH, alicePrivateKey, testData.V2Router);
    // await approve(alicePublicKey, USDC, alicePrivateKey, testData.V2Router);
    // await executeOnChainTransaction('0',v3rawData, testData.V2Router, alicePrivateKey) ;

    // await approve(bobPublicKey, WETH, testData.bobPrivateKey, reactorAddress);
    // await approve(bobPublicKey, USDC, testData.bobPrivateKey, reactorAddress);
    // await approve(bobPublicKey, WETH, testData.bobPrivateKey, PERMIT2_ADDRESS);
    // await approve(bobPublicKey, USDC, testData.bobPrivateKey, PERMIT2_ADDRESS);

    // console.log(`Alice ETH ==>  ${await web3.utils.fromWei(await web3.eth.getBalance(alicePublicKey))} `);
    console.log("Alice WETH ==> ", await getBalance(WETH, alicePublicKey));
    console.log("Alice USDC ==> ", await getBalance(USDC, alicePublicKey));
    console.log("Bob WETH ==> ", await getBalance(WETH, bobPublicKey));
    console.log("Bob USDC ==> ", await getBalance(USDC, bobPublicKey));
    const nonceMgr = new NonceManager(provider, 1, PERMIT2_ADDRESS);
    const nonce = await nonceMgr.useNonce(alicePublicKey);
    console.log(`Nonce------> ${nonce}`);

    const chainId = 1;
    const builder = new DutchOrderBuilder(chainId, reactorAddress, PERMIT2_ADDRESS);
    const order = builder
        .deadline(deadline)
        // .exclusiveFiller('0x8A66A74e15544db9688B68B06E116f5d19e5dF90', BigNumber.from('10000'))
        .swapper(alicePublicKey)
        .decayEndTime(deadline)
        .decayStartTime(deadline - 100)
        //  .nonce(BigNumber.from('1993351660969491307169335688154538091060514910170665156500039607055032809985'))
        .nonce(nonce)
        //  .nonFeeRecipient(alicePublicKey)
        .input({
            token: WETH,
            startAmount: BigNumber.from('100000000000000000'),
            endAmount: BigNumber.from('100000000000000000'),
        })
        .output({
            token: USDC,
            startAmount: BigNumber.from('800000'),
            endAmount: BigNumber.from('800000'),
            recipient: testData.coordinatorPublicKey,
        })
        // .additionalValidationContract(alicePublicKey)
        // .validation({
        //     additionalValidationContract: alicePublicKey,
        //     additionalValidationData: BigNumber.from('288818')
        // })
        .build();
    const { domain, types, values } = order.permitData();
    const signature = await signer._signTypedData(domain, types, values);
    const serializedOrder = order.serialize();
    // console.log(DutchOrder.parse(serializedOrder,1)) ;
    // console.log(order.info) ;
    // console.log(order.hash()) ;
    // console.log(serializedOrder)
    // const validator = new OrderValidator(provider, 1); 
    // const orderss  = {order, signature}; 
    // const r1 = await validator.validate(orderss); 
    // console.log(r1) ;

    const data = reactorContract.methods.execute([serializedOrder, signature]).encodeABI();
    const n1 = await web3.eth.getTransactionCount(alicePublicKey, 'latest') ;
    const txn = {
        to: reactorAddress,
        // nonce:  n1 + 1 ,
        // from: '0x2008b6c3D07B061A84F790C035c2f6dC11A0be70',
        maxFeePerGas: 210000000000,
        gasLimit: 1e7,
        data
    }
    // await web3.eth.sendTransaction(txn) ;
    const signedTxn = await web3.eth.accounts.signTransaction(txn, testData.bobPrivateKey);
    await web3.eth.sendSignedTransaction(signedTxn.rawTransaction, function (error, hash) {
        if (!error) { console.log("🎉 SUCCESS --> ", hash); }
        else { console.log("❗ ERROR --> ", error) }
    });

    // console.log(data) ;

    // console.log(`Post Alice ETH ==>  ${await web3.utils.fromWei(await web3.eth.getBalance(alicePublicKey))} `);
    console.log("Post Alice WETH ==> ", await getBalance(WETH, alicePublicKey));
    console.log("Post Alice USDC ==> ", await getBalance(USDC, alicePublicKey));
    console.log("Post Bob WETH ==> ", await getBalance(WETH, bobPublicKey));
    console.log("Post Bob USDC ==> ", await getBalance(USDC, bobPublicKey));
    console.log("Post cooordinator USDC ==> ", await getBalance(USDC, testData.coordinatorPublicKey));
}
init();

//https://etherscan.io/tx/0x9bea9d82dbdc1ca28d0d520380739c9238f4bdb0a1484c77613afc128b2a4539