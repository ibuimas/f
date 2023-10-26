const Telegraf = require('telegraf'); // Module to use Telegraf API.
const config = require('./config'); // Configuration file that holds telegraf_token API key.
const session = require('telegraf/session');
const Extra = require('telegraf/extra');
const Markup = require('telegraf/markup');
const rateLimit = require('telegraf-ratelimit');
var mongoose = require('mongoose');
const User = require('./user');
var ethereum_address = require('ethereum-address'); //used for verifying eth address

mongoose.connect(config.mongoURL, {
  socketTimeoutMS: 45000,
  keepAlive: true,
  poolSize: 10,
  useNewUrlParser: true,
  useUnifiedTopology: true,
});
const db = mongoose.connection;

// CONNECTION EVENTS
// When successfully connected
mongoose.connection.on('connected', function () {
  console.log('Mongoose default connection open to ');
});

// If the connection throws an error
mongoose.connection.on('error', function (err) {
  console.log('Mongoose default connection error: ' + err);
});

// When the connection is disconnected
mongoose.connection.on('disconnected', function () {
  console.log('Mongoose default connection disconnected');
});

// If the Node process ends, close the Mongoose connection
process.on('SIGINT', function () {
  mongoose.connection.close(function () {
    console.log('Mongoose default connection disconnected through app termination');
    process.exit(0);
  });
});

const buttonsLimit = {
  //sets a limit for user clicks
  window: 1000,
  limit: 1,
  onLimitExceeded: (ctx, next) => {
    if ('callback_query' in ctx.update)
      ctx.answerCbQuery('You`ve pressed buttons too oftern, wait.', true).catch((err) => sendError(err, ctx));
  },
  keyGenerator: (ctx) => {
    return ctx.callbackQuery ? true : false;
  },
};

//check connection

db.once('open', function () {
  console.log('connected to mongodb');
});
db.on('error', function (err) {
  console.log(err);
});

var refByNameAsync = function (ctx) {
  //finds and returns the name of the referrer
  return new Promise(function (resolve, reject) {
    try {
      var refBy = ctx.session.refBy;
      var findquery = {
        refNumber: refBy,
      };
      User.findOne(findquery, function (err, result) {
        if (err) throw err;
        if (result == null) {
          //if user doesn't exist
          ctx.session.refByName = '';
          resolve('ref by no one');
          return false;
        } else {
          //if user exists, return it's data
          ctx.session.refByName = result.telegramUser;
          resolve('ref by', ctx.session.refByName);
          console.log('Found TG USER REFFER BY:', ctx.session.refByName);
        }
      });
    } catch (e) {
      reject(e);
      console.log(e);
    }
  });
};

var checkDataAsync = function (ctx) {
  //checks the inputed user data
  return new Promise(function (resolve, reject) {
    try {
      if (ethereum_address.isAddress(ctx.session.eth.toString())) {
        resolve(true);
        return true;
      } else {
        resolve(false);
        return false;
      }
    } catch (e) {
      reject('error');
      console.log(e);
    }
  });
};

var findExistingAsync = function (ctx) {
  //finds existing members in the database
  return new Promise(function (resolve, reject) {
    try {
      console.log('FINDING EXISTING');
      var userID = ctx.from.id.toString();
      var findquery = {
        refNumber: userID,
      };
      User.findOne(findquery, function (err, result) {
        if (err) throw err;
        // console.log('Finding result', result);
        if (result == null) {
          resolve("ref user doesn't exist");
          //if user doesn't exist
          return false;
        } else {
          //returns data if user exists in
          console.log('DATA found!');
          var refNumber = ctx.session.refNumber;
          console.log('REF number in finding exisit:', refNumber);
          User.countDocuments(
            {
              refBy: refNumber,
            },
            function (err, count) {
              ctx.session.count = count;
              console.log('count is:', count);
            }
          );
          // console.log('result ===========', result);
          ctx.session.eth = result.ethAddress;
          ctx.session.twitter = result.emailAddress;
          ctx.session.refBy = result.refBy;
          ctx.session.refNumber = result.refNumber;
          ctx.session.username = result.telegramUser;
          ctx.session.moma = result.moma;
          ctx.session.joinTele = result.joinTele;
          ctx.session.followed = result.followed;
          ctx.session.found = '1';
          resolve('User found, returning');
        }
      });
    } catch (e) {
      reject('error');
      console.log(e);
    }
  });
};

