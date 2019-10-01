const teemo = require("./teemo");
const dynamo = require("./dynamo");
const sumUtils = require("./summoner");
const league = require("./league");
const ddragonManager = require("./ddragonManager");
const fs = require('fs');

async function searchPlayer(req, res) {
  let sum = await teemo.searchSummoner(res.locals.name);

  if (sum == null) {
    res.render('404Sum');
    return;
  } else if(typeof sum.id == 'undefined') {
    res.render('error');
    return;
  }

  res.locals.sum = sum;
  await ddragonManager.manageProfileIcon(sum.profileIconId);


  sum.mainChampId = await teemo.getSumMain(sum.id); 

  let dbSum = await dynamo.getSumByAccountId(sum.id);

  if(dbSum == null) {
    dynamo.putNewSummoner(sum);
    res.render('first_time');
    return;
  } 

  sum.rank = dbSum.rank;
  sum.wins = parseInt(dbSum.wins);
  sum.loss = parseInt(dbSum.loss);
  let lastTime = sumUtils.getLastTimeStamp(dbSum) +1;

  if(lastTime == null) {
    res.render('error');
    return;
  }

  let matches = await teemo.getMatchList(sum.accountId, lastTime);
  sum.history = [];

  let unchanged = true; //no need to update the db
  if(matches.length > 0) {
    unchanged = false; //new games => need to update the db
    let newMatches = await teemo.processAllMatches(matches, sum);
  } 
  else if (dbSum.history.length == 0) {
    res.render('first_time');
    return;
  }

  if( !unchanged ) {
    dynamo.updateSum(sum);
  } 

  let match2print = dbSum.history.concat(sum.history);
  let l = match2print.length;
  if(l>20) {
    match2print = match2print.slice(l-19,l);
  }
  match2print.reverse();
  sum.history = match2print;


  res.locals.rankString = league.rank2string(sum.rank, res.locals.__)

  let iconDownloadPromises = [];
  sum.history.forEach(e => {
    iconDownloadPromises.push(ddragonManager.manageChampionIcon(e.championName));
  });
  await Promise.all(iconDownloadPromises);
  res.render('player');      
}



function updatePlayer(dbSum) {

  return new Promise( async (resolve, reject) => {

    let sum = await teemo.searchSummoner(dbSum.name);

    if (sum == null) {
      let message = new Date().toISOString() + ' - summoner not found';
      fs.writeFile('./logs/updatePlayerLogs', message, error => console.log('ERROR - can\'t log to updatePlayerLogs'));
      reject(console.log('couldn\'t update the player'));
    } else if(typeof sum.id == 'undefined') {
      let message = new Date().toISOString() + ' - an error occured with the teemo request';
      fs.writeFile('./logs/updatePlayerLogs', message, error => console.log('ERROR - can\'t log to updatePlayerLogs'));
      reject(console.log('couldn\'t update the player'));
    }


    sum.mainChampId = await teemo.getSumMain(sum.id); 

    sum.rank = dbSum.rank;
    sum.wins = parseInt(dbSum.wins);
    sum.loss = parseInt(dbSum.loss);
    let lastTime = sumUtils.getLastTimeStamp(dbSum) +1;

    if(lastTime == null) {
      let message = new Date().toISOString() + ' - lastTime == null within the row';
      fs.writeFile('./logs/updatePlayerLogs', message, error => console.log('ERROR - can\'t log to updatePlayerLogs'));
      return;
    }

    let matches = await teemo.getMatchList(sum.accountId, lastTime);
    sum.history = [];

    let unchanged = true; //no need to update the db
    if(matches.length > 0) {
      unchanged = false; //new games => need to update the db
      let newMatches = await teemo.processAllMatches(matches, sum);
    }

    if( !unchanged ) {
      resolve(await dynamo.updateSum(sum));
    }
  });
}



function updatePlayers() {
  
  return new Promise( async (resolve) => 
  {
    dbUsers = await dynamo.getAllUsers();
    
    updatePromises = [];

    dbUsers.forEach(e => {
      updatePromises.push(updatePlayer(e));
    });

    Promise.all(updatePromises).then(resolve());
  });
}

module.exports.updatePlayers = updatePlayers;
module.exports.searchPlayer = searchPlayer;