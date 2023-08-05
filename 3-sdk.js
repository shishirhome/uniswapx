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

async function composeV3SwapCallData() {
    const config = {
        dexId: '1000',
        amountIn: web3.utils.toWei('10', 'ether'),
        amountOutMin: '0',
        path: [WETH, USDC],
        to: alicePublicKey,
        deadline: deadline.toString(),
        from: alicePublicKey,
        gas: '173376'
    };

    const axiosInstance = new axios.create({
        baseURL: testData.EXPAND_BASE_URL,
        timeout: 10000,
        headers: { 'X-API-KEY': testData.EXPAND_API_KEY },
    });
    const response = await axiosInstance.post('/dex/swap/', config);
    return response.data.data.data;

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
    const tokenContract = new web3.eth.Contract(abi, tokenAddress);
    const preapredTxn = tokenContract.methods.approve(to, '100000000000000000000000000000000000000000').encodeABI();
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
        .swapper(alicePublicKey)
        .decayEndTime(deadline)
        .decayStartTime(deadline - 100)
        .nonce(nonce)
        .input({
            token: WETH,
            startAmount: BigNumber.from('100000000000000000'),
            endAmount: BigNumber.from('100000000000000000'),
        })
        .output({
            token: USDC,
            startAmount: BigNumber.from('8000000'),
            endAmount: BigNumber.from('8000000'),
            recipient: alicePublicKey,
        })
        .build();
    const { domain, types, values } = order.permitData();
    const signature = await signer._signTypedData(domain, types, values);
    const serializedOrder = order.serialize();
    const data = reactorContract.methods.execute([serializedOrder, signature]).encodeABI();
    const n1 = await web3.eth.getTransactionCount(alicePublicKey, 'latest');
    const txn = {
        to: reactorAddress,
        maxFeePerGas: 210000000000,
        gasLimit: 1e7,
        data
    }
    const signedTxn = await web3.eth.accounts.signTransaction(txn, testData.bobPrivateKey);
    await web3.eth.sendSignedTransaction(signedTxn.rawTransaction, function (error, hash) {
        if (!error) { console.log("🎉 SUCCESS --> ", hash); }
        else { console.log("❗ ERROR --> ", error) }
    });
    console.log("Post Alice WETH ==> ", await getBalance(WETH, alicePublicKey));
    console.log("Post Alice USDC ==> ", await getBalance(USDC, alicePublicKey));
    console.log("Post Bob WETH ==> ", await getBalance(WETH, bobPublicKey));
    console.log("Post Bob USDC ==> ", await getBalance(USDC, bobPublicKey));
    // console.log("Post anyAddress USDC ==> ", await getBalance(USDC, testData.anyPublicKey));
}
init();

//https://etherscan.io/tx/0x9bea9d82dbdc1ca28d0d520380739c9238f4bdb0a1484c77613afc128b2a4539

//0x000000000000000000000000000000000000000000000000000000000000002000000000000000000000000000000000000000000000000000000000000001200000000000000000000000000000000000000000000000000000000064ce63e50000000000000000000000000000000000000000000000000000000064ce64490000000000000000000000008a66a74e15544db9688b68b06e116f5d19e5df900000000000000000000000000000000000000000000000000000000000002710000000000000000000000000c02aaa39b223fe8d0a0e5c4f27ead9083c756cc2000000000000000000000000000000000000000000000000000000000001869f000000000000000000000000000000000000000000000000000000000001869f00000000000000000000000000000000000000000000000000000000000002000000000000000000000000006000da47483062a0d734ba3dc7576ce6a0b645c400000000000000000000000093beb904abf2b2e6b640e4a178103454162b303000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000064ce6449000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000c000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000001000000000000000000000000a0b86991c6218b36c1d19d4a2e9eb0ce3606eb480000000000000000000000000000000000000000000000000de0b6b3a76400000000000000000000000000000000000000000000000000000c7d713b49da0000000000000000000000000000a900c63e2807fa2b3ad3c10fa6c4406424b71fba
//0x000000000000000000000000000000000000000000000000000000000000002000000000000000000000000000000000000000000000000000000000000001200000000000000000000000000000000000000000000000000000000064c5789a0000000000000000000000000000000000000000000000000000000064c578d60000000000000000000000002008b6c3d07b061a84f790c035c2f6dc11a0be700000000000000000000000000000000000000000000000000000000000000064000000000000000000000000c02aaa39b223fe8d0a0e5c4f27ead9083c756cc20000000000000000000000000000000000000000000000009e34ef99a77400000000000000000000000000000000000000000000000000009e34ef99a774000000000000000000000000000000000000000000000000000000000000000002000000000000000000000000006000da47483062a0d734ba3dc7576ce6a0b645c400000000000000000000000008a71425d495393dbf6cc96b271af43ee005c15e0468327269dbceba90aa5c424f4528af5af16238a1f1945ac3e1df9b7fa47a010000000000000000000000000000000000000000000000000000000064c578e2000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000c000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000001000000000000000000000000a0b86991c6218b36c1d19d4a2e9eb0ce3606eb4800000000000000000000000000000000000000000000000000000004ff9adf6600000000000000000000000000000000000000000000000000000004f7f10c7a00000000000000000000000008a71425d495393dbf6cc96b271af43ee005c15e