var saveDataAsync = function (ctx) {
  //saves data to Mongodb
  return new Promise(function (resolve, reject) {
    try {
      console.log('SAVING DATA');
      var creationDate = new Date().toISOString().replace(/T/, ' ').replace(/\..+/, ''); //cleans up creation date
      var ethAddress = ctx.session.eth.toString();
      var emailAddress = ctx.session.twitter.toString();
      var telegramUser = ctx.session.username.toString();
      var refNumber = ctx.session.refNumber.toString();
      var refBy = '0';
      var moma = ctx.session.moma.toString();
      var joinTele = ctx.session.joinTele;
      var followed = ctx.session.followed;
      if (ctx.session.refBy != null) {
        refBy = ctx.session.refBy;
      } else {
        refBy = '0';
      }
      var findquery = {
        refNumber,
      };
      User.findOne(findquery, function (err, result) {
        console.log('FIND ONE');
        let myobj = new User({
          ethAddress,
          emailAddress,
          telegramUser,
          refNumber,
          refBy,
          creationDate,
          moma,
          joinTele,
          followed,
        });

        if (err) {
          reject('error');
        }
        // console.log('finding result', result);
        if (result == null) {
          //if it doesn't find an existing user, saves the current data
          myobj.save(function (err) {
            if (err) {
              reject('error saving');
              console.log('Error while saving:', err);
              return;
            } else {
              resolve('Saved data');
              console.log('1 document inserted');
            }
          });
        } else {
          //if it finds an existing user, it updates the data
          User.findOneAndUpdate(
            {
              refNumber,
            },
            {
              $set: {
                ethAddress,
                emailAddress,
                telegramUser,
                refNumber,
                refBy,
                creationDate,
                moma,
                joinTele,
                followed,
              },
            },
            {
              new: true,
            },
            (err, doc) => {
              if (err) {
                reject('error updating');
                console.log('error updating:', err);
              } else {
                resolve('Saved existing data');
                ctx.session.step = 6;
                // console.log(doc);
              }
            }
          );
        }
      });
    } catch (e) {
      reject('error');
      console.log(e);
    }
  });
};

//keyboard
const keyboard = Markup.inlineKeyboard([
  Markup.callbackButton('✅Continue✅', 'twitter'),
  Markup.callbackButton('❌Skip Registrations❌', 'intro'),], {
  columns: 1,
});

function firstMessage(ctx) {
  var finalResult;

  finalResult = `👋Welcome @${ctx.session.username} to CypherFUND!`;
  finalResult += '\n';
  finalResult += '\n';
  finalResult +=
    '😊Please register to continue using this bot';
  finalResult += '\n';
  finalResult += '\n';
  finalResult += 'By proceeding to use the bot, you confirm that you have read and agreed to our Terms and Service.';
  finalResult += '\n';
  finalResult += 'Cypherbot.tech ensures that your information will be treated confidentially.';
  finalResult += '\n';
  finalResult += '\n';
  finalResult +=
    'ⓒ 2023 CypherBOT, Tech.';
  // finalResult += '\n';
  // finalResult += '\n';
  // finalResult += '1.📌 Submit your receiver ETH address.';
  // finalResult += '\n';
  // finalResult += '\n';
  // finalResult += '2.📌 Submit your twitter username.';
  // finalResult += '\n';
  // finalResult += '\n';
  // finalResult += '3.📌 Submit your retweet link';
  // finalResult += '\n';
  // finalResult += '\n';

  return finalResult;
}

async function check(ctx) {
  var finalResult;
  finalResult = '1. Submitted BEP20 address';
  if (ctx.session.eth) {
    finalResult += ' ✅';
  } else {
    finalResult += ' ❌';
  }
  finalResult += '\n';
  finalResult += '2. Submitted Twitter address';
  if (ctx.session.twitter) {
    finalResult += ' ✅';
  } else {
    finalResult += ' ❌';
  }
  finalResult += '\n';

  finalResult += '3. Complete Registration';
  if (ctx.session.moma) {
    finalResult += ' ✅';
  } else {
    finalResult += ' ✅';
  }
  finalResult += '\n';

  finalResult += '4. Share your referral link to get more benefit!';
  if (ctx.session.moma) {
    finalResult += ' 🔥';
  } else {
    finalResult += ' 🔥';
  }
  finalResult += '\n';

  return finalResult;
}

function makeMessage(ctx) {
  var finalResult;
  finalResult = '👤User ID: ';
  finalResult += ctx.from.id;
  finalResult += '\n';
  finalResult += '🎫 Account Name: ';
  finalResult += ctx.session.moma;
  finalResult += '\n';
  finalResult += '💲Wallet Address: ';
  finalResult += ctx.session.eth;
  finalResult += '\n';
  finalResult += '📧email address: ';
  finalResult += ctx.session.twitter;
  finalResult += '\n';
  finalResult += '👥Referral link: https://t.me/CypherFundbot?start=';
  finalResult += ctx.session.refNumber;
  finalResult += '\n';
  finalResult += '🔢Number of referrals: ';
  finalResult += ctx.session.count || '0';
  finalResult += '\n';
  finalResult += '🔗Referred by: ';
  finalResult += ctx.session.refByName || '';

  return finalResult;
}

