const { ethers } = require("ethers");
const testData =  require('./testData.json');
const { defaultAbiCoder } = require('ethers/lib/utils');
const { AllowanceTransfer, AllowanceProvider } = require('@uniswap/permit2-sdk');
const PERMIT2_ADDRESS = testData.Permit2Contract ;
const Web3 = require('web3');
const abi = require('./ierc20.json').abi;
const web3 = new Web3('http://localhost:8545');

const coordinatorPrivateKey = testData.coordinatorPrivateKey ;
const coordinatorPublicKey = testData.coordinatorPublicKey;
const alicePublicKey = testData.alicePublicKey ;
const alicePrivateKey = testData.alicePrivateKey;

const wethAbi = require('./weth.json');
const WETH = testData.WETH ;
const wethContract = new web3.eth.Contract(wethAbi, WETH);

const reactorAbi = require('./reactor.json');
const reactorAddress = testData.ExclusiveDutchOrderReactor ;
const reactorContract = new web3.eth.Contract(reactorAbi, reactorAddress);

const expiration = 1691124763;
const amountIn = 1838302;
const nonce = 0;
const uniswapRouterAddress = testData.UniversalRouter;
const USDC = testData.USDC ;
const DAI = testData.DAI ;
const EUROC = testData.EUROC ;
const provider = new ethers.providers.JsonRpcProvider('http://localhost:8545');
const signer = new ethers.Wallet(alicePrivateKey, provider);
const currentEpochTime = Math.floor(Date.now() / 1000);
const deadline = currentEpochTime + 30 * 60;

const createPermitSign = async() => {

    const allowanceProvider = new AllowanceProvider(provider,PERMIT2_ADDRESS);

    const nonceUSDCAlice = await allowanceProvider.getNonce(WETH,alicePublicKey,uniswapRouterAddress);
    // console.log('nonce value:', nonceUSDCAlice);

    const permit = {
        details: {
            token: WETH,
            amount: '1461501637330902918203684832716283019655932542975',
            expiration,
            nonce: nonceUSDCAlice
        },
        spender: uniswapRouterAddress,
        sigDeadline: deadline
    };

    const { domain, types, values } = AllowanceTransfer.getPermitData(permit,PERMIT2_ADDRESS,'1');

    const signature = await signer._signTypedData(domain, types, values);
    return ({permit, signature});
};

const decoder = async(data) => {
    const decodeParams = await web3.eth.abi.decodeParameters(
        ['bytes', 'bytes[]', 'uint256'],
        data
    );
    return decodeParams;
};

const encodePath = async(path, fees) => {

    if (path.length !== fees.length + 1) {
      throw new Error('path/fee lengths do not match');
    }
  
    let encoded = '0x';
    for (let i = 0; i < fees.length; i+=1) {
      encoded += path[i].slice(2);
      encoded += fees[i].toString(16).padStart(2 * 3, '0');
    }
    encoded += path[path.length - 1].slice(2);
  
    return encoded.toLowerCase();
};

const encodeFunctionData = async(options) => {
    // console.og(options.parameters);
    const params = web3.eth.abi.encodeParameters(
        options.parametersType, // ['address', 'uint256', 'uint256', 'bytes', 'bool']
        options.parameters  // [commands, [inputs, inputs2], deadline]
    );
    const data = options.functionHash + params.slice(2);
    return (data);

};

const prepareData = async(amountIn) => {

    // Permit2permit - 0a!!!
    // v3 swap - 00!!!
    const commands = '0x0a00';
    
    const PERMIT_STRUCT = '((address token,uint160 amount,uint48 expiration,uint48 nonce) details, address spender, uint256 sigDeadline)';
    const ABI_DEFINITION = [PERMIT_STRUCT, 'bytes'];

    const {permit, signature} = await createPermitSign();
    const inputs = defaultAbiCoder.encode(ABI_DEFINITION, [permit, signature]);

    // console.log(permit)
    // console.log(signature)
    // console.log(inputs)

    const encodedPath = await encodePath([WETH, USDC], [500]);
    const inputs2 = await web3.eth.abi.encodeParameters(
        ['address', 'uint256', 'uint256', 'bytes', 'bool'],
        ['0x0000000000000000000000000000000000000001', amountIn, 0, encodedPath, true]
    );

    const options = {
        parametersType: ['bytes', 'bytes[]', 'uint256'],
        parameters: [commands, [inputs, inputs2], deadline],
        functionHash: '0x3593564c'
    };
    const data = await encodeFunctionData(options);
    return data; 

};

async function executeOnChainTransaction(ethervalue, callData , to, signPrivateKey){
    const value = web3.utils.toWei(ethervalue, 'ether');
    const rawTxn = {to , gas: 396296, maxFeePerGas: 44363475285, value, data: callData} ;
    const signedTx = await web3.eth.accounts.signTransaction(rawTxn, signPrivateKey);
    await web3.eth.sendSignedTransaction(signedTx.rawTransaction, function (error, hash) {
        if (!error) { console.log(`Transaction Success 🎉: ${hash} `) }
        else { console.log(`Transaction Fail ❗❗: ${error}`) }
    });

}

const signSendTxn = async(transactionObject, pvtkey) => {
    const signedTxn = await web3.eth.accounts.signTransaction(transactionObject, pvtkey);
    const txn = await web3.eth.sendSignedTransaction(signedTxn.rawTransaction);
    return txn;
};

