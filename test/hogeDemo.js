const Hoge = artifacts.require("HOGE");

let hogeVal = function (num) {
  if (typeof num == "string") {
    return num;
  } else {
    return num.toString() + "000000000";
  }
} 
let billion = 1000000000;
function randInt(max) {
  return Math.floor(Math.random() * max);
}

contract("Hoge Demonstration", async accounts => {
  it("demonstrates basic functions of HOGE", async () => {
    
  	const instance = await Hoge.deployed();

  	let deployer = accounts[0];
  	let burn = accounts[1];
  	let uniswap = accounts[2];
    
    let getBalance = async (account) => {
      return (await instance.balanceOf(account)).toString();
    } 

    let transfer = async (from, to, amt) => {
    	return await instance.transfer(to, hogeVal(amt), {from: from})
    }

    //Constructor mints 1 trillion tokens to deployer
    assert.equal(await getBalance(deployer), hogeVal(1000 * billion));

    //Deployer burns half
    await transfer(deployer, burn, 500 * billion);
    let deployerBalanceAfterBurn = await getBalance(deployer).toString();
    assert.equal(await getBalance(deployer), "505050505050505050505");

    //Deployer sends the rest to Uniswap
    //Notice it's more than 500b, because of reflection from the first transfer
    await transfer(deployer, uniswap, "505050505050505050505");

    //Here we see a small oddity due to rounding,
    //but otherwise the balances have evened out.
    //You can see this number on the blockchain in the Add LP txn:
    //https://etherscan.io/tx/0xef520e93ed71d632876836a4860bc2c2e4a858f0db1e99f64f666f7c600c3df7
    //"Supply 1 Ether And 499,999,999,999.999999999"
    assert.equal(await getBalance(burn), '499999999999999999999');
    assert.equal(await getBalance(uniswap), '499999999999999999999'); 

    //100 different addresses buy 1 billion from Uniswap
    for (i = 0; i < 100; i++) {
    	const tx = await transfer(uniswap, accounts[3+i], billion) ;
      //Gas usage is constant with no exclusions
      assert.ok(tx.receipt.gasUsed <= 72095);
      //Gas usage close to 72,xxx matches with EtherScan history
    }

    //10 addresses get excluded and the cost of gas to transfer goes up.
    for (i = 1; i < 10; i++) {
      await instance.excludeAccount(accounts[3+i]);
      const tx = await transfer(uniswap, accounts[103+i], billion) 
      //Gas usage is linear in number of exclusions
      assert.ok(tx.receipt.gasUsed <= 72095 + 8703 * i)
      assert.ok(tx.receipt.gasUsed >= 72095 + 8703 * (i - 1))
    }

    //Here we will choose a "Hero" account to pay attention to, even though
    //this test could be generalized. We watch the balance 
    //   * increase as other accounts churn 
    //   * decrease when an excluded address gets re-included
    //   * stay the same when an excluded address gets SAFELY RE-INCLUDED

    let heroAccount = accounts[104];
    let startingBalance = await getBalance(heroAccount);

    //Send a bunch of transactions and watch the balance go up each time.
    let previousBalance = startingBalance;
    for (i = 0; i < 100; i++) {
      let frm = accounts[3+randInt(100)]; //From excluded accounts
      let to = accounts[104+randInt(100)]; //Not to heroAccount
      const tx = await transfer(frm, to, 1000000) 
      let newBalance = await getBalance(heroAccount);
      assert.ok(newBalance > previousBalance);
      previousBalance = newBalance;
    }

    //Choose an excluded address with nonzero balance to reinclude
    let accountToReinclude = accounts[5];
    let balancePriorToReinclusion = await getBalance(accountToReinclude);
    assert.ok(balancePriorToReinclusion > 0);

    //Transfer balance out, to an unexcluded address
    await transfer(accountToReinclude, accounts[105], balancePriorToReinclusion);

    //Update hero's address
    previousBalance = await getBalance(heroAccount);

    //Reincluded account has a balance of 0
    let emptiedBalance = await getBalance(accountToReinclude);
    assert.ok(emptiedBalance == 0);

    //reinclusion leaves a residual balance
    await instance.includeAccount(accountToReinclude);
    let dustBalance = await getBalance(accountToReinclude);
    assert.ok(dustBalance > 0);

    //Reinclusion decreased hero's account balance
    newBalance = await getBalance(heroAccount);
    assert.ok(newBalance < previousBalance);

    //Reflecting the residual balance makes everything ok
    await instance.reflect(dustBalance, {from:accountToReinclude});
    newBalance = await getBalance(heroAccount);
    assert.ok(newBalance == previousBalance);


  });

});