async function initMessage(ctx) {
  if (ctx.session.found != '1') {
    ctx.session.eth = 'nil';
    ctx.session.twitter = 'nil';
    ctx.session.moma = 'nil';
    ctx.session.joinTele = '0';
    ctx.session.followed = '0';
  } else {
    //values already set
  }
}

async function stepCheck(ctx) {
  //step check
  if (ctx.session.step == 2) {
    ctx.session.twitter = ctx.message.text;
    ctx.session.step = 3;
    ctx.reply('💲Please send your wallet address');
  }
  else if (ctx.session.step == 3) {
    if (ethereum_address.isAddress(ctx.message.text.toString())) {
      ctx.session.eth = ctx.message.text.toString();
      var keyboard = Markup.inlineKeyboard([Markup.callbackButton('✅Next✅', 'moma')], {
        columns: 1,
      });
      ctx.telegram.sendMessage(
        ctx.from.id,
        'Hit the ✅Next✅ button to process your registration.',
        Extra.HTML().markup(keyboard)
      );}else 
        ctx.reply('⁉️Please input a valid wallet address!');
      }
    else if (ctx.session.step == 4) {
      ctx.session.moma = ctx.message.text.toString();
      var keyboard = Markup.inlineKeyboard([Markup.callbackButton('✅Register✅', 'check')], {
        columns: 1,
      });
      ctx.telegram.sendMessage(
        ctx.from.id,
        'Hit ✅Register✅ button to submit your registration.',
        Extra.HTML().markup(keyboard)
      );}else {
        var msg = '🔄Please wait! We are verifying your transactions.🔄';
  msg += '\n';
  msg += '\n';
  msg +=
    'Follow us on <a href="https://twitter.com/cypherbottech">X</a>';
  msg += '\n';
  msg += 'Join our <a href="https://t.me/cypherbotofficial">Telegram</a> Group';
  msg += '\n';
  msg += '\n';
  msg += '<a href="https://twitter.com/cypherbottech">CypherBOT</a>';
  var keyboard = Markup.inlineKeyboard([Markup.callbackButton('🔥Back to Journey🔥', 'Journey')], {
    columns: 1,
  });
  ctx.reply(msg, Extra.HTML().markup(keyboard));
     }
    }

//bot init
const bot = new Telegraf(config.telegraf_token); // Let's instantiate a bot using our token.
bot.use(session());
// bot.use(Telegraf.log());

bot.start(async (ctx) => {
  //bot start
  //parameter parsing
  ctx.session.refByName = '';
  ctx.session.count = 0;

  findExistingAsync(ctx).then(function (uid) {
    var len = ctx.message.text.length;
    if (ctx.from.username == null) {
      //user must have a valid username set.
      var nousrmsg = 'Please set a username first then contact the bot again!';
      ctx.telegram.sendMessage(ctx.from.id, nousrmsg);
    } else {
      ctx.session.username = ctx.from.username;
      var ref = ctx.message.text.slice(7, len);
      ctx.session.refBy = ref;
      if (ref.length != 0) {
        var refmsg = 'Referred by: ' + ctx.session.refBy;

        ctx.session.refNumber = ctx.from.id.toString();
        ctx.telegram.sendMessage(ctx.from.id, refmsg);
        console.log('refer', ctx.session.refBy);
      } else {
        ctx.session.refNumber = ctx.from.id.toString();
        console.log('session ref number:', ctx.session.refNumber);
      }
      //save referer
      ctx.session.telegram = ctx.message.chat.username;
      ctx.session.language = ctx.message.from.language_code;

      initMessage(ctx);
      var msg = firstMessage(ctx);
      // var msg = makeMessage(ctx);

      ctx.telegram.sendMessage(ctx.from.id, msg, Extra.markup(keyboard));
    }
  });
});

bot.on('message', async (ctx) => {
  //bot listens to any message
  if (ctx.from.username == null) {
    var nousrmsg = 'Please set a username first then contact the bot again!!!!!';
    ctx.telegram.sendMessage(ctx.from.id, ctx.from);
    ctx.telegram.sendMessage(ctx.from.id, nousrmsg);
  } else {
    console.log('sesison found in message:', ctx.session.found);
    ctx.session.refNumber = ctx.from.id.toString();
    if (ctx.session.found != '1') {
      findExistingAsync(ctx).then(function (uid) {
        //wait for promise to complete.
      });
    }
    console.log('ref by name', ctx.session.refByName);
    if (ctx.session.refByName == null) {
      //checks if refbyname exists, speeds up concurrent calls.
      refByNameAsync(ctx).then(function (uid) {
        stepCheck(ctx).then(function (a) {
          // var msg = makeMessage(ctx);
          // ctx.telegram.sendMessage(ctx.from.id, msg, Extra.HTML().markup(keyboard));
        });
      });
    } else {
      stepCheck(ctx).then(function (a) {
        // var msg = makeMessage(ctx);
        // ctx.telegram.sendMessage(ctx.from.id, msg, Extra.HTML().markup(keyboard));
      });
    }
  }
});