const approve = async(from, tokenAddress, pvtkey, to) => {
    // const preapredTxn = "0x095ea7b30000000000000000000000003fc91a3afd70395cd496c647d5a6cc9d4b2b7fad0000000000000000000000000000000000000000000000000000000000989680";
    const tokenContract = new web3.eth.Contract(abi,tokenAddress);
    const preapredTxn = tokenContract.methods.approve(to,'100000000000000000000000000000000000000000').encodeABI() ;
//     const nonce = await web3.eth.getTransactionCount(from, 'latest');
// console.log(nonce);
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

const getAllowance = async() => {

    const erc20Contract = new web3.eth.Contract(abi, USDC);
    const erc20TokenAllowance = await erc20Contract.methods.allowance(alicePublicKey, '0x000000000022D473030F116dDEE9F6B43aC78BA3').call();
    console.log(erc20TokenAllowance);

};

const getBalance = async(tokenAddress, walletAddress) => {
    const tokenContract = new web3.eth.Contract(abi,tokenAddress);
    const balance = await tokenContract.methods.balanceOf(walletAddress).call();
    return balance;
};

const init = async() => {

    // await executeOnChainTransaction('1000','0x', alicePublicKey, coordinatorPrivateKey) ;
    // await executeOnChainTransaction('10','0x', coordinatorPublicKey, alicePrivateKey) ;

    // await approve(alicePublicKey, WETH, alicePrivateKey,PERMIT2_ADDRESS);
    // await approve(alicePublicKey, WETH, alicePrivateKey, uniswapRouterAddress);
    // await approve(alicePublicKey, USDC, alicePrivateKey,PERMIT2_ADDRESS);
    // await approve(alicePublicKey, USDC, alicePrivateKey, uniswapRouterAddress);
    // await approve(alicePublicKey, EUROC, alicePrivateKey,PERMIT2_ADDRESS);
    // await approve(alicePublicKey, EUROC, alicePrivateKey, uniswapRouterAddress);
    // await approve(alicePublicKey, WETH, alicePrivateKey, testData.UniversalV3Router);
    // await approve(alicePublicKey, USDC, alicePrivateKey, testData.UniversalV3Router);
    // let rawData = wethContract.methods.deposit().encodeABI();
    // await executeOnChainTransaction('80',rawData, WETH, alicePrivateKey) ;

    // console.log(`Alice ETH ==>  ${await web3.utils.fromWei(await web3.eth.getBalance(alicePublicKey))} `);
    console.log("Alice WETH ==> ", await getBalance(WETH, alicePublicKey));
    console.log("Alice USDC ==> ", await getBalance(USDC, alicePublicKey));
    // console.log("Alice DAI ==> ", await getBalance(DAI, alicePublicKey));

    const data = await prepareData(10000000000);
    // console.log(data);
    const txnObject = {
        // from: alicePublicKey,
        to: uniswapRouterAddress,
        gas: 237576,
        data,
        maxFeePerGas: 7288432143,
        // maxPriorityFeePerGas: '32944146'
    };

    // console.log(await decoder(data.slice(10)));
    const txn = await signSendTxn(txnObject, alicePrivateKey);
    // console.log(txnObject);

    // console.log(`Post Alice ETH ==>  ${await web3.utils.fromWei(await web3.eth.getBalance(alicePublicKey))} `);
    console.log("Post Alice WETH ==> ", await getBalance(WETH, alicePublicKey));
    console.log("Post Alice USDC ==> ", await getBalance(USDC, alicePublicKey));
    // console.log("Post Alice DAI ==> ", await getBalance(DAI, alicePublicKey));

};

init();


// 0x000000000000000000000000c02aaa39b223fe8d0a0e5c4f27ead9083c756cc2000000000000000000000000ffffffffffffffffffffffffffffffffffffffff0000000000000000000000000000000000000000000000000000000064cc841b00000000000000000000000000000000000000000000000000000000000000070000000000000000000000003fc91a3afd70395cd496c647d5a6cc9d4b2b7fad0000000000000000000000000000000000000000000000000000000064c5ec5000000000000000000000000000000000000000000000000000000000000000e00000000000000000000000000000000000000000000000000000000000000041aedc803a4822cd3500750847bbad0a8e6a0098d352f01ac99de7930598f005cc1d799357b611031a85e41ab766ac9a5ee404703bbe089dfe9bc21da5dbc8d11f1c00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000000000002540be400000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000a00000000000000000000000000000000000000000000000000000000000000001000000000000000000000000000000000000000000000000000000000000002bc02aaa39b223fe8d0a0e5c4f27ead9083c756cc20001f4a0b86991c6218b36c1d19d4a2e9eb0ce3606eb48000000000000000000000000000000000000000000
// 0x000000000000000000000000000000000000000000000000000000000000002000000000000000000000000000000000000000000000000000000000000001200000000000000000000000000000000000000000000000000000000064c57a0a0000000000000000000000000000000000000000000000000000000064c57a460000000000000000000000002008b6c3d07b061a84f790c035c2f6dc11a0be7000000000000000000000000000000000000000000000000000000000000000640000000000000000000000002260fac5e5542a773aa44fbcfedf7c193bc2c599000000000000000000000000000000000000000000000000000000000016f204000000000000000000000000000000000000000000000000000000000016f20400000000000000000000000000000000000000000000000000000000000002000000000000000000000000006000da47483062a0d734ba3dc7576ce6a0b645c4000000000000000000000000a7152fad7467857dc2d4060fecaadf9f6b8227d304683223e6176c4ca9d8b3eff3b1b2bd379b89829300e6a471f88d9a373165010000000000000000000000000000000000000000000000000000000064c57a52000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000c0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000010000000000000000000000006b175474e89094c44da98b954eedeac495271d0f00000000000000000000000000000000000000000000001788fcf9652c0044c0000000000000000000000000000000000000000000000016b363848a2c2e7583000000000000000000000000a7152fad7467857dc2d4060fecaadf9f6b8227d3