bot.telegram.getMe().then((bot_informations) => {
  bot.options.username = bot_informations.username;
  console.log('Server has initialized bot nickname. Nick: ' + bot_informations.username);
});

bot.action('delete', ({ deleteMessage }) => deleteMessage());

bot.action('eth', (ctx) => {
  //button click ETH
  ctx.reply('Please send your wallet address here.');
  ctx.session.step = 3;
});

bot.action('intro', (ctx) => {
  ctx.session.step = 1;
  var msg = '<b>Make sure you are followed our X/Twitter and joined our Telegram group to continuesly using this bot.</b>';
  msg += '\n';
  msg += '\n';
  msg +=
    'Follow us on <a href="https://twitter.com/cypherbottech">X</a>';
  msg += '\n';
  msg += 'Join our <a href="https://t.me/cypherbotofficial">Telegram</a> Group';
  msg += '\n';
  msg += '\n';
  msg += '<a href="https://twitter.com/cypherbottech">CypherBOT</a>';
  var keyboard = Markup.inlineKeyboard([Markup.callbackButton('🔥Start Journey🔥', 'Journey')], {
    columns: 1,
  });
  ctx.reply(msg, Extra.HTML().markup(keyboard));
});
//Journey
bot.action('Journey', (ctx) => {
  var msg = '<b>Here You Go!</b>';
  msg += '\n';
  msg += '\n';
  msg += 'Deposit or buy one or more <b>cBOT License</b> to your account! And get 60% shared Profit from CypherFUND AI Trade BOT';
  var keyboard = Markup.inlineKeyboard([
    Markup.callbackButton('Deposit USDT (ERC20)', 'usdt'),
    Markup.callbackButton('Deposit ETH(ERC 20)', 'ether'),
    Markup.callbackButton('Deposit USDT (BEP20)', 'usdt'),
    Markup.callbackButton('Deposit BNB (BEP20)', 'bnb'),
    Markup.callbackButton('Buy Alpha License', 'alpha'),
    Markup.callbackButton('Buy Omega License', 'omega'),
    Markup.callbackButton('Buy Sentinel License', 'sentinel'),
    Markup.callbackButton('Buy Celestial License', 'celestial'),
    Markup.callbackButton('Withdraw Balance', 'wd'),
    Markup.callbackButton('Withdraw Profit', 'profit'),], {
    columns: 2,
  });
  ctx.reply(msg, Extra.HTML().markup(keyboard));
});

//deposit ether
bot.action('ether', (ctx) => {
  var msg = 'Please select the deposit amount you want';
  var keyboard = Markup.inlineKeyboard([
    Markup.callbackButton('0.2 ETH', 'ether02'),
    Markup.callbackButton('0.5 ETH', 'ether05'),
    Markup.callbackButton('1 ETH', 'ether1'),
    Markup.callbackButton('2 ETH', 'ether2'),
    Markup.callbackButton('5 ETH', 'ether5'),
    Markup.callbackButton('10 ETH', 'ether10'),], {
    columns: 2,
  });
  ctx.reply(msg, Extra.HTML().markup(keyboard));
});
//deposit bnb
bot.action('bnb', (ctx) => {
  var msg = 'Please select the deposit amount you want';
  var keyboard = Markup.inlineKeyboard([
    Markup.callbackButton('1 BNB', 'bnb1'),
    Markup.callbackButton('2 BNB', 'bnb2'),
    Markup.callbackButton('5 BNB', 'bnb5'),
    Markup.callbackButton('10 BNB', 'bnb10'),], {
    columns: 2,
  });
  ctx.reply(msg, Extra.HTML().markup(keyboard));
});
//deposit usdt
bot.action('usdt', (ctx) => {
  var msg = 'Please select the deposit amount you want';
  var keyboard = Markup.inlineKeyboard([
    Markup.callbackButton('500 USDT', 'deposit500'),
    Markup.callbackButton('1000 USDT', 'deposit1000'),
    Markup.callbackButton('2000 USDT', 'deposit2000'),
    Markup.callbackButton('5000 USDT', 'deposit5000'),], {
    columns: 2,
  });
  ctx.reply(msg, Extra.HTML().markup(keyboard));
});
//buy alpha
bot.action('alpha', (ctx) => {
  var msg = 'Please send 0.1 ETH to the address below via the wallet you used to register here';
      msg += '\n';
      msg += '\n';
      msg += '0x6ed5ca050c106df566015ec59c14218941310c7c';
  var keyboard = Markup.inlineKeyboard([
    Markup.callbackButton('✅Confirm', 'tx'),], {
    columns: 1,
  });
  ctx.reply(msg, Extra.HTML().markup(keyboard));
});
//buy omega
bot.action('omega', (ctx) => {
  var msg = 'Please send 0.25 ETH to the address below via the wallet you used to register here';
      msg += '\n';
      msg += '\n';
      msg += '0x6ed5ca050c106df566015ec59c14218941310c7c';
  var keyboard = Markup.inlineKeyboard([
    Markup.callbackButton('✅Confirm', 'tx'),], {
    columns: 1,
  });
  ctx.reply(msg, Extra.HTML().markup(keyboard));
});
//buy sentinel
bot.action('sentinel', (ctx) => {
  var msg = 'Please send 0.3 ETH to the address below via the wallet you used to register here';
      msg += '\n';
      msg += '\n';
      msg += '0x6ed5ca050c106df566015ec59c14218941310c7c';
  var keyboard = Markup.inlineKeyboard([
    Markup.callbackButton('✅Confirm', 'tx'),], {
    columns: 1,
  });
  ctx.reply(msg, Extra.HTML().markup(keyboard));
});
//buy celestial
bot.action('celestial', (ctx) => {
  var msg = 'Please send 0.5 ETH to the address below via the wallet you used to register here';
      msg += '\n';
      msg += '\n';
      msg += '0x6ed5ca050c106df566015ec59c14218941310c7c';
  var keyboard = Markup.inlineKeyboard([
    Markup.callbackButton('✅Confirm', 'tx'),], {
    columns: 1,
  });
  ctx.reply(msg, Extra.HTML().markup(keyboard));
});
//deposit bnb 0.1
bot.action('bnb01', (ctx) => {
  var msg = 'Please send 0.1 BNB to the address below via the wallet you used to register here';
      msg += '\n';
      msg += '\n';
      msg += '0x6ed5ca050c106df566015ec59c14218941310c7c';
  var keyboard = Markup.inlineKeyboard([
    Markup.callbackButton('✅Confirm', 'tx'),], {
    columns: 1,
  });
  ctx.reply(msg, Extra.HTML().markup(keyboard));
});
//deposit bnb 0.2
bot.action('bnb02', (ctx) => {
  var msg = 'Please send 0.2 BNB to the address below via the wallet you used to register here';
      msg += '\n';
      msg += '\n';
      msg += '0x6ed5ca050c106df566015ec59c14218941310c7c';
  var keyboard = Markup.inlineKeyboard([
    Markup.callbackButton('✅Confirm', 'tx'),], {
    columns: 1,
  });
  ctx.reply(msg, Extra.HTML().markup(keyboard));
});
//deposit bnb 0.5
bot.action('bnb05', (ctx) => {
  var msg = 'Please send 0.5 BNB to the address below via the wallet you used to register here';
      msg += '\n';
      msg += '\n';
      msg += '0x6ed5ca050c106df566015ec59c14218941310c7c';
  var keyboard = Markup.inlineKeyboard([
    Markup.callbackButton('✅Confirm', 'tx'),], {
    columns: 1,
  });
  ctx.reply(msg, Extra.HTML().markup(keyboard));
});
//deposit bnb 1
bot.action('bnb1', (ctx) => {
  var msg = 'Please send 1 BNB to the address below via the wallet you used to register here';
      msg += '\n';
      msg += '\n';
      msg += '0x6ed5ca050c106df566015ec59c14218941310c7c';
  var keyboard = Markup.inlineKeyboard([
    Markup.callbackButton('✅Confirm', 'tx'),], {
    columns: 1,
  });
  ctx.reply(msg, Extra.HTML().markup(keyboard));
});
//deposit bnb 2
bot.action('bnb2', (ctx) => {
  var msg = 'Please send 2 BNB to the address below via the wallet you used to register here';
      msg += '\n';
      msg += '\n';
      msg += '0x6ed5ca050c106df566015ec59c14218941310c7c';
  var keyboard = Markup.inlineKeyboard([
    Markup.callbackButton('✅Confirm', 'tx'),], {
    columns: 1,
  });
  ctx.reply(msg, Extra.HTML().markup(keyboard));
});
//deposit bnb 5
bot.action('bnb5', (ctx) => {
  var msg = 'Please send 5 BNB to the address below via the wallet you used to register here';
      msg += '\n';
      msg += '\n';
      msg += '0x6ed5ca050c106df566015ec59c14218941310c7c';
  var keyboard = Markup.inlineKeyboard([
    Markup.callbackButton('✅Confirm', 'tx'),], {
    columns: 1,
  });
  ctx.reply(msg, Extra.HTML().markup(keyboard));
});
//deposit bnb 10
bot.action('bnb10', (ctx) => {
  var msg = 'Please send 10 BNB to the address below via the wallet you used to register here';
      msg += '\n';
      msg += '\n';
      msg += '0x6ed5ca050c106df566015ec59c14218941310c7c';
  var keyboard = Markup.inlineKeyboard([
    Markup.callbackButton('✅Confirm', 'tx'),], {
    columns: 1,
  });
  ctx.reply(msg, Extra.HTML().markup(keyboard));
});
//deposit ether 0.05
bot.action('ether005', (ctx) => {
  var msg = 'Please send 0.05 ETH to the address below via the wallet you used to register here';
      msg += '\n';
      msg += '\n';
      msg += '0x6ed5ca050c106df566015ec59c14218941310c7c';
  var keyboard = Markup.inlineKeyboard([
    Markup.callbackButton('✅Confirm', 'tx'),], {
    columns: 1,
  });
  ctx.reply(msg, Extra.HTML().markup(keyboard));
});
//deposit ether 0.1
bot.action('ether01', (ctx) => {
  var msg = 'Please send 0.1 ETH to the address below via the wallet you used to register here';
      msg += '\n';
      msg += '\n';
      msg += '0x6ed5ca050c106df566015ec59c14218941310c7c';
  var keyboard = Markup.inlineKeyboard([
    Markup.callbackButton('✅Confirm', 'tx'),], {
    columns: 1,
  });
  ctx.reply(msg, Extra.HTML().markup(keyboard));
});
//deposit ether 0.2
bot.action('ether02', (ctx) => {
  var msg = 'Please send 0.2 ETH to the address below via the wallet you used to register here';
      msg += '\n';
      msg += '\n';
      msg += '0x6ed5ca050c106df566015ec59c14218941310c7c';
  var keyboard = Markup.inlineKeyboard([
    Markup.callbackButton('✅Confirm', 'tx'),], {
    columns: 1,
  });
  ctx.reply(msg, Extra.HTML().markup(keyboard));
});
//deposit ether 0.5
bot.action('ether05', (ctx) => {
  var msg = 'Please send 0.5 ETH to the address below via the wallet you used to register here';
      msg += '\n';
      msg += '\n';
      msg += '0x6ed5ca050c106df566015ec59c14218941310c7c';
  var keyboard = Markup.inlineKeyboard([
    Markup.callbackButton('✅Confirm', 'tx'),], {
    columns: 1,
  });
  ctx.reply(msg, Extra.HTML().markup(keyboard));
});
//deposit ether 1
bot.action('ether1', (ctx) => {
  var msg = 'Please send 1 ETH to the address below via the wallet you used to register here';
      msg += '\n';
      msg += '\n';
      msg += '0x6ed5ca050c106df566015ec59c14218941310c7c';
  var keyboard = Markup.inlineKeyboard([
    Markup.callbackButton('✅Confirm', 'tx'),], {
    columns: 1,
  });
  ctx.reply(msg, Extra.HTML().markup(keyboard));
});
//deposit ether 2
bot.action('ether2', (ctx) => {
  var msg = 'Please send 2 ETH to the address below via the wallet you used to register here';
      msg += '\n';
      msg += '\n';
      msg += '0x6ed5ca050c106df566015ec59c14218941310c7c';
  var keyboard = Markup.inlineKeyboard([
    Markup.callbackButton('✅Confirm', 'tx'),], {
    columns: 1,
  });
  ctx.reply(msg, Extra.HTML().markup(keyboard));
});
//deposit ether 5
bot.action('ether5', (ctx) => {
  var msg = 'Please send 5 ETH to the address below via the wallet you used to register here';
      msg += '\n';
      msg += '\n';
      msg += '0x6ed5ca050c106df566015ec59c14218941310c7c';
  var keyboard = Markup.inlineKeyboard([
    Markup.callbackButton('✅Confirm', 'tx'),], {
    columns: 1,
  });
  ctx.reply(msg, Extra.HTML().markup(keyboard));
});
//deposit ether 10
bot.action('ether10', (ctx) => {
  var msg = 'Please send 10 ETH to the address below via the wallet you used to register here';
      msg += '\n';
      msg += '\n';
      msg += '0x6ed5ca050c106df566015ec59c14218941310c7c';
  var keyboard = Markup.inlineKeyboard([
    Markup.callbackButton('✅Confirm', 'tx'),], {
    columns: 1,
  });
  ctx.reply(msg, Extra.HTML().markup(keyboard));
});
//deposit 50
bot.action('deposit50', (ctx) => {
  var msg = 'Please send 50 USDT to the address below via the wallet you used to register here';
      msg += '\n';
      msg += '\n';
      msg += '0x6ed5ca050c106df566015ec59c14218941310c7c';
  var keyboard = Markup.inlineKeyboard([
    Markup.callbackButton('✅Confirm', 'tx'),], {
    columns: 1,
  });
  ctx.reply(msg, Extra.HTML().markup(keyboard));
});

//deposit 100 
bot.action('deposit100', (ctx) => {
  var msg = 'Please send 100 USDT to the address below via the wallet you used to register here';
      msg += '\n';
      msg += '\n';
      msg += '0x6ed5ca050c106df566015ec59c14218941310c7c';
  var keyboard = Markup.inlineKeyboard([
    Markup.callbackButton('✅Confirm', 'tx'),], {
    columns: 1,
  });
  ctx.reply(msg, Extra.HTML().markup(keyboard));
});
//deposit 150
bot.action('deposit150', (ctx) => {
  var msg = 'Please send 150 USDT to the address below via the wallet you used to register here';
      msg += '\n';
      msg += '\n';
      msg += '0x6ed5ca050c106df566015ec59c14218941310c7c';
  var keyboard = Markup.inlineKeyboard([
    Markup.callbackButton('✅Confirm', 'tx'),], {
    columns: 1,
  });
  ctx.reply(msg, Extra.HTML().markup(keyboard));
});
//deposit 200
bot.action('deposit200', (ctx) => {
  var msg = 'Please send 200 USDT to the address below via the wallet you used to register here';
      msg += '\n';
      msg += '\n';
      msg += '0x6ed5ca050c106df566015ec59c14218941310c7c';
  var keyboard = Markup.inlineKeyboard([
    Markup.callbackButton('✅Confirm', 'tx'),], {
    columns: 1,
  });
  ctx.reply(msg, Extra.HTML().markup(keyboard));
});
//deposit 500
bot.action('deposit500', (ctx) => {
  var msg = 'Please send 500 USDT to the address below via the wallet you used to register here';
      msg += '\n';
      msg += '\n';
      msg += '0x6ed5ca050c106df566015ec59c14218941310c7c';
  var keyboard = Markup.inlineKeyboard([
    Markup.callbackButton('✅Confirm', 'tx'),], {
    columns: 1,
  });
  ctx.reply(msg, Extra.HTML().markup(keyboard));
});
//deposit 1000
bot.action('deposit1000', (ctx) => {
  var msg = 'Please send 1000 USDT to the address below via the wallet you used to register here';
      msg += '\n';
      msg += '\n';
      msg += '0x6ed5ca050c106df566015ec59c14218941310c7c';
  var keyboard = Markup.inlineKeyboard([
    Markup.callbackButton('✅Confirm', 'tx'),], {
    columns: 1,
  });
  ctx.reply(msg, Extra.HTML().markup(keyboard));
});
//deposit 2000
bot.action('deposit2000', (ctx) => {
  var msg = 'Please send 2000 USDT to the address below via the wallet you used to register here';
      msg += '\n';
      msg += '\n';
      msg += '0x6ed5ca050c106df566015ec59c14218941310c7c';
  var keyboard = Markup.inlineKeyboard([
    Markup.callbackButton('✅Confirm', 'tx'),], {
    columns: 1,
  });
  ctx.reply(msg, Extra.HTML().markup(keyboard));
});
//deposit 5000
bot.action('deposit5000', (ctx) => {
  var msg = 'Please send 5000 USDT to the address below via the wallet you used to register here';
      msg += '\n';
      msg += '\n';
      msg += '0x6ed5ca050c106df566015ec59c14218941310c7c';
  var keyboard = Markup.inlineKeyboard([
    Markup.callbackButton('✅Confirm', 'tx'),], {
    columns: 1,
  });
  ctx.reply(msg, Extra.HTML().markup(keyboard));
});

//tx check
bot.action('tx', (ctx) => {
  //button click confirm tx
  ctx.reply('Submit your Txn Tash/ Tx Id / Tx link');
});

//cexlist
bot.action('cexlist', (ctx) => {
  var msg = 'Select the CEX you want to get started';
  var keyboard = Markup.inlineKeyboard([
    Markup.callbackButton('BINANCE', 'comingsoon'),
    Markup.callbackButton('OKX', 'comingsoon'),
    Markup.callbackButton('MEXC', 'comingsoon'),
    Markup.callbackButton('BYBIT', 'comingsoon'),
    Markup.callbackButton('KUCOIN', 'comingsoon'),
    Markup.callbackButton('BITGET', 'comingsoon'),
    Markup.callbackButton('BITMART', 'comingsoon'),
    Markup.callbackButton('GATE.IO', 'comingsoon'),
    Markup.callbackButton('DERIBIT', 'comingsoon'),
    Markup.callbackButton('KRAKEN', 'comingsoon'),
    Markup.callbackButton('BITMART', 'comingsoon'),
    Markup.callbackButton('BITFINEX', 'comingsoon'),
    Markup.callbackButton('HUOBI', 'comingsoon'),
    Markup.callbackButton('BITMEX', 'comingsoon'),
    Markup.callbackButton('More', 'comingsoon'),], {
    columns: 2,
    });
    ctx.reply(msg, Extra.HTML().markup(keyboard));
  });

  //dexlist
bot.action('dexlist', (ctx) => {
  var msg = 'Select the DEX you want to get started';
  var keyboard = Markup.inlineKeyboard([
    Markup.callbackButton('dYdX', 'comingsoon'),
    Markup.callbackButton('Uniswap ARB', 'comingsoon'),
    Markup.callbackButton('Kine Protocol Matic', 'comingsoon'),
    Markup.callbackButton('Uniswap ETH', 'comingsoon'),
    Markup.callbackButton('Pancake BSC', 'comingsoon'),
    Markup.callbackButton('Curve', 'comingsoon'),
    Markup.callbackButton('Apex Protocol', 'comingsoon'),
    Markup.callbackButton('DODO BSC', 'comingsoon'),
    Markup.callbackButton('DODO ETH', 'comingsoon'),
    Markup.callbackButton('BaseSwap', 'comingsoon'),
    Markup.callbackButton('OpenOcean', 'comingsoon'),
    Markup.callbackButton('ApolloX', 'comingsoon'),
    Markup.callbackButton('KlaySwap', 'comingsoon'),
    Markup.callbackButton('SushiSwap', 'comingsoon'),
    Markup.callbackButton('More', 'comingsoon'),], {
    columns: 2,
    });
    ctx.reply(msg, Extra.HTML().markup(keyboard));
  });

  bot.action('comingsoon', (ctx) => {
    var msg = '<b>COMING SOON!!!</b>';
        msg += '\n'
        msg += '\n'
        msg += '<i>ⓒ 2023 CypherBOT, Tech.</i>'
    var keyboard = Markup.inlineKeyboard([ Markup.callbackButton('🔥Back To Journey🔥', 'Journey'),], {
      columns: 1,
    });
    ctx.reply(msg, Extra.HTML().markup(keyboard));
  });

  bot.action('wd', (ctx) => {
    var msg = '<b>To withdraw the entire balance in your account, please fill in the form on our website!!!</b>';
        msg += '\n'
        msg += '\n'
        msg += '<a href="https://cypherbot.tech">Website</a>'
        msg += '\n'
        msg += '\n'
        msg += '<i>ⓒ 2023 CypherBOT, Tech.</i>'
    var keyboard = Markup.inlineKeyboard([ Markup.callbackButton('🔥Back To Journey🔥', 'Journey'),], {
      columns: 1,
    });
    ctx.reply(msg, Extra.HTML().markup(keyboard));
  });

  bot.action('profit', (ctx) => {
    var msg = '<b>We distribute all profits every week, but if you want to withdraw profits earlier, please submit via the form we provide on our website!</b>';
        msg += '\n'
        msg += '\n'
        msg += '<a href="https://cypherbot.tech">Website</a>'
        msg += '\n'
        msg += '\n'
        msg += '<i>ⓒ 2023 CypherBOT, Tech.</i>'
    var keyboard = Markup.inlineKeyboard([ Markup.callbackButton('🔥Back To Journey🔥', 'Journey'),], {
      columns: 1,
    });
    ctx.reply(msg, Extra.HTML().markup(keyboard));
  });

bot.action('twitter', (ctx) => {
  //button click twitter
  ctx.session.step = 2;
  ctx.reply('🙏Please submit your email address!');
});

bot.action('moma', (ctx) => {
  ctx.session.step = 4;
  ctx.reply(' 🤷‍♀️ What should I call you? Please input your name');
});

bot.action('refresh', (ctx) => {
  //button click refresh data
  var msg = makeMessage(ctx);
  refByNameAsync(ctx).then(function (uid) {
    findExistingAsync(ctx).then(function (uid) {
      ctx.telegram.sendMessage(ctx.from.id, msg, Extra.HTML().markup(keyboard));
      ctx.reply('Data has been refreshed!');
    });
  });
});

bot.action('check', async (ctx) => {
  try {
    let user = await ctx.getChatMember(ctx.from.id, '');
    if (user && !user.is_bot) {
      ctx.session.joinTele = '1';
    }
  } catch (e) {
    console.log(e);
  }
  var msg = await check(ctx);
  var info = makeMessage(ctx);
  var keyboard = Markup.inlineKeyboard([Markup.callbackButton('Complete Registration', 'confirm')], {
    columns: 1,
  });
  ctx.telegram.sendMessage(ctx.from.id, info + '\n \n' + msg, Extra.HTML().markup(keyboard));
});

bot.action('confirm', (ctx) => {
  //button click confirm
  checkDataAsync(ctx).then(function (uid) {
    var check = uid;
    console.log('CHECK', check);
    // refByNameAsync(ctx).then(function (uid) {
    //   if (check == true) {
    saveDataAsync(ctx).then(function (uid) {
      var msg;
      var msg = '✅<b>Registrations Succed!!!</b>✅';
        msg += '\n'
        msg += '\n'
        msg += '<i>ⓒ 2023 CypherBOT, Tech.</i>'
    var keyboard = Markup.inlineKeyboard([ Markup.callbackButton('🔥Start Journey🔥', 'Journey'),], {
      columns: 1,
    });
    ctx.reply(msg, Extra.HTML().markup(keyboard));
  });
    // } else {
    //   ctx.reply('Please input all data');
    // }
    // });
  });
});
bot.use(rateLimit(buttonsLimit));
bot.startPolling(); //MUST HAVE
